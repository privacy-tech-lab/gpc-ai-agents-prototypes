/**
 * MCP Server — exposes four tools with a GPC policy interceptor (Layer 4).
 *
 * Transport: stdio (standard MCP pattern).
 * Each tool handler is wrapped by withGpc() before registration, so the
 * enforcement is invisible to callers: they send a normal tool call, and
 * if gpc=1 appears in metadata, they get back a blocked response.
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

const { withGpc } = require('./gpc_policy.js');
const handlers = require('./tool_handlers.js');

const TOOL_DEFINITIONS = [
  {
    name: 'user_profile_lookup',
    description: 'Look up stored profile data for a user. GPC-sensitive.',
    inputSchema: {
      type: 'object',
      properties: { user_id: { type: 'string' } },
      required: ['user_id'],
    },
  },
  {
    name: 'save_to_profile',
    description: 'Persist data to a user profile for future personalisation. GPC-sensitive.',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        data: { type: 'object' },
      },
      required: ['user_id', 'data'],
    },
  },
  {
    name: 'log_interaction',
    description: 'Append a query/response summary to the interaction log. GPC-sensitive.',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        query: { type: 'string' },
        response_summary: { type: 'string' },
      },
      required: ['user_id', 'query', 'response_summary'],
    },
  },
  {
    name: 'search_web',
    description: 'Run a web search. Not GPC-sensitive.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
];

// Wrap every handler once at startup
const wrappedHandlers = {
  user_profile_lookup: withGpc('user_profile_lookup', handlers.user_profile_lookup),
  save_to_profile: withGpc('save_to_profile', handlers.save_to_profile),
  log_interaction: withGpc('log_interaction', handlers.log_interaction),
  search_web: withGpc('search_web', handlers.search_web),
};

async function main() {
  const server = new Server(
    { name: 'gpc-demo-server', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    // GPC signal arrives in params._meta.gpc (MCP metadata field)
    const meta = request.params._meta ?? {};

    const handler = wrappedHandlers[name];
    if (!handler) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }] };
    }

    const result = await handler(args, meta);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
