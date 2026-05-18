/**
 * LLM Orchestrator
 *
 * Runs its own LLM loop with two dispatch tools that delegate to specialist agents:
 *   - dispatch_to_search_agent  → runs llm_search_agent (search_web)
 *   - dispatch_to_data_agent    → runs llm_data_agent   (profile, log, save, vendor)
 *
 * The orchestrator decides the order and arguments; each agent runs its own
 * independent LLM loop. GPC enforcement is identical to the scripted pipeline —
 * the same withGpc() interceptors and JWT trust-boundary checks apply at the
 * agent layer regardless of what the orchestrator decides.
 */

const { runAgentLoop, MODEL } = require('./agent_loop.js');
const searchAgent = require('../agents/llm_search_agent.js');
const dataAgent   = require('../agents/llm_data_agent.js');
const { readGpcFromBaggage } = require('./baggage.js');
const { issueToken }         = require('../mcp-server/identity_provider.js');

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'dispatch_to_search_agent',
      description: 'Delegate a search task to the search agent. Returns a summary of the results.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The topic or question to research.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'dispatch_to_data_agent',
      description: 'Delegate data storage to the data agent. The agent will update the user profile, append to the interaction log, and sync with the third-party vendor. Provide the original query and the search summary so the agent can write meaningful records.',
      parameters: {
        type: 'object',
        properties: {
          query:          { type: 'string', description: 'The original user query.' },
          search_summary: { type: 'string', description: 'The summary returned by the search agent.' },
        },
        required: ['query', 'search_summary'],
      },
    },
  },
];

/**
 * @param {object}  options
 * @param {string}  options.query
 * @param {string}  options.user_id
 * @param {string}  [options.baggageHeader]
 * @param {boolean} [options.dropSignal]
 * @param {Array}   [options.timing]
 */
async function handleRequest({ query, user_id, baggageHeader = '', dropSignal = false, timing = [] }) {
  const gpc  = readGpcFromBaggage(baggageHeader);
  const jwt  = issueToken('orchestrator', gpc);
  const meta = { gpc: gpc ? 1 : 0, jwt };

  const agentResults = {};

  const { finalResponse, toolCalls } = await runAgentLoop({
    systemPrompt: `You are an AI research orchestrator. You coordinate two specialist agents:

- dispatch_to_search_agent: researches a topic and returns a summary
- dispatch_to_data_agent:   stores the interaction (profile, log, vendor sync)

For a research-and-save request you MUST:
1. Call dispatch_to_search_agent to research the topic
2. Call dispatch_to_data_agent with the search summary to store the results
3. Write a final response summarising what was found and confirming what was stored or blocked

If the data agent reports that some operations were blocked, acknowledge this in your final response.

Current user ID: ${user_id}`,
    userMessage: query,
    toolDefinitions: TOOL_DEFINITIONS,
    requiredTools: ['dispatch_to_search_agent', 'dispatch_to_data_agent'],
    executeToolFn: async (toolName, toolInput) => {
      if (toolName === 'dispatch_to_search_agent') {
        const result = await searchAgent.run({
          query: toolInput.query,
          meta,
          timing,
          dropSignal,
        });
        agentResults.search = result;
        return { status: 'ok', summary: result.summary };
      }

      if (toolName === 'dispatch_to_data_agent') {
        const result = await dataAgent.run({
          user_id,
          query:         toolInput.query,
          searchSummary: toolInput.search_summary,
          meta,
          timing,
          dropSignal,
        });
        agentResults.data = result;

        const stored  = result.toolCalls.filter((tc) => tc.result?.status === 'ok').map((tc) => tc.tool);
        const blocked = result.toolCalls.filter((tc) => tc.result?.status === 'blocked').map((tc) => tc.tool);
        return { status: 'ok', stored, blocked };
      }

      return { status: 'error', reason: `unknown tool: ${toolName}` };
    },
  });

  return {
    model:          MODEL,
    gpc_active:     gpc,
    baggage_header: baggageHeader,
    meta_envelope:  { gpc: meta.gpc },
    orchestrator: {
      finalResponse,
      toolCalls,
    },
    search_agent: agentResults.search
      ? { summary: agentResults.search.summary, toolCalls: agentResults.search.toolCalls }
      : null,
    data_agent: agentResults.data
      ? { summary: agentResults.data.summary, toolCalls: agentResults.data.toolCalls }
      : null,
    timing,
  };
}

module.exports = { handleRequest };
