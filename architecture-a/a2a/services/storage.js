/**
 * Storage — deterministic, no LLM. Mirrors mcp/services/storage.js: same
 * fixed-order storage operations, same double-guard pattern, but dispatches
 * via a2a_client.sendMessage() and checks metadata.gpc instead of _meta.gpc.
 */

const { sendMessage } = require('../orchestrator/a2a_client.js');

/**
 * @param {object} opts
 * @param {string} opts.user_id
 * @param {string} opts.query
 * @param {string} opts.answer
 * @param {object} opts.metadata   — A2A Message.metadata envelope (gpc)
 * @param {Array}  [opts.timing]
 * @returns {{ stored: string[], blocked: string[], detail: object }}
 */
async function store({ user_id, query, answer, metadata, timing = [] }) {
  const gpc = metadata.gpc === true;
  const results = {};

  // profile_lookup is sensitive — withPrivacyPolicy() blocks it when gpc is set
  results.profile_lookup = await sendMessage('user_profile_lookup', { user_id }, metadata, timing);

  // Sensitive writes: double-guarded by code and by withPrivacyPolicy() at the agent-server layer
  if (gpc) {
    const blocked = { status: 'blocked', reason: 'gpc_opt_out' };
    results.save_to_profile = blocked;
    results.log_interaction  = blocked;
    timing.push(
      { tool: 'save_to_profile', durationMs: 0, status: 'blocked' },
      { tool: 'log_interaction',  durationMs: 0, status: 'blocked' },
    );
  } else {
    results.save_to_profile = await sendMessage(
      'save_to_profile',
      { user_id, data: { query, answer } },
      metadata,
      timing,
    );
    results.log_interaction = await sendMessage(
      'log_interaction',
      { user_id, query, response_summary: answer },
      metadata,
      timing,
    );
  }

  const stored  = Object.entries(results).filter(([, v]) => v?.status === 'ok').map(([k]) => k);
  const blocked = Object.entries(results).filter(([, v]) => v?.status === 'blocked').map(([k]) => k);

  return { stored, blocked, detail: results };
}

module.exports = { store };
