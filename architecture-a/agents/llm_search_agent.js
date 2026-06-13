/**
 * LLM Search Agent — the agentic core of the pipeline.
 *
 * Runs its own LLM loop with a single tool (search_web). The model decides
 * how many searches to make and when it has enough raw material. It may call
 * search_web multiple times with refined queries.
 *
 * The GPC signal is forwarded via the MCP _meta envelope on every tool call
 * (Layer 2). search_web is not sensitive so it always executes regardless of
 * the GPC flag — demonstrating that opt-out blocks storage, not retrieval.
 */

const { runAgentLoop } = require('../orchestrator/agent_loop.js');
const { callTool }     = require('../orchestrator/mcp_client.js');

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
 * @param {object}  [task.meta]    — MCP _meta envelope (gpc, jwt)
 * @param {Array}   [task.timing]
 * @returns {{ answer: string, rawResults: Array, toolCalls: Array }}
 */
async function run({ query, meta = {}, timing = null }) {
  const { finalResponse, toolCalls } = await runAgentLoop({
    systemPrompt:    SYSTEM_PROMPT,
    userMessage:     query,
    toolDefinitions: TOOL_DEFINITIONS,
    requiredTools:   ['search_web'],
    maxTurns:        10,
    executeToolFn:   async (toolName, toolInput) => {
      const start  = Date.now();
      // Layer 2: meta envelope forwarded on every tool call
      const result = await callTool(toolName, toolInput, meta, null);
      if (timing) timing.push({ tool: toolName, durationMs: Date.now() - start, status: result.status });
      return result;
    },
  });

  const rawResults = toolCalls
    .filter((tc) => tc.tool === 'search_web')
    .map((tc) => tc.result);

  return { answer: finalResponse, rawResults, toolCalls };
}

module.exports = { run };
