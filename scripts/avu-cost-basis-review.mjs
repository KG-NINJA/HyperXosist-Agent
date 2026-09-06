import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Prints SQL for operator review. No network, Wrangler, DB execution or writes.
export function reviewCostBasis(row, feeCheckedAt, now = Date.now()) {
  if (!row || row.control_id !== 1 || ![0, 1].includes(row.service_enabled) ||
      !Number.isSafeInteger(row.price_microusd) || row.price_microusd <= 0 ||
      !Number.isSafeInteger(row.facilitator_fee_cap_microusd) || row.facilitator_fee_cap_microusd < 0 ||
      typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at)) ||
      !(row.facilitator_fee_basis_updated_at === null ||
        (typeof row.facilitator_fee_basis_updated_at === 'string' && Number.isFinite(Date.parse(row.facilitator_fee_basis_updated_at))))) {
    throw new Error('A current, complete runtime_controls control_id=1 row is required.');
  }
  const reviewed = Date.parse(feeCheckedAt);
  if (!Number.isFinite(reviewed) || reviewed > now || now - reviewed >= 86400000) {
    throw new Error('Recheck official facilitator pricing; review evidence must be less than 24 hours old.');
  }
  const literal = value => value === null ? 'NULL' : typeof value === 'number' ? String(value) : `'${value.replaceAll("'", "''")}'`;
  const guardFields = ['facilitator_fee_cap_microusd', 'facilitator_fee_basis_updated_at', 'updated_at', 'service_enabled', 'price_microusd'];
  const sourceTime = new Date(reviewed).toISOString();
  return `-- Review only. Run after the operator approves this exact SQL.\n` +
    `-- Pricing source: https://docs.cdp.coinbase.com/x402/seller/facilitator\n` +
    `-- Checked at: ${sourceTime}; this statement refuses execution after 24 hours.\n` +
    `UPDATE runtime_controls\nSET facilitator_fee_cap_microusd = 1000,\n` +
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
    if (args.length !== 4 || args[0] !== '--row' || args[2] !== '--fee-checked-at') {
      throw new Error('Usage: node scripts/avu-cost-basis-review.mjs --row current-row.json --fee-checked-at <UTC ISO time>');
    }
    process.stdout.write(reviewCostBasis(JSON.parse(readFileSync(args[1], 'utf8')), args[3]));
  } catch (error) {
    console.error(error.message); process.exitCode = 2;
  }
}
