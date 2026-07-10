#!/usr/bin/env node

/**
 * HyperXosist MCP Server
 * Exposes planning, filtering, and handoff capabilities for AI IDEs and LLM agents.
 */

const path = require('path');
const HyperXosistAgent = require('../agent-api.js');

async function main() {
  const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const { ListToolsRequestSchema, CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');

  const server = new Server(
    {
      name: 'hyperxosist-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'hyperxosist_search_plan',
          description: "Converts natural language intents to find user complaints, product feedback, bug reports, social media discussions, community sentiment, or feature requests on X (Twitter) into a high-signal, noise-reduced multi-angle search mission. Use this when the user asks to 'Find user complaints on X', 'Search product feedback', 'Monitor social media discussions', 'Analyze feature requests', 'Investigate bug reports from X', or 'Research community sentiment'. Returns queries, search URLs, and quality scores.",
          inputSchema: {
            type: 'object',
            properties: {
              intent: {
                type: 'string',
                description: "The research or search intent, e.g., 'Find user complaints on X about Acme'.",
              },
            },
            required: ['intent'],
          },
        },
        {
          name: 'hyperxosist_filter_signals',
          description: 'Filters and scores raw feedback posts or social media discussions by technical depth to identify high-signal, actionable bug reports, feature requests, and UX friction while discarding empty praise, engagement bait, or ragebait. Essential step before compiling PR specs or passing issues to a coding agent.',
          inputSchema: {
            type: 'object',
            properties: {
              feedback: {
                type: 'array',
                items: {
                  type: 'string',
                },
                description: 'An array of raw post/comment texts collected from X/social media.',
              },
            },
            required: ['feedback'],
          },
        },
        {
          name: 'hyperxosist_build_handoff',
          description: 'Packages Keep-filtered product feedback and bug reports into a structured Signal-to-Fix handoff package. Generates a universal coding-agent implementation prompt (Markdown) for one small code improvement (PR spec). Connects social media signals to direct engineering fixes.',
          inputSchema: {
            type: 'object',
            properties: {
              productName: {
                type: 'string',
                description: 'The name of the product or software codebase.',
              },
              feedback: {
                type: 'array',
                items: {
                  type: 'string',
                },
                description: 'An array of raw/filtered feedback post texts to build the handoff package from.',
              },
            },
            required: ['productName', 'feedback'],
          },
        },
      ],
    };
  });

  // Handle tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      if (name === 'hyperxosist_search_plan') {
        if (!args || typeof args.intent !== 'string') {
          return {
            content: [{ type: 'text', text: "Error: 'intent' parameter must be a string." }],
            isError: true,
          };
        }

        const session = HyperXosistAgent.startAgentSession({ intent: args.intent });
        const plan = session.plan;
        if (!plan || !plan.ok) {
          return {
            content: [{ type: 'text', text: `Error: ${plan ? plan.error : 'Failed to generate plan.'}` }],
            isError: true,
          };
        }

        const mission = plan.mission;
        const queries = mission.steps.map((s) => s.query);
        const searchUrls = mission.steps.map((s) => s.searchUrl);
        const estimatedCost = mission.estimatedCostUsd;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  mission,
                  queries,
                  searchUrls,
                  estimatedCost,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (name === 'hyperxosist_filter_signals') {
        if (!args || !Array.isArray(args.feedback)) {
          return {
            content: [{ type: 'text', text: "Error: 'feedback' parameter must be an array of strings." }],
            isError: true,
          };
        }

        const filtered = HyperXosistAgent.filterKeepSignals(args.feedback);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  keep: filtered.keep,
                  discard: filtered.discard,
                  summary: filtered.focusSummary,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (name === 'hyperxosist_build_handoff') {
        if (!args || typeof args.productName !== 'string' || !Array.isArray(args.feedback)) {
          return {
            content: [
              {
                type: 'text',
                text: "Error: 'productName' must be a string and 'feedback' must be an array of strings.",
              },
            ],
            isError: true,
          };
        }

        const handoffPkg = HyperXosistAgent.buildHandoffPackage({
          productName: args.productName,
          feedback: args.feedback,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  handoff: handoffPkg,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      return {
        content: [{ type: 'text', text: `Error: Unknown tool '${name}'` }],
        isError: true,
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error executing tool '${name}': ${err.message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Fatal error in MCP server:', err);
  process.exit(1);
});
