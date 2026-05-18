/**
 * LLM Search Agent
 *
 * Runs its own LLM loop with a single tool (search_web). The model calls the
 * tool and returns a concise summary of the results as its final response.
 * The GPC signal is forwarded via the MCP _meta envelope on every tool call.
 */

const { runAgentLoop } = require('../orchestrator/agent_loop.js');
const { callTool }     = require('../orchestrator/mcp_client.js');

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
 * @param {object}  [task.meta]        — MCP _meta envelope (gpc, jwt)
 * @param {Array}   [task.timing]
 * @param {boolean} [task.dropSignal]  — strip meta before forwarding (experiment)
 * @returns {{ summary: string, rawResult: object, toolCalls: Array }}
 */
async function run({ query, meta = {}, timing = null, dropSignal = false }) {
  const forwardMeta = dropSignal ? {} : meta;

  const { finalResponse, toolCalls } = await runAgentLoop({
    systemPrompt: `You are a focused search agent. Your only job is to call search_web with the given query, then return a clear, concise summary of the results. Base your summary entirely on what the tool returns — do not add information from outside the results.`,
    userMessage: query,
    toolDefinitions: TOOL_DEFINITIONS,
    requiredTools: ['search_web'],
    executeToolFn: async (toolName, toolInput) => {
      const start  = Date.now();
      const result = await callTool(toolName, toolInput, forwardMeta, null);
      if (timing) timing.push({ tool: toolName, durationMs: Date.now() - start, status: result.status });
      return result;
    },
  });

  const rawResult = toolCalls.find((tc) => tc.tool === 'search_web')?.result
    ?? { status: 'error', reason: 'search_web was not called' };

  return { summary: finalResponse, rawResult, toolCalls };
}

module.exports = { run };
