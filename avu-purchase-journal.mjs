import { constants, mkdirSync, lstatSync, openSync, closeSync, fsyncSync, writeFileSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { AVUBuyerError, canonicalDigest } from './avu-buyer.mjs';

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const fail = code => { throw new AVUBuyerError(code); };
const fields = ['requestHash', 'evidenceDigest', 'precheckDigest', 'bindingDigest',
  'quoteId', 'amountAtomic', 'network', 'asset', 'payTo', 'expiresAt'];
const stages = ['claimed', 'submitting', 'delivered', 'unknown', 'refused'];

// Host-owned, append-only write-ahead guard. No artifact, private key, payment
// signature or raw response is stored. Never delete a claim to retry a payment.
// Intended for a local POSIX filesystem with working fsync, not NFS/object sync.
export function createFilePurchaseJournal({ directory } = {}) {
  if (process.platform === 'win32' || typeof directory !== 'string' || !isAbsolute(directory)) fail('JOURNAL_PRIVATE_DIRECTORY_REQUIRED');
  const tickets = new WeakMap();
  function privateDirectory(path) {
    const stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 ||
        (process.getuid && stat.uid !== process.getuid())) fail('JOURNAL_PRIVATE_DIRECTORY_REQUIRED');
  }
  function syncDirectory(path) {
    const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { fsyncSync(fd); } finally { closeSync(fd); }
  }
  function write(path, value) {
    const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { writeFileSync(fd, JSON.stringify(value) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
  }
  function read(path) {
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try { return JSON.parse(readFileSync(fd, 'utf8')); } finally { closeSync(fd); }
  }
  function keyDigest(key) {
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) fail('IDEMPOTENCY_KEY_REQUIRED');
    return canonicalDigest({ scope: 'avu-purchase-journal/v1', idempotencyKey: key });
  }
  function recordFor(key, metadata) {
    if (!metadata || Object.keys(metadata).sort().join() !== [...fields].sort().join() ||
        fields.some(key => typeof metadata[key] !== 'string') ||
        ['requestHash', 'evidenceDigest', 'precheckDigest', 'bindingDigest'].some(key => !DIGEST.test(metadata[key])) ||
        !/^qte_[A-Za-z0-9_-]{1,128}$/.test(metadata.quoteId) || !/^[1-9][0-9]{0,15}$/.test(metadata.amountAtomic) ||
        metadata.network !== 'eip155:8453' || !/^0x[a-fA-F0-9]{40}$/.test(metadata.asset) ||
        !/^0x[a-fA-F0-9]{40}$/.test(metadata.payTo) || !Number.isFinite(Date.parse(metadata.expiresAt))) fail('INVALID_JOURNAL_RECORD');
    return { schemaVersion: 'avu-purchase-journal/v1', idempotencyKeyDigest: keyDigest(key), ...metadata };
  }
  // Caller creates and durably provisions this private directory before use.
  // Do not chmod an existing directory or silently fall back to memory.
  privateDirectory(directory);
  syncDirectory(directory);
  return {
    claim(key, metadata) {
      const record = recordFor(key, metadata);
      const path = join(directory, record.idempotencyKeyDigest.slice(7));
      try {
        privateDirectory(directory);
        try { mkdirSync(path, { mode: 0o700 }); }
        catch (error) { if (error.code === 'EEXIST') fail('PURCHASE_ALREADY_RECORDED'); throw error; }
        // Persist the exclusion first. An empty/partial claim after a crash
        // remains blocked and requires reconciliation, never a new signature.
        syncDirectory(directory);
        write(join(path, '0-claimed.json'), { ...record, state: 'claimed' });
        syncDirectory(path);
        const ticket = Object.freeze({});
        tickets.set(ticket, { path, record, state: 'claimed' });
        return ticket;
      } catch (error) {
        if (error instanceof AVUBuyerError) throw error;
        fail('JOURNAL_WRITE_FAILED');
      }
    },
    record(ticket, state) {
      const entry = tickets.get(ticket);
      const allowed = entry && ((entry.state === 'claimed' && ['submitting', 'unknown', 'refused'].includes(state)) ||
        (entry.state === 'submitting' && ['delivered', 'unknown'].includes(state)));
      if (!allowed) fail('INVALID_JOURNAL_TRANSITION');
      try {
        privateDirectory(directory); privateDirectory(entry.path);
        const index = state === 'submitting' ? 1 : 2;
        write(join(entry.path, `${index}-${state}.json`), { ...entry.record, state });
        syncDirectory(entry.path);
        entry.state = state;
      } catch { fail('JOURNAL_WRITE_FAILED'); }
    },
    inspect(key) {
      const digest = keyDigest(key);
      const path = join(directory, digest.slice(7));
      try {
        privateDirectory(directory);
        try { privateDirectory(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
        let latest = null; let terminalSeen = false;
        for (const [index, state] of [[0, 'claimed'], [1, 'submitting'], [2, 'delivered'], [2, 'unknown'], [2, 'refused']]) {
          let value;
          try { value = read(join(path, `${index}-${state}.json`)); }
          catch (error) { if (error.code === 'ENOENT') continue; throw error; }
          const { schemaVersion, idempotencyKeyDigest, state: savedState, ...metadata } = value;
          if ((index > 0 && !latest) || (state === 'delivered' && latest?.state !== 'submitting') ||
              (index === 2 && terminalSeen)) fail('JOURNAL_READ_FAILED');
          if (schemaVersion !== 'avu-purchase-journal/v1' || idempotencyKeyDigest !== digest || savedState !== state ||
              !stages.includes(savedState) || canonicalDigest(recordFor(key, metadata)) !== canonicalDigest({ schemaVersion, idempotencyKeyDigest, ...metadata }) ||
              (latest && canonicalDigest({ ...latest, state }) !== canonicalDigest(value))) fail('JOURNAL_READ_FAILED');
          latest = value;
          if (index === 2) terminalSeen = true;
        }
        // Missing claim data is still an exclusion, not permission to retry.
        return latest ? { ...latest, retryAllowed: false } : { state: 'unknown', retryAllowed: false, reason: 'INCOMPLETE_JOURNAL_RECORD' };
      } catch { fail('JOURNAL_READ_FAILED'); }
    }
  };
}
