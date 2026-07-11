import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const endpoints = require('../payment-endpoints.js');
const production = endpoints.resolve('production');
const staging = endpoints.resolve('staging');
const files = ['agent-tools.json', 'agent-use.json', 'examples/agent-session.example.json', 'signal-to-fix-pipeline.json', 'x402-payment.json'];
const check = process.argv.includes('--check');
function replaceUrls(value) {
  if (typeof value === 'string') return value.split(staging.baseUrl).join(production.baseUrl);
  if (Array.isArray(value)) return value.map(replaceUrls);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceUrls(item)]));
  return value;
}
let changed = false;
for (const relative of files) {
  const file = resolve(process.cwd(), relative);
  const next = JSON.stringify(replaceUrls(JSON.parse(readFileSync(file, 'utf8'))), null, 2) + '\n';
  if (readFileSync(file, 'utf8') !== next) {
    changed = true;
    if (!check) writeFileSync(file, next);
    console.log((check ? 'OUTDATED ' : 'SYNCED ') + relative);
  }
}
if (check && changed) process.exitCode = 1;
