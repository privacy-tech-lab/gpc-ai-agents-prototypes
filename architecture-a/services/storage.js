/**
 * Storage — deterministic, no LLM.
 *
 * Calls the three storage operations in fixed order. GPC enforcement is
 * double-guarded: the explicit code check makes behaviour deterministic and
 * testable; the withGpc() interceptor in mcp_client.js catches anything that
 * slips through at the MCP layer (Layer 4).
 */

const { callTool } = require('../orchestrator/mcp_client.js');

/**
 * @param {object} opts
 * @param {string} opts.user_id
 * @param {string} opts.query
 * @param {string} opts.answer
 * @param {object} opts._meta   — MCP _meta envelope (gpc)
 * @param {Array}  [opts.timing]
 * @returns {{ stored: string[], blocked: string[], detail: object }}
 */
async function store({ user_id, query, answer, _meta, timing = [] }) {
  const gpc = _meta.gpc === 1;
  const results = {};

  // profile_lookup is sensitive — withGpc() blocks it when gpc=1
  results.profile_lookup = await callTool('user_profile_lookup', { user_id }, _meta, timing);

  // MCP-sensitive writes: double-guarded by code and by withGpc() at the MCP layer
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
      _meta,
      timing,
    );
    results.log_interaction = await callTool(
      'log_interaction',
      { user_id, query, response_summary: answer },
      _meta,
      timing,
    );
  }

  const stored  = Object.entries(results).filter(([, v]) => v?.status === 'ok').map(([k]) => k);
  const blocked = Object.entries(results).filter(([, v]) => v?.status === 'blocked').map(([k]) => k);

  return { stored, blocked, detail: results };
}

module.exports = { store };
