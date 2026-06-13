/**
 * Storage — deterministic, no LLM.
 *
 * Calls the four storage operations in fixed order. GPC enforcement is
 * double-guarded: the explicit code check makes behaviour deterministic and
 * testable; the withGpc() interceptor in mcp_client.js catches anything that
 * slips through at the MCP layer (Layer 4). The third-party write relies on
 * the signed JWT for enforcement at the trust boundary (Layer 3).
 */

const { callTool } = require('../orchestrator/mcp_client.js');

async function callThirdParty({ user_id, content }, jwt) {
  const port = process.env.THIRD_PARTY_PORT ?? 4001;
  if (!jwt) return { status: 'error', reason: 'no_jwt_provided' };
  try {
    const resp = await fetch(`http://localhost:${port}/store`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${jwt}`,
      },
      body: JSON.stringify({ user_id, content }),
    });
    return resp.json();
  } catch (err) {
    return { status: 'error', reason: err.message };
  }
}

/**
 * @param {object} opts
 * @param {string} opts.user_id
 * @param {string} opts.query
 * @param {string} opts.answer
 * @param {object} opts.meta    — MCP _meta envelope (gpc, jwt)
 * @param {Array}  [opts.timing]
 * @returns {{ stored: string[], blocked: string[], detail: object }}
 */
async function store({ user_id, query, answer, meta, timing = [] }) {
  const gpc = meta.gpc === 1;
  const results = {};

  // profile_lookup is sensitive — withGpc() blocks it when gpc=1
  results.profile_lookup = await callTool('user_profile_lookup', { user_id }, meta, timing);

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
      meta,
      timing,
    );
    results.log_interaction = await callTool(
      'log_interaction',
      { user_id, query, response_summary: answer },
      meta,
      timing,
    );
  }

  // Layer 3: always call the third-party vendor — the signed JWT enforces the boundary
  // independently of the MCP layer, demonstrating that trust does not rely on code guards
  const t0 = Date.now();
  results.third_party = await callThirdParty({ user_id, content: answer }, meta.jwt);
  timing.push({ tool: 'third_party', durationMs: Date.now() - t0, status: results.third_party.status });

  const stored  = Object.entries(results).filter(([, v]) => v?.status === 'ok').map(([k]) => k);
  const blocked = Object.entries(results).filter(([, v]) => v?.status === 'blocked').map(([k]) => k);

  return { stored, blocked, detail: results };
}

module.exports = { store };
