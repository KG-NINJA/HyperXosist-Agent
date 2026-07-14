const apiKey = process.env.OPENAI_API_KEY || '';
const model = process.env.OPENAI_MODEL || 'gpt-5.5';
const serverUrl = process.env.HYPERXOSIST_MCP_URL || 'http://127.0.0.1:8787/mcp';
const token = process.env.HYPERXOSIST_MCP_TOKEN || '';
const prompt = 'Find recent user complaints, bug reports, and feature requests on X about HyperXosist-Agent. Use the specialized X research tool if appropriate.';

function validateConfiguration() {
  const url = new URL(serverUrl);
  if (url.pathname !== '/mcp') throw new Error('HYPERXOSIST_MCP_URL must point to the /mcp endpoint.');
  if (url.protocol !== 'https:' && !['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error('Remote MCP must use HTTPS unless it is local.');
  }
  return { model, serverUrl: url.toString(), authConfigured: Boolean(token), apiKeyConfigured: Boolean(apiKey) };
}

const config = validateConfiguration();
if (process.argv.includes('--check') || !apiKey) {
  console.log(JSON.stringify({ ok: true, mode: 'configuration-check', ...config }, null, 2));
  if (!apiKey) console.log('OPENAI_API_KEY is unset; no Responses API request was made.');
  process.exit(0);
}

const mcpTool = {
  type: 'mcp',
  server_label: 'hyperxosist',
  server_description: 'Specialized X research planning, collected-post signal filtering, and coding handoff. Not general web search and does not scrape X.',
  server_url: serverUrl,
  allowed_tools: ['hyperxosist_search_plan', 'hyperxosist_filter_signals', 'hyperxosist_build_handoff'],
  require_approval: 'never',
};
if (token) mcpTool.headers = { Authorization: `Bearer ${token}` };

const response = await fetch('https://api.openai.com/v1/responses', {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model, input: prompt, tools: [mcpTool] }),
});
const payload = await response.json();
if (!response.ok) throw new Error(`Responses API failed (${response.status}): ${payload.error?.message || 'unknown error'}`);
const calls = (payload.output || []).filter((item) => item.type === 'mcp_call');
const searchCall = calls.find((item) => item.name === 'hyperxosist_search_plan');
if (!searchCall) throw new Error('The model did not call hyperxosist_search_plan.');
if (!JSON.stringify(searchCall).includes('x.com/search')) throw new Error('The MCP result did not include an x.com/search URL.');
console.log(JSON.stringify({ ok: true, model, selectedTool: searchCall.name, mcpCallCount: calls.length, xSearchUrlObserved: true }, null, 2));
