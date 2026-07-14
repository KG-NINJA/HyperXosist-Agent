#!/usr/bin/env node
/**
 * HyperXosist Agent — agent dry-run handoff (local, offline)
 *
 *   node examples/agent-handoff-dryrun.mjs "HyperXosist-Agent"
 *   npm run agent-handoff-dryrun -- HyperXosist-Agent
 *
 * Demonstrates the full local path from search intent → keep filter →
 * Signal-to-Fix handoff → coding-agent prompt, without network access.
 *
 * This is a LOCAL DRY-RUN:
 * - Does NOT scrape X
 * - Does NOT post to X
 * - Does NOT perform x402 payment
 * - Does NOT collect real X data (uses built-in sample feedback only)
 * - GitHub Pages static UI behavior is unchanged
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const Agent = require(join(root, 'agent-api.js'));

/** Built-in sample posts for offline demos (not real X collection). */
export function buildSampleFeedback(productName) {
  const p = productName || 'DemoProduct';
  return [
    `${p} crashes every time I paste 20 lines of feedback on iOS. Screenshot attached.`,
    `${p} onboarding is confusing and hard to use — not sure what to click after import.`,
    `Please add JSON export for only kept issues so I can hand it to Codex from ${p}.`,
    `${p} docs are missing a copy-paste paid retry example for agent tool-calling.`,
    `Love this idea, super useful for cleaning up feedback.`,
    `GM giveaway airdrop 100x game changer bookmark this #crypto #airdrop #free #wagmi #promo`,
    `日本語UIが使いにくい。${p} の使い方がわからないので対応してほしい。`
  ];
}

function section(title) {
  console.log('');
  console.log('═'.repeat(72));
  console.log(title);
  console.log('═'.repeat(72));
}

function subsection(title) {
  console.log('');
  console.log('---', title, '---');
}

function main() {
  const subject =
    process.argv.slice(2).join(' ').trim() || 'HyperXosist-Agent';
  const intent = `Find product feedback about ${subject} for PR specs via Signal-to-Fix`;

  section('1. PLANNING (local, free — no network)');
  console.log('HyperXosist Agent version:', Agent.version);
  console.log('Subject / product:', subject);
  console.log('Intent:', intent);
  console.log('');
  console.log(
    'Mode: offline dry-run. No X scraping, no posting, no x402 payment, no HTTP calls.'
  );

  const session = Agent.startAgentSession({
    intent,
    subject
  });
  const plan = session.plan;
  if (!plan || plan.ok === false) {
    console.error('planFromIntent / startAgentSession failed:', plan);
    process.exit(1);
  }

  const primary = plan.primaryStep;
  if (!primary) {
    console.error('No primary step in plan.');
    process.exit(1);
  }

  console.log('');
  console.log('Mission ID:', plan.missionId);
  console.log('Mission label:', plan.mission && plan.mission.label);
  console.log('Plan subject:', plan.subject || subject);
  console.log(
    'Score:',
    primary.score && primary.score.score,
    `(${primary.score && primary.score.band})`,
    'recommendPay=',
    primary.score && primary.score.recommendPay
  );

  section('2. GENERATED SEARCH URL (planning only — not opened)');
  console.log('Primary angle:', primary.angleId);
  console.log('Primary query:');
  console.log(primary.query);
  console.log('');
  console.log('Search URL (official X search; dry-run does not open or scrape it):');
  console.log(primary.searchUrl);
  console.log('');
  console.log(
    'NOTE: Automated production use of this URL still requires x402 payment.'
  );
  console.log(
    'This dry-run never POSTs to the payment endpoint and never opens the URL.'
  );

  section('3. SAMPLE FEEDBACK (built-in strings — NOT real X data)');
  const sampleFeedback = buildSampleFeedback(subject);
  console.log(
    `Using ${sampleFeedback.length} built-in sample lines for product "${subject}".`
  );
  console.log('These are fixtures for local demos, not collected posts.');
  sampleFeedback.forEach((line, i) => {
    console.log(`  [${i + 1}] ${line}`);
  });

  section('4. KEEP / DISCARD (filterKeepSignals)');
  const keepFilter = Agent.filterKeepSignals(sampleFeedback);
  const keep = keepFilter.keep || [];
  const discard = keepFilter.discard || [];
  console.log('minScore:', keepFilter.minScore);
  console.log('keepCount:', keepFilter.keepCount != null ? keepFilter.keepCount : keep.length);
  console.log(
    'discardCount:',
    keepFilter.discardCount != null ? keepFilter.discardCount : discard.length
  );
  console.log('');
  console.log('KEEP (actionable for implementation):');
  if (!keep.length) {
    console.log('  (none)');
  } else {
    keep.forEach((item) => {
      const tags = (item.tags || []).join(',') || '-';
      console.log(
        `  + depth=${item.technicalDepth} [${tags}] ${item.text}`
      );
    });
  }
  console.log('');
  console.log('DISCARD (noise / weak signal):');
  if (!discard.length) {
    console.log('  (none)');
  } else {
    discard.forEach((item) => {
      console.log(`  - depth=${item.technicalDepth} ${item.text}`);
    });
  }

  section('5. SIGNAL-TO-FIX HANDOFF (buildHandoffPackage)');
  const handoff = Agent.buildHandoffPackage({
    productName: subject,
    productUrl: 'https://kg-ninja.github.io/HyperXosist-Agent/',
    targetArea: 'agent handoff / feedback quality',
    context:
      'Local dry-run of HyperXosist-Agent: intent → query → sample feedback → keep → Signal-to-Fix input.',
    feedback: sampleFeedback,
    query: primary.query,
    searchUrl: primary.searchUrl,
    missionId: plan.missionId,
    paid: false,
    searchMeta: {
      dryRun: true,
      network: false,
      scraped: false,
      paymentCompleted: false
    }
  });

  console.log('handoff.ready:', handoff.ready);
  console.log('feedbackCount:', handoff.feedbackCount);
  console.log('policy:', handoff.policy && handoff.policy.note);
  console.log('Signal-to-Fix human UI:', handoff.signalToFix && handoff.signalToFix.humanUi);
  console.log('Signal-to-Fix agent-use:', handoff.signalToFix && handoff.signalToFix.agentUse);
  if (handoff.linkedPipeline) {
    console.log('linkedPipeline.method:', handoff.linkedPipeline.method);
    console.log('linkedPipeline.manifest:', handoff.linkedPipeline.manifest);
  }

  subsection('Signal-to-Fix input preview (paste into Signal-to-Fix)');
  const s2fInput = handoff.signalToFix && handoff.signalToFix.input;
  console.log(JSON.stringify(s2fInput, null, 2));
  console.log('');
  console.log(
    'Downstream rule: only decision === "keep" items may influence PR / Codex outputs.'
  );

  section('6. CODING-AGENT PROMPT (implementation markdown)');
  const promptMd =
    (handoff.agentPrompt && handoff.agentPrompt.markdown) ||
    Agent.buildAgentPrompt({
      productName: subject,
      targetArea: 'agent handoff / feedback quality',
      feedback: keep.map((k) => k.text)
    }).markdown;
  console.log(promptMd);

  section('7. SAFETY DISCLAIMER (this run)');
  console.log('✓ No X scraping occurred.');
  console.log('✓ No X posting occurred.');
  console.log('✓ No x402 payment occurred.');
  console.log('✓ No network / HTTP calls were made by this script.');
  console.log('✓ Sample feedback is synthetic / built-in — not live X collection.');
  console.log('✓ GitHub Pages static site behavior is unchanged.');
  console.log('');
  console.log('Next (real agent path, not this dry-run):');
  console.log('  1. scoreQuery → x402 pay → open searchUrl (human or paid agent)');
  console.log('  2. Collect real post texts yourself (no scrape API in this repo)');
  console.log('  3. buildHandoffPackage({ feedback: realPosts }) → Signal-to-Fix keep-only');
  console.log('');
  console.log('Done. Dry-run handoff complete for:', subject);
}

main();
