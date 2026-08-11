/**
 * Real MCP server — exposes the publisher fanout target as one tool.
 *
 * site_handlers.js already frames its handlers as "MCP-style tool
 * handlers": each one is a publisher's own enforcement point, reading
 * _meta.gpc and deciding whether to log/track. This server makes that
 * real: the provider (mcp_client.js) reaches every publisher through a
 * single stdio MCP connection instead of an in-process function call.
 * querySite() and decideTracking() in services/site_handlers.js are
 * unchanged — this is a thin transport wrapper around them, same as
 * Architectures A/B/C.
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

const { querySite } = require('../services/site_handlers.js');
const { listPublisherIds } = require('../services/tool_registry.js');

const TOOL_DEFINITIONS = [
  {
    name: 'query_publisher',
    description: 'Query one publisher for a review snippet. Each publisher enforces GPC at its own boundary based on the _meta.gpc it receives.',
    inputSchema: {
      type: 'object',
      properties: {
        site_id: { type: 'string', enum: listPublisherIds() },
        query:   { type: 'string' },
      },
      required: ['site_id', 'query'],
    },
  },
];

async function main() {
  const server = new Server(
    { name: 'architecture-d-publisher-server', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (name !== 'query_publisher') {
      return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }] };
    }
    // GPC signal arrives in params._meta.gpc, matching the Arch A/B/C convention.
    const meta = request.params._meta ?? {};
    const result = await querySite(args.site_id, args.query, meta);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
