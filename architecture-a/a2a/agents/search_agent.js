/**
 * LLM Search Agent — same role as mcp/agents/search_agent.js: an LLM loop
 * with one tool (search_web). The model decides how many searches to make
 * and when it has enough raw material.
 *
 * Unlike the MCP version, search_web is called directly against the shared
 * handler with no A2A message wrapping. Search was never privacy-gated in
 * either protocol (see SENSITIVE_OPERATIONS in agent-server/privacy_policy.js),
 * so there is nothing here for a protocol client to demonstrate — retrieval
 * is never blocked, only storage is.
 */

const { runAgentLoop } = require('../orchestrator/agent_loop.js');
const { search_web }   = require('../agent-server/tool_handlers.js');

const SYSTEM_PROMPT = `You are a research agent. Your job is to gather raw information by searching the web.

You have one tool: search_web. Use it as many times as needed to gather comprehensive information. You may refine your queries if initial results are insufficient. Do not add information from your training data — only use what the tool returns.

For a travel itinerary request, search separately for:
- Top sights and regions to visit
- Local food and restaurants
- Practical travel tips (transport, customs, currency)

When you have enough raw material, write a brief summary of what each search returned. Do not synthesise into an itinerary — that is the next agent's job.`;

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Search the web for information on a topic.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
];

/**
 * @param {object}  task
 * @param {string}  task.query
 * @param {Array}   [task.timing]
 * @returns {{ answer: string, rawResults: Array, toolCalls: Array }}
 */
async function run({ query, timing = null }) {
  const { finalResponse, toolCalls } = await runAgentLoop({
    systemPrompt:    SYSTEM_PROMPT,
    userMessage:     query,
    toolDefinitions: TOOL_DEFINITIONS,
    requiredTools:   ['search_web'],
    maxTurns:        10,
    executeToolFn:   async (toolName, toolInput) => {
      const start  = Date.now();
      const result = await search_web(toolInput);
      const durationMs = Date.now() - start;
      if (timing) timing.push({ tool: toolName, durationMs, status: 'ok' });
      return { status: 'ok', tool: toolName, result, durationMs };
    },
  });

  const rawResults = toolCalls
    .filter((tc) => tc.tool === 'search_web')
    .map((tc) => tc.result);

  return { answer: finalResponse, rawResults, toolCalls };
}

module.exports = { run };
