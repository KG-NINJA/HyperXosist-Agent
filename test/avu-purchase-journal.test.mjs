import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, readdirSync, statSync, mkdirSync, chmodSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createFilePurchaseJournal } from '../avu-purchase-journal.mjs';
import { canonicalDigest } from '../avu-buyer.mjs';

const key = 'stable-journal-key-0001';
const hash = canonicalDigest({ fixture: true });
const metadata = { requestHash: hash, evidenceDigest: hash, precheckDigest: hash, bindingDigest: hash,
  quoteId: 'qte_test', amountAtomic: '10000', network: 'eip155:8453', asset: `0x${'1'.repeat(40)}`,
  payTo: `0x${'2'.repeat(40)}`, expiresAt: '2026-09-07T06:00:00Z' };
function setup(t) {
  const directory = mkdtempSync(join(tmpdir(), 'avu-journal-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { directory, journal: createFilePurchaseJournal({ directory }) };
}
test('claim is durable, private and excludes later instances without storing raw keys or artifacts', t => {
  const { directory, journal } = setup(t);
  assert.equal(journal.inspect(key), null);
  const ticket = journal.claim(key, metadata);
  journal.record(ticket, 'submitting'); journal.record(ticket, 'delivered');
  const reopened = createFilePurchaseJournal({ directory });
  assert.equal(reopened.inspect(key).state, 'delivered');
  assert.equal(reopened.inspect(key).retryAllowed, false);
  assert.throws(() => reopened.claim(key, metadata), { code: 'PURCHASE_ALREADY_RECORDED' });
  const path = join(directory, readdirSync(directory)[0]);
  assert.equal(statSync(path).mode & 0o777, 0o700);
  for (const file of readdirSync(path)) {
    assert.equal(statSync(join(path, file)).mode & 0o777, 0o600);
    assert.ok(!readFileSync(join(path, file), 'utf8').includes(key));
  }
});
test('same key with changed intent or quote never becomes a new purchase', t => {
  const { journal } = setup(t); journal.claim(key, metadata);
  assert.throws(() => journal.claim(key, { ...metadata, quoteId: 'qte_other' }), { code: 'PURCHASE_ALREADY_RECORDED' });
});
test('crash between mkdir and claim write remains blocked', t => {
  const { directory, journal } = setup(t);
  const digest = canonicalDigest({ scope: 'avu-purchase-journal/v1', idempotencyKey: key });
  mkdirSync(join(directory, digest.slice(7)), { mode: 0o700 });
  assert.deepEqual(journal.inspect(key), { state: 'unknown', retryAllowed: false, reason: 'INCOMPLETE_JOURNAL_RECORD' });
  assert.throws(() => journal.claim(key, metadata), { code: 'PURCHASE_ALREADY_RECORDED' });
});
test('terminal and foreign tickets cannot change or clear a claim', t => {
  const { journal } = setup(t); const ticket = journal.claim(key, metadata);
  assert.throws(() => journal.record({}, 'submitting'), { code: 'INVALID_JOURNAL_TRANSITION' });
  journal.record(ticket, 'unknown');
  assert.throws(() => journal.record(ticket, 'submitting'), { code: 'INVALID_JOURNAL_TRANSITION' });
  assert.equal(journal.inspect(key).state, 'unknown');
});
test('decline is recorded but never silently releases the key', t => {
  const { journal } = setup(t); journal.record(journal.claim(key, metadata), 'refused');
  assert.equal(journal.inspect(key).state, 'refused');
  assert.throws(() => journal.claim(key, metadata), { code: 'PURCHASE_ALREADY_RECORDED' });
});
test('unknown fields cannot smuggle secrets into the journal', t => {
  const { journal, directory } = setup(t);
  assert.throws(() => journal.claim(key, { ...metadata, paymentSignature: 'never-store' }), { code: 'INVALID_JOURNAL_RECORD' });
  assert.deepEqual(readdirSync(directory), []);
});
test('shared, relative and symlink directories fail closed', t => {
  const { directory } = setup(t);
  assert.throws(() => createFilePurchaseJournal({ directory: 'relative' }), { code: 'JOURNAL_PRIVATE_DIRECTORY_REQUIRED' });
  const link = join(directory, 'link'); symlinkSync(directory, link);
  assert.throws(() => createFilePurchaseJournal({ directory: link }), { code: 'JOURNAL_PRIVATE_DIRECTORY_REQUIRED' });
  chmodSync(directory, 0o755);
  assert.throws(() => createFilePurchaseJournal({ directory }), { code: 'JOURNAL_PRIVATE_DIRECTORY_REQUIRED' });
});
test('two independent processes cannot reserve the same purchase', async t => {
  const { directory } = setup(t);
  const script = `import {createFilePurchaseJournal} from ${JSON.stringify(new URL('../avu-purchase-journal.mjs', import.meta.url).href)};
    try { createFilePurchaseJournal({directory:process.argv[1]}).claim(${JSON.stringify(key)},${JSON.stringify(metadata)}); }
    catch(e) { process.exitCode = e.code === 'PURCHASE_ALREADY_RECORDED' ? 3 : 9; }`;
  const run = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script, directory], { stdio: 'ignore' });
    child.on('error', reject); child.on('exit', resolve);
  });
  assert.deepEqual((await Promise.all([run(), run()])).sort(), [0, 3]);
});
