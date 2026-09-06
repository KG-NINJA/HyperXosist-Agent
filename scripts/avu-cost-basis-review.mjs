import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { canonicalDigest } from '../avu-buyer.mjs';

const PRICING_SOURCE = 'https://docs.cdp.coinbase.com/x402/seller/facilitator';
const pricingFields = ['schemaVersion', 'source', 'checkedAt', 'monthlyFreeOnchainTransactions',
  'additionalOnchainTransactionUsd', 'paymentVerificationUsd', 'feeCapMicrousd'];

function pricingEvidence(value, now) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).sort().join() !== [...pricingFields].sort().join() ||
      value.schemaVersion !== 'coinbase-cdp-facilitator-pricing-review/1.0' || value.source !== PRICING_SOURCE ||
      value.monthlyFreeOnchainTransactions !== 1000 || value.additionalOnchainTransactionUsd !== '0.001' ||
      value.paymentVerificationUsd !== '0' || value.feeCapMicrousd !== 1000) {
    throw new Error('Complete current facilitator pricing evidence is required; a timestamp alone is not cost evidence.');
  }
  const reviewed = Date.parse(value.checkedAt);
  if (!Number.isFinite(reviewed) || reviewed > now || now - reviewed >= 86400000) {
    throw new Error('Recheck official facilitator pricing; review evidence must be less than 24 hours old.');
  }
  return { value: structuredClone(value), reviewed };
}

// Prints SQL for operator review. No network, Wrangler, DB execution or writes.
export function reviewCostBasis(row, evidence, now = Date.now()) {
  if (!row || row.control_id !== 1 || ![0, 1].includes(row.service_enabled) ||
      !Number.isSafeInteger(row.price_microusd) || row.price_microusd <= 0 ||
      !Number.isSafeInteger(row.facilitator_fee_cap_microusd) || row.facilitator_fee_cap_microusd < 0 ||
      typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at)) ||
      !(row.facilitator_fee_basis_updated_at === null ||
        (typeof row.facilitator_fee_basis_updated_at === 'string' && Number.isFinite(Date.parse(row.facilitator_fee_basis_updated_at))))) {
    throw new Error('A current, complete runtime_controls control_id=1 row is required.');
  }
  const pricing = pricingEvidence(evidence, now);
  if (row.price_microusd <= pricing.value.feeCapMicrousd) {
    throw new Error('Current service price must exceed the reviewed per-settlement facilitator fee cap.');
  }
  const literal = value => value === null ? 'NULL' : typeof value === 'number' ? String(value) : `'${value.replaceAll("'", "''")}'`;
  const guardFields = ['facilitator_fee_cap_microusd', 'facilitator_fee_basis_updated_at', 'updated_at', 'service_enabled', 'price_microusd'];
  const sourceTime = new Date(pricing.reviewed).toISOString();
  return `-- Review only. Run after the operator approves this exact SQL.\n` +
    `-- Pricing source: ${PRICING_SOURCE}\n` +
    `-- Evidence digest: ${canonicalDigest(pricing.value)}\n` +
    `-- Basis: first 1000 monthly onchain transactions free; then USD 0.001 each; payment verification free.\n` +
    `-- Checked at: ${sourceTime}; this statement refuses execution after 24 hours.\n` +
    `UPDATE runtime_controls\nSET facilitator_fee_cap_microusd = ${pricing.value.feeCapMicrousd},\n` +
    `    facilitator_fee_basis_updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),\n` +
    `    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')\n` +
    `WHERE control_id = 1\n` + guardFields.map(field => `  AND ${field} IS ${literal(row[field])}`).join('\n') + '\n' +
    `  AND julianday('now') - julianday(${literal(sourceTime)}) >= 0\n` +
    `  AND julianday('now') - julianday(${literal(sourceTime)}) < 1\n` +
    `RETURNING control_id, facilitator_fee_cap_microusd, facilitator_fee_basis_updated_at, updated_at, service_enabled, price_microusd;\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== '--row' || args[2] !== '--pricing-evidence') {
      throw new Error('Usage: node scripts/avu-cost-basis-review.mjs --row current-row.json --pricing-evidence reviewed-pricing.json');
    }
    process.stdout.write(reviewCostBasis(JSON.parse(readFileSync(args[1], 'utf8')), JSON.parse(readFileSync(args[3], 'utf8'))));
  } catch (error) {
    console.error(error.message); process.exitCode = 2;
  }
}
