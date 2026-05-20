/**
 * MCP Server — exposes five medical-assistant tools with a purpose-aware
 * GPC interceptor.
 *
 * Unlike Architecture A, every tool handler is wrapped by withPurposeCheck()
 * instead of withGpc().  The enforcement key is the combination of:
 *   params._meta.gpc     — GPC signal
 *   params._meta.purpose — declared purpose for this specific call
 *
 * Tools are never blocked wholesale; only calls whose declared purpose is
 * in the tool's gpc_restricted_purposes list are blocked.
 */

const { Server }               = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

const { withPurposeCheck } = require('./purpose_registry.js');
const handlers              = require('./tool_handlers.js');

const TOOL_DEFINITIONS = [
  {
    name: 'get_medical_records',
    description: 'Retrieve patient health records. Required for primary_task; personalization purpose is GPC-restricted.',
    inputSchema: {
      type: 'object',
      properties: {
        patient_id:  { type: 'string' },
        record_type: { type: 'string', enum: ['full', 'summary'] },
      },
      required: ['patient_id'],
    },
  },
  {
    name: 'answer_question',
    description: 'Answer a medical query given the patient context. Primary task only; never GPC-restricted.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        context:  { type: 'string' },
      },
      required: ['question'],
    },
  },
  {
    name: 'log_interaction',
    description: 'Append the query/response to the interaction log. B2 Collection layer. GPC-restricted for analytics and model_training purposes.',
    inputSchema: {
      type: 'object',
      properties: {
        patient_id:       { type: 'string' },
        query:            { type: 'string' },
        response_summary: { type: 'string' },
      },
      required: ['patient_id', 'query', 'response_summary'],
    },
  },
  {
    name: 'update_interest_profile',
    description: 'Derive a behavioral interest profile from the session. B2 Inference layer. GPC-restricted for personalization purpose.',
    inputSchema: {
      type: 'object',
      properties: {
        patient_id: { type: 'string' },
        interests:  { type: 'array', items: { type: 'string' } },
      },
      required: ['patient_id', 'interests'],
    },
  },
  {
    name: 'add_to_training_set',
    description: 'Write the query/response pair to the model training dataset. B2 Processing layer. GPC-restricted for model_training purpose.',
    inputSchema: {
      type: 'object',
      properties: {
        query:    { type: 'string' },
        response: { type: 'string' },
        metadata: { type: 'object' },
      },
      required: ['query', 'response'],
    },
  },
];

const wrappedHandlers = {
  get_medical_records:    withPurposeCheck('get_medical_records',    handlers.get_medical_records),
  answer_question:        withPurposeCheck('answer_question',        handlers.answer_question),
  log_interaction:        withPurposeCheck('log_interaction',        handlers.log_interaction),
  update_interest_profile:withPurposeCheck('update_interest_profile',handlers.update_interest_profile),
  add_to_training_set:    withPurposeCheck('add_to_training_set',    handlers.add_to_training_set),
};

async function main() {
  const server = new Server(
    { name: 'gpc-purpose-server', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const meta = request.params._meta ?? {};

    const handler = wrappedHandlers[name];
    if (!handler) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
      };
    }

    const result = await handler(args, meta);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
