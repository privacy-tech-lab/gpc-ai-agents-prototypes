/**
 * LLM Data Agent
 *
 * Runs its own LLM loop with four tools: user_profile_lookup, save_to_profile,
 * log_interaction, and store_to_third_party. The agent receives the search
 * summary from the search agent and decides what to store.
 *
 * When GPC is active, sensitive tools return { status: "blocked" }. The model
 * is instructed to accept blocked responses and continue without retrying.
 */

const { runAgentLoop } = require('../orchestrator/agent_loop.js');
const { callTool }     = require('../orchestrator/mcp_client.js');

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'user_profile_lookup',
      description: 'Look up stored preferences and history for a user.',
      parameters: {
        type: 'object',
        properties: { user_id: { type: 'string' } },
        required: ['user_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_to_profile',
      description: 'Save a summary of this interaction to the user profile for future personalisation.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string' },
          data:    { type: 'object', description: 'Key/value pairs to save.' },
        },
        required: ['user_id', 'data'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'log_interaction',
      description: 'Append a record of this query and response summary to the interaction log.',
      parameters: {
        type: 'object',
        properties: {
          user_id:          { type: 'string' },
          query:            { type: 'string' },
          response_summary: { type: 'string' },
        },
        required: ['user_id', 'query', 'response_summary'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'store_to_third_party',
      description: 'Send the response summary to the third-party personalisation vendor for future retrieval.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['user_id', 'content'],
      },
    },
  },
];

async function callThirdParty(toolInput, jwt) {
  const port = process.env.THIRD_PARTY_PORT ?? 4001;
  if (!jwt) return { status: 'error', reason: 'no_jwt_provided' };
  try {
    const resp = await fetch(`http://localhost:${port}/store`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        Authorization:   `Bearer ${jwt}`,
      },
      body: JSON.stringify({ user_id: toolInput.user_id, content: toolInput.content }),
    });
    return resp.json();
  } catch (err) {
    return { status: 'error', reason: err.message };
  }
}

/**
 * @param {object}  task
 * @param {string}  task.user_id
 * @param {string}  task.query
 * @param {string}  task.searchSummary    — summary returned by the search agent
 * @param {object}  [task.meta]           — MCP _meta envelope (gpc, jwt)
 * @param {Array}   [task.timing]
 * @param {boolean} [task.dropSignal]     — strip meta before forwarding (experiment)
 * @returns {{ summary, toolCalls, profile_lookup, log_interaction, save_to_profile, third_party_store }}
 */
async function run({ user_id, query, searchSummary, meta = {}, timing = null, dropSignal = false }) {
  const forwardMeta = dropSignal ? {} : meta;

  const { finalResponse, toolCalls } = await runAgentLoop({
    systemPrompt: `You are a data agent responsible for storing and logging user interactions.

You have four tools and MUST call ALL of them in this order:
1. user_profile_lookup  — check the user's existing profile
2. save_to_profile      — save the query and a short summary to the user profile
3. log_interaction      — append an entry to the interaction log
4. store_to_third_party — send the summary to the third-party personalisation vendor

If a tool returns { "status": "blocked", "reason": "gpc_opt_out" }, accept the blocked response and continue to the next tool without retrying.

After all four tools have been attempted, write a brief final response describing what was stored and what (if anything) was blocked.

Current user ID: ${user_id}`,
    userMessage: `Store the following interaction.\nQuery: ${query}\nSearch summary: ${searchSummary}`,
    toolDefinitions: TOOL_DEFINITIONS,
    requiredTools: ['user_profile_lookup', 'save_to_profile', 'log_interaction', 'store_to_third_party'],
    executeToolFn: async (toolName, toolInput) => {
      const start = Date.now();
      let result;
      if (toolName === 'store_to_third_party') {
        result = await callThirdParty(toolInput, meta.jwt ?? null);
      } else {
        result = await callTool(toolName, toolInput, forwardMeta, null);
      }
      if (timing) timing.push({ tool: toolName, durationMs: Date.now() - start, status: result.status });
      return result;
    },
  });

  const byTool = Object.fromEntries(toolCalls.map((tc) => [tc.tool, tc.result]));

  return {
    summary:           finalResponse,
    toolCalls,
    profile_lookup:    byTool.user_profile_lookup,
    log_interaction:   byTool.log_interaction,
    save_to_profile:   byTool.save_to_profile,
    third_party_store: byTool.store_to_third_party,
  };
}

module.exports = { run };
