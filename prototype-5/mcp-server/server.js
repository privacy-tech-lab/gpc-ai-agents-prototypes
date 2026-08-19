/**
 * Real MCP server — exposes the query classifier as one tool.
 *
 * query_classifier.js is unchanged; this is a thin transport wrapper
 * around it, same as Architectures A/B/C/D. The firewall/engine decision
 * and the profile store stay client-side (in orchestrator.js / agent.js):
 * that decision needs to accumulate state across all 8 queries in a
 * session, and the extensive existing unit tests exercise that state
 * directly (store.snapshot(), store.isEmpty(), ...) — moving it
 * server-side would mean rewriting those tests around session identifiers
 * instead of adding real protocol compliance. Classification is the one
 * piece that's stateless and is genuinely "a tool the platform calls."
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

const classifier = require('../query_classifier.js');

const TOOL_DEFINITIONS = [
  {
    name: 'classify_query',
    description: 'Classify a search query into inferred personal attributes plus a canned answer.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
];

async function main() {
  const server = new Server(
    { name: 'prototype-5-classifier-server', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (name !== 'classify_query') {
      return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }] };
    }
    let result;
    try {
      result = classifier.classify(args.query);
    } catch (err) {
      result = { error: 'unknown_query', query: args.query, detail: String(err?.message ?? err) };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
