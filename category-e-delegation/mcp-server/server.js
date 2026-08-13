/**
 * Real MCP server — exposes the six trip actions as tools.
 *
 * action_handlers.js is unchanged; this is a thin transport wrapper around
 * it, same as Architectures A/B/C/D/E. Execution is the piece that belongs
 * server-side: it is stateless and is genuinely "a tool the platform
 * calls." The delegation decision stays client-side in delegation_gate.js,
 * mirroring Architecture C, where the consent gate decides and only then
 * does the call reach the MCP server. Tier resolution is policy the user
 * owns, not something a tool server should be trusted to enforce.
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

const handlers = require('../action_handlers.js');

const TOOL_DEFINITIONS = [
  {
    name: 'search_flights',
    description: 'Search flights for a route and dates.',
    inputSchema: {
      type: 'object',
      properties: { route: { type: 'string' }, dates: { type: 'string' } },
      required: ['route'],
    },
  },
  {
    name: 'hold_reservation',
    description: 'Hold a hotel room with free cancellation.',
    inputSchema: {
      type: 'object',
      properties: { hotel: { type: 'string' }, cancellation: { type: 'string' } },
      required: ['hotel'],
    },
  },
  {
    name: 'book_flight',
    description: 'Book a flight and charge the card on file. Non-refundable.',
    inputSchema: {
      type: 'object',
      properties: { flight: { type: 'string' }, fare: { type: 'number' } },
      required: ['flight'],
    },
  },
  {
    name: 'share_passport',
    description: "Send the traveler's passport details to a recipient.",
    inputSchema: {
      type: 'object',
      properties: { recipient: { type: 'string' }, fields: { type: 'array', items: { type: 'string' } } },
      required: ['recipient'],
    },
  },
  {
    name: 'price_alerts_tracking',
    description: "Enable fare tracking over the user's search history.",
    inputSchema: { type: 'object', properties: { track: { type: 'string' } } },
  },
  {
    name: 'newsletter_signup',
    description: 'Subscribe the user to a mailing list.',
    inputSchema: {
      type: 'object',
      properties: { list: { type: 'string' } },
      required: ['list'],
    },
  },
];

const TOOL_NAMES = new Set(TOOL_DEFINITIONS.map(t => t.name));

async function main() {
  const server = new Server(
    { name: 'category-e-action-server', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (!TOOL_NAMES.has(name)) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }] };
    }
    let result;
    try {
      result = handlers[name](args ?? {});
    } catch (err) {
      result = { error: 'action_failed', action: name, detail: String(err?.message ?? err) };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
