import { readFileSync } from 'node:fs';

// This module is a local shape checker, not a wallet, executor or settlement verifier.
const deepFreeze = x => { if(x && typeof x === 'object') { Object.values(x).forEach(deepFreeze); Object.freeze(x); } return x; };
export const offers = deepFreeze(JSON.parse(readFileSync(new URL('./service-offers.json', import.meta.url), 'utf8')));
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
export function getOffer(id) {
  const found = offers.services.find(x => x.id === id);
  if (!found) throw new Error('UNKNOWN_SERVICE');
  return structuredClone(found);
}
const dateTime = v => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
const typeIs = (v,t) => t === 'object' ? record(v) : t === 'array' ? Array.isArray(v) : t === 'integer' ? Number.isSafeInteger(v) : t === 'number' ? typeof v === 'number' && Number.isFinite(v) : t === 'null' ? v === null : typeof v === t;

// Deliberately restricted to the schema keywords used in service-offers.json.
// Never substitute this for complete JSON Schema validation of an arbitrary schema.
export function matchesPinnedSchema(value, schema, depth = 0) {
  if (depth > 24 || !record(schema)) return false;
  const allowed = ['type','const','enum','properties','required','additionalProperties','items','format','pattern','minimum'];
  if (Object.keys(schema).some(k => !allowed.includes(k))) return false;
  if (Object.hasOwn(schema,'const') && !equal(value,schema.const)) return false;
  if (schema.enum && !schema.enum.some(x => equal(value,x))) return false;
  if (schema.type && !(Array.isArray(schema.type) ? schema.type : [schema.type]).some(t => typeIs(value,t))) return false;
  if (record(value)) {
    if (Object.keys(value).length > 1000 || (schema.required || []).some(k => !Object.hasOwn(value,k))) return false;
    for (const [k,v] of Object.entries(value)) {
      if (Object.hasOwn(schema.properties || {},k)) {
        if (!matchesPinnedSchema(v,schema.properties[k],depth+1)) return false;
      } else if (schema.additionalProperties === false) return false;
    }
  }
  if (Array.isArray(value) && (value.length > 10000 || (schema.items && !value.every(x => matchesPinnedSchema(x,schema.items,depth+1))))) return false;
  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) return false;
  if (typeof value === 'string') {
    if (value.length > 65536) return false;
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) return false;
    if (schema.format === 'date-time' && !dateTime(value)) return false;
    if (schema.format === 'uri') { try { new URL(value); } catch { return false; } }
  }
  return true;
}
export function readServiceResult(id, rawBody) {
  const spec = getOffer(id);
  let serialized;
  try { serialized = JSON.stringify(rawBody); } catch { throw new Error('INVALID_SERVICE_RESPONSE'); }
  if (!serialized || Buffer.byteLength(serialized) > 1048576 || !matchesPinnedSchema(rawBody,spec.response_schema)) throw new Error('INVALID_SERVICE_RESPONSE');
  if (id === 'fix-error' && (rawBody.network !== offers.payment_policy.network || rawBody.mode !== 'mainnet')) throw new Error('WRONG_RESPONSE_NETWORK');
  if (id === 'hyperxosist-query') {
    if (rawBody.payment.paid !== true || rawBody.payment.demo === true || rawBody.payment.bypass || rawBody.payment.network !== offers.payment_policy.network) throw new Error('NON_PRODUCTION_RESPONSE');
    const url = new URL(rawBody.searchUrl);
    if (url.origin !== 'https://x.com' || url.pathname !== '/search') throw new Error('UNEXPECTED_RESULT_URL');
  }
  if (id === 'summarize-url' && !['https:','http:'].includes(new URL(rawBody.url).protocol)) throw new Error('UNEXPECTED_RESULT_URL');
  // Returned command strings remain untrusted data; no command is executed.
  return structuredClone(spec.diagnostic_path ? rawBody[spec.diagnostic_path] : rawBody);
}
