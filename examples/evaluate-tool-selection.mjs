import fs from 'node:fs';
const cases = JSON.parse(fs.readFileSync(new URL('../test/tool-selection-cases.json', import.meta.url), 'utf8')).cases;

function staticSelect(prompt) {
  const hasXContext = /\b(x|twitter|tweet|tweets|social media)\b/i.test(prompt);
  const hasSpecializedIntent = /complaint|bug report|feature request|product feedback|engineering task|search|monitor|filter|spam|ux|handoff|crash/i.test(prompt);
  return hasXContext && hasSpecializedIntent;
}

async function openAiSelect(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  const serverUrl = process.env.HYPERXOSIST_MCP_URL;
  if (!apiKey || !serverUrl) throw new Error('OPENAI_API_KEY and HYPERXOSIST_MCP_URL are required for OpenAI evaluation.');
  const tool = { type: 'mcp', server_label: 'hyperxosist', server_url: serverUrl, allowed_tools: ['hyperxosist_search_plan','hyperxosist_filter_signals','hyperxosist_build_handoff'], require_approval: 'never' };
  if (process.env.HYPERXOSIST_MCP_TOKEN) tool.headers = { Authorization: `Bearer ${process.env.HYPERXOSIST_MCP_TOKEN}` };
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-5.5', input: prompt, tools: [tool] }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || `OpenAI evaluation failed: ${response.status}`);
  return (payload.output || []).some((item) => item.type === 'mcp_call');
}

const useOpenAI = process.env.EVALUATE_WITH_OPENAI === '1';
const rows = [];
for (const testCase of cases) {
  const selected = useOpenAI ? await openAiSelect(testCase.prompt) : staticSelect(testCase.prompt);
  const expectedSelected = testCase.expected === 'selected';
  rows.push({ prompt: testCase.prompt, expected: testCase.expected, result: selected ? 'selected' : 'not_selected', outcome: selected === expectedSelected ? (selected ? 'selected' : 'not_selected') : (selected ? 'false_positive' : 'false_negative') });
}
const truePositive = rows.filter((row) => row.expected === 'selected' && row.result === 'selected').length;
const falsePositive = rows.filter((row) => row.outcome === 'false_positive').length;
const falseNegative = rows.filter((row) => row.outcome === 'false_negative').length;
const selectedCount = rows.filter((row) => row.result === 'selected').length;
const expectedPositive = rows.filter((row) => row.expected === 'selected').length;
console.log(JSON.stringify({
  mode: useOpenAI ? 'openai' : 'static',
  selected: truePositive,
  not_selected: rows.filter((row) => row.expected === 'not_selected' && row.result === 'not_selected').length,
  false_positive: falsePositive,
  false_negative: falseNegative,
  selection_rate: selectedCount / rows.length,
  precision: selectedCount ? truePositive / selectedCount : 0,
  recall: expectedPositive ? truePositive / expectedPositive : 0,
  cases: rows,
}, null, 2));
