/**
 * Storage for the dedicated-field proposal. Mirrors services/storage.js, but
 * takes privacySignals instead of _meta and checks privacySignals.gpc.
 */

const { callTool } = require('./mcp_client.js');

/**
 * @param {object} opts
 * @param {string} opts.user_id
 * @param {string} opts.query
 * @param {string} opts.answer
 * @param {object} opts.privacySignals   — dedicated top-level field (gpc)
 * @param {Array}  [opts.timing]
 * @returns {{ stored: string[], blocked: string[], detail: object }}
 */
async function store({ user_id, query, answer, privacySignals, timing = [] }) {
  const gpc = privacySignals.gpc === true;
  const results = {};

  // profile_lookup is sensitive — withPrivacySignal() blocks it when gpc=true
  results.profile_lookup = await callTool('user_profile_lookup', { user_id }, privacySignals, timing);

  // MCP-sensitive writes: double-guarded by code and by withPrivacySignal() at the MCP layer
  if (gpc) {
    const blocked = { status: 'blocked', reason: 'gpc_opt_out' };
    results.save_to_profile = blocked;
    results.log_interaction  = blocked;
    timing.push(
      { tool: 'save_to_profile', durationMs: 0, status: 'blocked' },
      { tool: 'log_interaction',  durationMs: 0, status: 'blocked' },
    );
  } else {
    results.save_to_profile = await callTool(
      'save_to_profile',
      { user_id, data: { query, answer } },
      privacySignals,
      timing,
    );
    results.log_interaction = await callTool(
      'log_interaction',
      { user_id, query, response_summary: answer },
      privacySignals,
      timing,
    );
  }

  const stored  = Object.entries(results).filter(([, v]) => v?.status === 'ok').map(([k]) => k);
  const blocked = Object.entries(results).filter(([, v]) => v?.status === 'blocked').map(([k]) => k);

  return { stored, blocked, detail: results };
}

module.exports = { store };
