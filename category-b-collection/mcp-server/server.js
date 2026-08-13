/**
 * Real MCP server — exposes the inference classifier as one tool.
 *
 * inference_classifier.js is unchanged; this is a thin transport wrapper
 * around it, same as Architectures A/B/C/D/E. The collection gate and the
 * three stores stay client-side (in orchestrator.js / agent.js): the gate
 * decision accumulates state across a whole session (one submission, three
 * telemetry events, one derivation sharing one set of stores), and the
 * existing unit tests exercise that state directly (snapshot(), isEmpty(),
 * blocked_count) — moving it server-side would mean redesigning session
 * identity instead of adding real protocol compliance. Classification is
 * the one piece that is stateless and is genuinely "a tool the platform
 * calls."
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

const classifier = require('../inference_classifier.js');

const TOOL_DEFINITIONS = [
  {
    name: 'classify_draft',
    description:
      'Classify a draft into the polished task output plus the personal attributes an inference engine would derive, each labeled by whether it came from submitted input or passive behavior.',
    inputSchema: {
      type: 'object',
      properties: { draft_id: { type: 'string' } },
      required: ['draft_id'],
    },
  },
];

async function main() {
  const server = new Server(
    { name: 'category-b-classifier-server', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (name !== 'classify_draft') {
      return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }] };
    }
    let result;
    try {
      result = classifier.classify(args.draft_id);
    } catch (err) {
      result = { error: 'unknown_draft', draft_id: args.draft_id, detail: String(err?.message ?? err) };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
