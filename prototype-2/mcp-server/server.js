/**
 * MCP server exposing the primary tool: get_medical_records.
 *
 * Unlike Architecture A's server, there is no policy interceptor here.
 * get_medical_records is Architecture B's whole point: the primary-purpose
 * tool call is never GPC-gated, only what happens to its output afterwards
 * (see orchestrator.js's fanOutSecondaryPurposes). So this server just
 * serves the tool as-is.
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

const { get_medical_records } = require('../services/medicalRecords.js');

const TOOL_DEFINITIONS = [
  {
    name: 'get_medical_records',
    description: "Retrieve a patient's health records (readings, medications). Never GPC-gated.",
    inputSchema: {
      type: 'object',
      properties: { patient_id: { type: 'string' } },
      required: ['patient_id'],
    },
  },
];

const HANDLERS = { get_medical_records };

async function main() {
  const server = new Server(
    { name: 'architecture-b-medical-server', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = HANDLERS[name];
    if (!handler) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }] };
    }
    const result = await handler(args);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
