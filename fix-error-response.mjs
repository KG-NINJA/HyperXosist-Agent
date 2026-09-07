/** Local shape checks only. Never signs, pays, fetches, logs the body or runs suggestions. */
export const RECEIPT_FIELDS = Object.freeze(['root_cause', 'next_command', 'retry_plan', 'risk_note', 'prevention_note', 'generated_at']);
export const RESPONSE_FIELDS = Object.freeze(['status', 'service', 'version', 'mode', 'network', 'real_revenue', 'input_received', 'request_id', 'revenue_proof_log', 'durable_revenue_log', 'post_payment_retry_path', 'receipt']);
const BOOL_FIELDS = ['real_revenue', 'input_received', 'durable_revenue_log'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keysEqual = (value, keys) => record(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
export function isFixErrorReceipt(value) {
  return keysEqual(value, RECEIPT_FIELDS) && RECEIPT_FIELDS.filter(k => k !== 'retry_plan').every(k => typeof value[k] === 'string') &&
    Array.isArray(value.retry_plan) && value.retry_plan.every(x => typeof x === 'string') &&
    /^\d{4}-\d\d-\d\dT/.test(value.generated_at) && Number.isFinite(Date.parse(value.generated_at));
}
export function isFixErrorPaidResponse(value) {
  return keysEqual(value, RESPONSE_FIELDS) && value.status === 'paid' && value.network === 'eip155:8453' &&
    RESPONSE_FIELDS.filter(k => k !== 'receipt' && !BOOL_FIELDS.includes(k)).every(k => typeof value[k] === 'string') &&
    BOOL_FIELDS.every(k => typeof value[k] === 'boolean') && isFixErrorReceipt(value.receipt);
}
export function readFixErrorReceipt(rawApiBody) {
  if (!isFixErrorPaidResponse(rawApiBody)) throw new Error('INVALID_FIX_ERROR_RESPONSE');
  // A new object prevents callers from mutating the stored response evidence.
  return structuredClone(rawApiBody.receipt);
}
