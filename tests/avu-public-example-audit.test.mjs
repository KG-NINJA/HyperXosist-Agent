import test from 'node:test';
import assert from 'node:assert/strict';
import { auditManifest, BASELINE as B } from '../scripts/avu-public-example-audit.mjs';

function fixture() {
  return { x402Version: 2, payment_mode: 'x402', simulation: false, resources:
    ['/verify-evidence', '/mcp'].map(suffix => {
      const policy = { policy_version: B.policyVersion, max_amount_atomic: B.amount,
        network: B.network, asset: B.asset, pay_to: B.payTo };
      const intent = { spend_policy: policy };
      return { resource: B.origin + suffix, method: 'POST', accepts: [{ scheme: B.scheme,
        network: B.network, asset: B.asset, amount: B.amount, payTo: B.payTo,
        extra: { policyVersion: B.policyVersion, precheckRequired: true, bindingRequired: true } }],
        extensions: { bazaar: { info: {
          input: suffix === '/mcp' ? { type: 'mcp', toolName: 'verify_evidence', example: { intent } }
            : { type: 'http', body: intent },
          output: { example: { receipt: { paid_verification_binding: { network: B.network,
            asset: B.asset, pay_to: B.payTo, quoted_amount_atomic: B.amount, price_cap_atomic: B.amount } } } }
        } } } };
    }) };
}
// Synthetic, minimized fixtures: never transactions or production proof.
test('consistent mainnet HTTP and MCP examples pass', () => assert.equal(auditManifest(fixture()).passed, true));
test('Sepolia policy inside mainnet HTTP example fails', () => {
  const m = fixture(); m.resources[0].extensions.bazaar.info.input.body.spend_policy.network = 'eip155:84532';
  assert.equal(auditManifest(m).passed, false);
});
test('Sepolia asset fails', () => {
  const m = fixture(); m.resources[0].extensions.bazaar.info.input.body.spend_policy.asset = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
  assert.equal(auditManifest(m).passed, false);
});
test('dummy MCP recipient fails', () => {
  const m = fixture(); m.resources[1].extensions.bazaar.info.input.example.intent.spend_policy.pay_to = '0x0000000000000000000000000000000000000001';
  assert.equal(auditManifest(m).passed, false);
});
test('stale output binding fails independently of corrected input', () => {
  const m = fixture(); m.resources[0].extensions.bazaar.info.output.example.receipt.paid_verification_binding.network = 'eip155:84532';
  assert.equal(auditManifest(m).passed, false);
});
test('changed live recipient is not silently trusted', () => {
  const m = fixture(); m.resources[0].accepts[0].payTo = '0x1111111111111111111111111111111111111111';
  assert.equal(auditManifest(m).passed, false);
});
test('missing resource fails closed', () => {
  const m = fixture(); m.resources.pop(); assert.equal(auditManifest(m).passed, false);
});
test('ambiguous multiple offers fail closed', () => {
  const m = fixture(); m.resources[0].accepts.push(structuredClone(m.resources[0].accepts[0]));
  assert.equal(auditManifest(m).passed, false);
});
test('amount/cap mismatch fails', () => {
  const m = fixture(); m.resources[0].extensions.bazaar.info.input.body.spend_policy.max_amount_atomic = '999999';
  assert.equal(auditManifest(m).passed, false);
});
test('disabling precheck or binding is not accepted as a repair', () => {
  for (const field of ['precheckRequired', 'bindingRequired']) {
    const m = fixture(); m.resources[0].accepts[0].extra[field] = false;
    assert.equal(auditManifest(m).passed, false);
  }
});
test('address hex case does not change identity', () => {
  const m = fixture(); m.resources[0].extensions.bazaar.info.input.body.spend_policy.asset = B.asset.toLowerCase();
  assert.equal(auditManifest(m).passed, true);
});
test('a pass never claims settlement, delivery or spending authority', () => {
  const r = auditManifest(fixture());
  assert.equal(r.provesSettlement, false); assert.equal(r.provesDelivery, false); assert.equal(r.authorizesPayment, false);
});
test('malformed document fails without crashing', () => assert.equal(auditManifest(null).passed, false));
