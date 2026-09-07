import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const recipe = JSON.parse(read('fix-error-quickstart.json'));
const guide = read('docs/BUY_FIX_ERROR.md');
const growth = read('docs/BAZAAR_GROWTH.md');
const fields = ['root_cause', 'next_command', 'retry_plan', 'risk_note', 'prevention_note', 'generated_at'];

// Offline contract regression tests, not a live API or wallet compatibility test.
test('existing resource identity is unchanged', () => {
  assert.equal(recipe.resource, 'https://api.kgninja.dev/fix-error');
  assert.equal(recipe.method, 'POST');
  assert.equal(recipe.source_of_truth, 'https://api.kgninja.dev/openapi.json');
  assert.equal(recipe.scope.avu_required, false);
});
test('description is usable and within the documented Bazaar limit', () => {
  assert.ok(recipe.description.length > 100 && recipe.description.length <= 500);
  assert.match(recipe.description, /rule-based/);
  assert.match(recipe.description, /no code execution/);
  assert.match(recipe.description, /free preview/);
});
test('the free/local path remains available', () => {
  assert.equal(recipe.free_preview, 'https://api.kgninja.dev/fix-error/preview');
  assert.equal(recipe.scope.prefer_local_when_sufficient, true);
  assert.match(guide, /local debugger/);
});
test('three useful requests conform to the recorded request contract', () => {
  assert.equal(recipe.request_examples.length, 3);
  assert.equal(recipe.request_schema.additionalProperties, false);
  assert.deepEqual(Object.keys(recipe.request_schema.properties), ['command', 'error', 'log', 'environment']);
  for (const { request } of recipe.request_examples) {
    assert.ok(request.command.trim() && request.error.trim());
    for (const [key, value] of Object.entries(request)) {
      assert.equal(recipe.request_schema.properties[key]?.type, 'string');
      assert.equal(typeof value, 'string');
    }
  }
});
test('response envelope contains the six-field receipt at the documented path', () => {
  assert.ok(recipe.response_schema.required.includes('receipt'));
  assert.deepEqual(recipe.response_schema.properties.receipt.required, fields);
  assert.equal(recipe.scope.result_path, 'response.receipt');
  assert.deepEqual(recipe.receipt_schema, recipe.response_schema.properties.receipt);
  assert.deepEqual(recipe.scope.returns, fields);
  assert.equal(recipe.response_schema.additionalProperties, false);
  assert.equal(recipe.receipt_schema.properties.retry_plan.type, 'array');
  assert.equal(recipe.receipt_schema.properties.generated_at.format, 'date-time');
});
test('base native USDC and the reviewed seller remain pinned in guidance', () => {
  assert.equal(recipe.payment.network, 'eip155:8453');
  assert.equal(recipe.payment.asset, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
  assert.equal(recipe.payment.pay_to, '0x4D7d842536De9Eb491AE2300126B3CDdE7B0aDE3');
  assert.equal(recipe.payment.decimals, 6);
  assert.equal(recipe.payment.example_max_amount_atomic, '10000');
});
test('CLI example includes a real input body and an explicit atomic amount cap', () => {
  const argv = recipe.paid_cli_example.argv;
  assert.deepEqual(argv.slice(0, 5), ['npx', 'awal@latest', 'x402', 'pay', recipe.resource]);
  assert.equal(argv[argv.indexOf('--method') + 1], 'POST');
  assert.deepEqual(JSON.parse(argv[argv.indexOf('--data') + 1]), recipe.request_examples[0].request);
  assert.equal(argv[argv.indexOf('--max-amount') + 1], '10000');
  assert.ok(argv.includes('--json'));
  assert.match(guide, /--data /);
  assert.match(guide, /--max-amount 10000/);
});
test('a retrieved recipe never authorizes payment', () => {
  assert.equal(recipe.payment.host_authorization_required, true);
  assert.equal(recipe.payment.automatic_purchase, false);
  assert.equal(recipe.paid_cli_example.run_automatically, false);
  assert.equal(recipe.paid_cli_example.executes_real_payment, true);
  assert.match(guide, /spends real USDC/);
  assert.match(recipe.payment.caution, /does not pin network, asset, payee, or request/);
});
test('uncertain delivery never prompts another automatic purchase', () => {
  assert.equal(recipe.repeat_use.automatic_repurchase, false);
  assert.match(recipe.repeat_use.unknown_outcome, /reconcile/);
  assert.match(guide, /do not blindly repeat/);
  assert.match(guide, /never automatically execute/);
});
test('disclosure and evidence stay under host control', () => {
  assert.equal(recipe.privacy.send_secrets, false);
  assert.equal(recipe.privacy.upload_consent_required, true);
  assert.equal(recipe.privacy.save_payment_evidence_in_public_logs, false);
});
test('documentation separates source publication from production and sales', () => {
  assert.match(growth, /does not update the seller's Worker/);
  assert.match(growth, /not 5 independent customers/);
  assert.match(growth, /not directly comparable/);
  assert.match(growth, /Validation neither pays nor indexes/);
  assert.match(growth, /Exclude own-wallet transfers/);
  assert.match(guide, /not a live end-to-end wallet test/);
});
test('illustrative outputs are identified instead of represented as paid evidence', () => {
  assert.match(guide, /illustrative output shape/);
  assert.match(guide, /not a captured paid result/);
});

test('the existing discovery manifest links to the buyer guide', () => {
  const manifest = JSON.parse(read('agent-marketplace.json'));
  const quickstart = manifest.buyer_quickstarts['command-error'];
  assert.equal(quickstart.human, 'docs/BUY_FIX_ERROR.md');
  assert.equal(quickstart.machine, 'fix-error-quickstart.json');
  assert.equal(quickstart.automatic_purchase, false);
  assert.equal(manifest.mcp.production_remote_tools_changed, false);
});
test('recipe ships with the package and regression checks join npm test', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.files.includes('fix-error-quickstart.json'));
  assert.match(pkg.scripts.test, /node --test test\/fix-error-quickstart\.test\.mjs/);
  assert.equal(pkg.scripts['test:buyer-quickstart'], 'node --test test/fix-error-quickstart.test.mjs');
});

// The published recipe must not recreate the flat-response integration bug.
test('guide and recipe separate the HTTP body, diagnostic receipt and settlement', () => {
  assert.equal(recipe.response_handling.diagnostic_path, 'receipt');
  assert.equal(recipe.response_handling.settlement_verified_by_parser, false);
  assert.equal(recipe.response_handling.raw_api_body_required, true);
  assert.match(guide, /response\.receipt/);
  assert.match(guide, /not proof of settlement/);
  assert.match(guide, /outer CLI result wrapper/);
});
