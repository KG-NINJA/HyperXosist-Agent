#!/usr/bin/env node
/**
 * HyperXosist Agent — universal CLI for any AI agent / shell tool-caller.
 *
 * Works offline for planning / scoring / keep / handoff.
 * Automated production use of generated search URLs still requires x402.
 *
 * Usage:
 *   hyperxosist plan "Find product feedback about Acme" --json
 *   hyperxosist dispatch hyperxosist_plan_from_intent --args '{"intent":"..."}'
 *   hyperxosist tools --format openai|anthropic|full
 *   hyperxosist keep --feedback '["bug…","love this"]' --product Acme --json
 *   hyperxosist handoff --product Acme --feedback '["…"]' --json
 *   hyperxosist pipeline --product Acme --json
 *   hyperxosist session --intent "…" --json
 *   hyperxosist mission product_feedback_radar Acme --json
 *   hyperxosist score --input '{"keywords":"Acme","noise":{"enabled":true,"preset":"medium"}}'
 *   hyperxosist query --input '{"keywords":"Acme"}'
 *   hyperxosist missions --json
 *   hyperxosist version
 *
 * Exit codes: 0 ok, 1 usage/error, 2 unknown command
 */
'use strict';

const path = require('path');
const fs = require('fs');
const Agent = require(path.join(__dirname, '..', 'agent-api.js'));

function printHelp() {
  const v = Agent.version;
  console.log(`HyperXosist Agent CLI v${v}

Universal entry for GPT / Claude / Grok / Llama / local agents and shell tool-callers.

Commands:
  plan <intent…>              planFromIntent (free planning)
  session --intent "…"        startAgentSession
  mission <id> <subject>      buildMission
  missions                    listMissions
  score --input <json>        scoreQuery
  query --input <json>        buildQuery + buildSearchUrl + score
  keep --feedback <json>      filterKeepSignals (+ optional export-keep-only)
  export-keep --feedback <json>  exportKeepOnlyJson
  handoff --product X --feedback <json>
  pipeline --product X [--feedback <json>]
  prompt --product X --feedback <json>   buildAgentPrompt
  tools [--format openai|anthropic|full] [--grok]
  dispatch <toolName> --args <json>      real tool dispatch (any runtime)
  playbook [--mode universal|grok]
  version

Global flags:
  --json          machine-readable JSON on stdout (default for dispatch/tools when piped)
  --pretty        pretty-print JSON (default true for humans; use --json --no-pretty for compact)
  --no-pretty     compact JSON
  --mode <m>      universal | grok
  --help, -h

Examples (copy-paste for agents):
  node bin/hyperxosist.js plan "Find product feedback about Acme for PR specs" --json
  node bin/hyperxosist.js dispatch hyperxosist_plan_from_intent --args '{"intent":"Find feedback about Acme"}' --json
  node bin/hyperxosist.js tools --format anthropic --json
  node bin/hyperxosist.js keep --product Acme --feedback '["crashes on export","love this"]' --export-keep-only --json

Payment: local plan/score/keep is free. Automated production search URL use needs x402
(see x402-payment.json). Human browser UI remains free.
`);
}

function parseArgs(argv) {
  const out = {
    _: [],
    flags: {},
    json: false,
    pretty: true,
    mode: 'universal',
    grok: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      out.flags.help = true;
    } else if (a === '--json') {
      out.json = true;
    } else if (a === '--pretty') {
      out.pretty = true;
    } else if (a === '--no-pretty') {
      out.pretty = false;
    } else if (a === '--grok') {
      out.grok = true;
      out.mode = 'grok';
    } else if (a === '--export-keep-only') {
      out.flags.exportKeepOnly = true;
    } else if (a === '--mode' && argv[i + 1]) {
      out.mode = argv[++i];
    } else if (a === '--intent' && argv[i + 1]) {
      out.flags.intent = argv[++i];
    } else if (a === '--product' && argv[i + 1]) {
      out.flags.product = argv[++i];
    } else if (a === '--product-url' && argv[i + 1]) {
      out.flags.productUrl = argv[++i];
    } else if (a === '--target-area' && argv[i + 1]) {
      out.flags.targetArea = argv[++i];
    } else if (a === '--context' && argv[i + 1]) {
      out.flags.context = argv[++i];
    } else if (a === '--input' && argv[i + 1]) {
      out.flags.input = argv[++i];
    } else if (a === '--feedback' && argv[i + 1]) {
      out.flags.feedback = argv[++i];
    } else if (a === '--file' && argv[i + 1]) {
      out.flags.file = argv[++i];
    } else if (a === '--args' && argv[i + 1]) {
      out.flags.args = argv[++i];
    } else if (a === '--format' && argv[i + 1]) {
      out.flags.format = argv[++i];
    } else if (a === '--min-score' && argv[i + 1]) {
      out.flags.minScore = Number(argv[++i]);
    } else if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out.flags[key] = next;
        i++;
      } else {
        out.flags[key] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function parseJsonFlag(raw, label) {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string') return raw;
  // Allow @file.json
  if (raw.startsWith('@')) {
    const p = raw.slice(1);
    const text = fs.readFileSync(p, 'utf8');
    return JSON.parse(text);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid JSON for ${label}: ${e.message}`);
  }
}

function loadFeedback(opts) {
  if (opts.flags.file) {
    const text = fs.readFileSync(opts.flags.file, 'utf8');
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.feedback)) return parsed.feedback;
    if (parsed && Array.isArray(parsed.texts)) return parsed.texts;
    throw new Error('--file must be a JSON array or { feedback: string[] }');
  }
  if (opts.flags.feedback) {
    const parsed = parseJsonFlag(opts.flags.feedback, '--feedback');
    if (!Array.isArray(parsed)) {
      throw new Error('--feedback must be a JSON array of strings');
    }
    return parsed;
  }
  return null;
}

function emit(data, opts, humanLines) {
  if (opts.json) {
    const space = opts.pretty ? 2 : 0;
    // Strip non-JSON functions from dual-format objects
    console.log(JSON.stringify(data, replacer, space));
  } else if (typeof humanLines === 'function') {
    humanLines(data);
  } else if (data && data.markdown) {
    console.log(data.markdown);
  } else {
    console.log(JSON.stringify(data, replacer, 2));
  }
}

function replacer(_key, value) {
  if (typeof value === 'function') return undefined;
  return value;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.flags.help || opts._.length === 0) {
    printHelp();
    process.exit(opts._.length === 0 && !opts.flags.help ? 1 : 0);
  }

  const cmd = opts._[0];
  const rest = opts._.slice(1);

  try {
    switch (cmd) {
      case 'version':
      case '-v':
      case '--version': {
        emit({ name: 'hyperxosist-agent', version: Agent.version }, opts, () => {
          console.log(Agent.version);
        });
        break;
      }

      case 'help': {
        printHelp();
        break;
      }

      case 'plan': {
        const intent =
          opts.flags.intent || rest.join(' ') || 'Find product feedback about DemoApp for PR specs';
        const plan = Agent.planFromIntent(intent, { mode: opts.mode, subject: opts.flags.product });
        emit(plan, opts, (p) => {
          console.log('Mission:', p.missionId, '—', p.mission && p.mission.label);
          console.log('Subject:', p.subject);
          console.log(
            'Steps:',
            p.mission && p.mission.stepCount,
            '| est. USD: $' + (p.mission && p.mission.estimatedCostUsd)
          );
          (p.mission && p.mission.steps ? p.mission.steps : []).forEach((s) => {
            console.log(
              `#${s.index + 1} [${s.angleId}] score=${s.score.score} (${s.score.band}) pay=${s.score.recommendPay}`
            );
            console.log('  query:', s.query.slice(0, 160) + (s.query.length > 160 ? '…' : ''));
            console.log('  url:', s.searchUrl);
          });
          if (p.primaryStep) {
            console.log('\nPrimary paid endpoint:', p.primaryStep.paidRequest.endpoint);
            console.log('(Planning only — pay via x402 before automated production search URL use.)');
          }
        });
        break;
      }

      case 'session': {
        const intent = opts.flags.intent || rest.join(' ');
        if (!intent) throw new Error('session requires --intent or trailing text');
        const session = Agent.startAgentSession({
          intent,
          mode: opts.mode,
          subject: opts.flags.product,
          lang: opts.flags.lang
        });
        emit(session, opts, () => {
          console.log('mode:', session.mode);
          console.log('mission:', session.plan && session.plan.missionId);
          console.log('subject:', session.plan && session.plan.subject);
          console.log('tools:', session.tools && session.tools.tools && session.tools.tools.length);
        });
        break;
      }

      case 'mission': {
        const missionId = rest[0] || opts.flags.missionId;
        const subject = rest[1] || opts.flags.product || opts.flags.subject;
        if (!missionId || !subject) {
          throw new Error('usage: mission <missionId> <subject>');
        }
        const mission = Agent.buildMission(missionId, {
          subject,
          lang: opts.flags.lang,
          mode: opts.mode
        });
        emit(mission, opts);
        break;
      }

      case 'missions': {
        emit(Agent.listMissions(), opts, (list) => {
          const items = list.missions || list || [];
          items.forEach((m) => {
            console.log(`- ${m.id}: ${m.label || m.name || ''}`);
          });
        });
        break;
      }

      case 'score': {
        const input = parseJsonFlag(opts.flags.input, '--input');
        if (!input) throw new Error('score requires --input <json>');
        emit(Agent.scoreQuery(input), opts);
        break;
      }

      case 'query': {
        const input = parseJsonFlag(opts.flags.input, '--input');
        if (!input) throw new Error('query requires --input <json>');
        const payload = {
          query: Agent.buildQuery(input),
          searchUrl: Agent.buildSearchUrl(input),
          validation: Agent.validateInput(input),
          score: Agent.scoreQuery(input),
          paidRequest: Agent.buildPaidRequest(input)
        };
        emit(payload, opts, (p) => {
          console.log('query:', p.query);
          console.log('url:', p.searchUrl);
          console.log('score:', p.score.score, p.score.band, 'recommendPay=', p.score.recommendPay);
        });
        break;
      }

      case 'keep': {
        const feedback = loadFeedback(opts);
        if (!feedback) throw new Error('keep requires --feedback <json array> or --file');
        if (opts.flags.exportKeepOnly || opts.flags.product) {
          emit(
            Agent.exportKeepOnlyJson(feedback, {
              productName: opts.flags.product,
              productUrl: opts.flags.productUrl,
              targetArea: opts.flags.targetArea,
              context: opts.flags.context,
              minScore: opts.flags.minScore
            }),
            opts,
            (p) => {
              console.log('keepCount:', p.keepCount, 'discardCount:', p.discardCount);
              p.keep.forEach((k) => console.log(' +', k.technicalDepth, k.text.slice(0, 100)));
            }
          );
        } else {
          emit(
            Agent.filterKeepSignals(feedback, { minScore: opts.flags.minScore }),
            opts,
            (p) => {
              console.log('keepCount:', p.keepCount, 'discardCount:', p.discardCount);
              p.keep.forEach((k) => console.log(' +', k.technicalDepth, k.text.slice(0, 100)));
              p.discard.forEach((k) => console.log(' -', k.technicalDepth, k.text.slice(0, 100)));
            }
          );
        }
        break;
      }

      case 'export-keep': {
        const feedback = loadFeedback(opts);
        if (!feedback) throw new Error('export-keep requires --feedback or --file');
        emit(
          Agent.exportKeepOnlyJson(feedback, {
            productName: opts.flags.product,
            productUrl: opts.flags.productUrl,
            targetArea: opts.flags.targetArea,
            context: opts.flags.context,
            minScore: opts.flags.minScore
          }),
          opts
        );
        break;
      }

      case 'handoff': {
        const feedback = loadFeedback(opts);
        const product = opts.flags.product;
        if (!product || !feedback) {
          throw new Error('handoff requires --product and --feedback/--file');
        }
        emit(
          Agent.buildHandoffPackage({
            productName: product,
            productUrl: opts.flags.productUrl,
            targetArea: opts.flags.targetArea,
            context: opts.flags.context,
            feedback,
            mode: opts.mode
          }),
          opts,
          (h) => {
            console.log('ready:', h.ready, 'feedbackCount:', h.feedbackCount);
            console.log('signalToFix UI:', h.signalToFix && h.signalToFix.humanUi);
            if (h.agentPrompt && h.agentPrompt.markdown) {
              console.log('\n--- agentPrompt.markdown ---\n');
              console.log(h.agentPrompt.markdown);
            }
          }
        );
        break;
      }

      case 'pipeline': {
        const product = opts.flags.product || rest[0];
        if (!product) throw new Error('pipeline requires --product');
        const feedback = loadFeedback(opts);
        emit(
          Agent.buildSignalToFixPipeline({
            productName: product,
            productUrl: opts.flags.productUrl,
            targetArea: opts.flags.targetArea,
            intent: opts.flags.intent,
            feedback: feedback || undefined,
            mode: opts.mode,
            lang: opts.flags.lang,
            missionId: opts.flags.missionId
          }),
          opts
        );
        break;
      }

      case 'prompt': {
        const feedback = loadFeedback(opts);
        const product = opts.flags.product;
        if (!product || !feedback) {
          throw new Error('prompt requires --product and --feedback/--file');
        }
        emit(
          Agent.buildAgentPrompt({
            productName: product,
            targetArea: opts.flags.targetArea,
            context: opts.flags.context,
            feedback,
            minTechScore: opts.flags.minScore
          }),
          opts,
          (p) => {
            console.log(p.markdown || p.prompt || JSON.stringify(p, null, 2));
          }
        );
        break;
      }

      case 'tools': {
        const format = (opts.flags.format || 'openai').toLowerCase();
        const toolOpts = {
          mode: opts.mode,
          includeGrok: opts.grok || opts.mode === 'grok',
          format: format === 'anthropic' ? 'anthropic' : 'openai'
        };
        let payload;
        if (format === 'full') {
          payload = Agent.getToolDefinitions({
            includeGrok: toolOpts.includeGrok,
            mode: toolOpts.mode
          });
        } else if (format === 'anthropic') {
          payload = {
            format: 'anthropic.tools.v1',
            tools: Agent.toAnthropicTools(toolOpts),
            dispatch: 'HyperXosistAgent.dispatchToolCall(name, input)'
          };
        } else {
          payload = {
            format: 'openai.tools.v1',
            tools: Agent.toOpenAITools(toolOpts),
            dispatch: 'HyperXosistAgent.dispatchToolCall(name, arguments)'
          };
        }
        // tools always useful as JSON for agents
        opts.json = opts.json || true;
        emit(payload, opts);
        break;
      }

      case 'dispatch': {
        const toolName = rest[0];
        if (!toolName) throw new Error('usage: dispatch <toolName> --args <json>');
        const args = parseJsonFlag(opts.flags.args || '{}', '--args') || {};
        const result = Agent.dispatchToolCall(toolName, args);
        opts.json = true;
        emit(result, opts);
        if (!result.ok) process.exitCode = 1;
        break;
      }

      case 'playbook': {
        emit(Agent.getAgentPlaybook({ mode: opts.mode }), opts);
        break;
      }

      default:
        console.error('Unknown command:', cmd);
        console.error('Run: hyperxosist help');
        process.exit(2);
    }
  } catch (err) {
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            error: 'cli_error',
            message: err && err.message ? err.message : String(err)
          },
          null,
          opts.pretty ? 2 : 0
        )
      );
    } else {
      console.error('Error:', err && err.message ? err.message : err);
    }
    process.exit(1);
  }
}

main();
