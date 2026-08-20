/**
 * Personalization — deterministic, no LLM. Reads (not writes) past user
 * data to feed into the synthesis agent, gated at two different
 * Category D boundaries:
 *
 *   - get_interaction_history (raw past interactions) needs D3 or better
 *   - user_profile_lookup (synthesized behavioral profile) needs baseline
 *
 * This is what actually makes D2 and D3 observable: without a real
 * consultation step to gate, blocking storage alone (D1) is the only
 * distinction that shows up in behavior. Runs before the synthesis
 * agent, replacing the old dead-end user_profile_lookup call that used
 * to happen post-hoc inside storage.js and go unused.
 */

const { callTool } = require('../orchestrator/mcp_client.js');
const { isAllowed } = require('../mcp-server/gpc_policy.js');

/**
 * @param {object} opts
 * @param {string} opts.user_id
 * @param {object} opts._meta   — MCP _meta envelope (gpc, persistence_scope)
 * @param {Array}  [opts.timing]
 * @returns {{ history: object|null, profile: object|null, historyConsulted: boolean, profileConsulted: boolean }}
 */
async function buildPersonalizationContext({ user_id, _meta, timing = [] }) {
  let history = null;
  let profile = null;

  const historyAllowed = isAllowed('get_interaction_history', _meta);
  if (historyAllowed) {
    const result = await callTool('get_interaction_history', { user_id }, _meta, timing);
    if (result.status === 'ok') history = result.result;
  } else {
    timing.push({ tool: 'get_interaction_history', durationMs: 0, status: 'blocked' });
  }

  const profileAllowed = isAllowed('user_profile_lookup', _meta);
  if (profileAllowed) {
    const result = await callTool('user_profile_lookup', { user_id }, _meta, timing);
    if (result.status === 'ok') profile = result.result;
  } else {
    timing.push({ tool: 'user_profile_lookup', durationMs: 0, status: 'blocked' });
  }

  return {
    history,
    profile,
    historyConsulted: history !== null,
    profileConsulted: profile !== null,
  };
}

module.exports = { buildPersonalizationContext };
