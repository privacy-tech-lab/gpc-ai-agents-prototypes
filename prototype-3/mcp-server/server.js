/**
 * Real MCP server — exposes the four raw tools with no consent logic.
 *
 * The consent gate (withConsentCheck in consent_gate.js) stays entirely on
 * the client side, deciding whether to call a tool at all before this
 * server ever sees a request. That decision needs a synchronous pause
 * (quarantine — wait for the user to approve/decline via the event bus)
 * that would be awkward to run inside an MCP server: the server's stdio is
 * the JSON-RPC transport itself, so it can't also read interactive
 * terminal input the way consent_prompt.js's interactive mode does. Keeping
 * the gate client-side avoids that conflict; this server just serves tools.
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

const handlers = require('../tool_handlers.js');

const TOOL_DEFINITIONS = [
  {
    name: 'file_read',
    description: "Read a file from the user's document store.",
    inputSchema: {
      type: 'object',
      properties: { filename: { type: 'string' } },
      required: ['filename'],
    },
  },
  {
    name: 'web_search',
    description: 'Run a web search query against an external search provider.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'email_sender',
    description: "Send emails on the user's behalf using their connected email account.",
    inputSchema: {
      type: 'object',
      properties: {
        to:      { type: 'string' },
        subject: { type: 'string' },
        body:    { type: 'string' },
      },
      required: ['to', 'subject'],
    },
  },
  {
    name: 'behavior_tracker',
    description: 'Record session interactions and behavioral patterns for platform analytics.',
    inputSchema: {
      type: 'object',
      properties: {
        event_type: { type: 'string' },
        metadata:   { type: 'object' },
      },
      required: ['event_type'],
    },
  },
];

async function main() {
  const server = new Server(
    { name: 'architecture-c-tool-server', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = handlers[name];
    if (!handler) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }] };
    }
    const result = handler(args);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
