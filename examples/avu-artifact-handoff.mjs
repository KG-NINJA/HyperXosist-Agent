import { createRequire } from 'node:module';
import { createAVUBuyer, sha256 } from '../avu-buyer.mjs';
const require = createRequire(import.meta.url);
const Agent = require('../agent-api.js');

const args = process.argv.slice(2);
if (args.some(arg => !['--status'].includes(arg))) {
  console.error('Usage: node examples/avu-artifact-handoff.mjs [--status]');
  process.exitCode = 2;
} else {
  try {
    const buyer = createAVUBuyer();
    if (args.includes('--status')) {
      const result = await buyer.inspect();
      console.log(JSON.stringify({ checkedAt: new Date().toISOString(), origin: 'https://agent-economy.kgninja.dev',
        available: result.available, reasons: result.reasons, version: result.version,
        action: result.available ? 'Run the free precheck for an appropriate artifact.' : 'Operator must resolve the reported blocker before a purchase.',
        paymentExecuted: false }, null, 2));
      if (!result.available) process.exitCode = 3;
    } else {
      const artifact = Agent.exportKeepOnlyJson([
        'Synthetic demo: DemoProduct crashes every time I paste 20 lines of feedback on iOS.'
      ], { productName: 'DemoProduct', targetArea: 'auth' });
      // Freeze a deliberately minimized manifest, not raw user posts or secrets.
      const manifest = { type: 'hyperxosist.handoff-manifest.v1', artifact_digest: sha256(JSON.stringify(artifact)),
        downstream_policy: 'keep_only', producer: 'HyperXosist-Agent' };
      const jsonText = JSON.stringify(manifest);
      const result = await buyer.prepare({ jsonText, expectedSha256: sha256(jsonText),
        clientRequestId: 'offline-handoff-demo', requiresSignedReceipt: false });
      console.log(JSON.stringify({ ...result, fixture: 'synthetic', handoffManifest: manifest,
        nextStepWhenRequired: 'A buyer host can explicitly request a signed receipt using docs/AVU_BUYER.md. This demo never buys.' }, null, 2));
    }
  } catch (error) {
    console.error(JSON.stringify({ state: 'unverified', reason: error.code || 'READINESS_CHECK_FAILED', paymentExecuted: false }));
    process.exitCode = 2;
  }
}
