/**
 * Data Agent — handles profile lookups, saves, interaction logging, and
 * the third-party vector store write.
 *
 * It receives an MCP-style task envelope from the Orchestrator that includes
 * a `meta` field carrying gpc and the JWT for the trust-boundary call.
 */

const { callTool } = require('../orchestrator/mcp_client.js');
// Node 18+ native fetch is available globally; no import needed.

function thirdPartyUrl() {
  return `http://localhost:${process.env.THIRD_PARTY_PORT ?? 4001}/store`;
}

/**
 * @param {object} task
 * @param {string} task.user_id
 * @param {string} task.query
 * @param {string} task.response_summary
 * @param {object} task.meta           — MCP _meta envelope (contains gpc, jwt)
 * @param {object} [task.timing]       — optional timing collector
 * @param {boolean} [task.dropSignal]  — if true, strip meta before forwarding (signal-drop experiment)
 */
async function run(task) {
  const { user_id, query, response_summary, meta = {}, timing = null, dropSignal = false } = task;
  const forwardMeta = dropSignal ? {} : meta;

  const results = {};

  // 1. Look up existing profile
  results.profile_lookup = await callTool(
    'user_profile_lookup',
    { user_id },
    forwardMeta,
    timing
  );

  // 2. Log the interaction
  results.log_interaction = await callTool(
    'log_interaction',
    { user_id, query, response_summary },
    forwardMeta,
    timing
  );

  // 3. Save summary back to profile
  results.save_to_profile = await callTool(
    'save_to_profile',
    { user_id, data: { last_query: query, last_summary: response_summary } },
    forwardMeta,
    timing
  );

  // 4. Write to third-party vector store (trust-boundary crossing)
  const jwt = meta.jwt ?? null;
  const t0 = Date.now();
  let thirdPartyResult;

  if (!jwt) {
    thirdPartyResult = { status: 'error', reason: 'no_jwt_provided' };
  } else {
    try {
      const resp = await fetch(thirdPartyUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ user_id, content: response_summary }),
      });
      thirdPartyResult = await resp.json();
    } catch (err) {
      thirdPartyResult = { status: 'error', reason: err.message };
    }
  }

  if (timing) {
    timing.push({ tool: 'third_party_store', durationMs: Date.now() - t0, status: thirdPartyResult.status });
  }

  results.third_party_store = thirdPartyResult;

  return results;
}

module.exports = { run };
