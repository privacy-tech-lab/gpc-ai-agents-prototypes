// Single source of truth for which MCP tools are GPC-sensitive.
// Any tool in this set touches personal data and must be blocked when gpc=1.

const SENSITIVE_TOOLS = new Set([
  'user_profile_lookup',
  'save_to_profile',
  'log_interaction',
]);

// Category D (persistence) scope tiers, most restrictive first.
// get_interaction_history reads raw past interactions and needs D3 or
// better; at d1 (the default when gpc=1 and no scope is given) or d2
// it stays blocked, same as the sensitive-tool registry.
const SCOPE_RANK = { d1: 1, d2: 2, d3: 3 };

function hasGpcSignal(_meta = {}) {
  return _meta?.gpc === true || _meta?.gpc === 1 || _meta?.gpc === '1';
}

/**
 * Whether a tool call is allowed given the current GPC/_meta state.
 *
 * @param {string} toolName
 * @param {object} [_meta]  — _meta.gpc and, for get_interaction_history, _meta.persistence_scope
 * @returns {boolean}
 */
function isAllowed(toolName, _meta = {}) {
  if (!hasGpcSignal(_meta)) return true;

  if (toolName === 'get_interaction_history') {
    const scope = _meta?.persistence_scope || 'd1';
    return (SCOPE_RANK[scope] || SCOPE_RANK.d1) >= SCOPE_RANK.d3;
  }

  return !SENSITIVE_TOOLS.has(toolName);
}

/**
 * Wrap a tool handler with GPC enforcement (Layer 4).
 *
 * Reads the GPC signal from _meta.gpc, which is the MCP params._meta field
 * forwarded by every agent on each tool call.
 *
 * @param {string} toolName
 * @param {Function} handler  async (args) => result
 * @returns {Function}        async (args, _meta) => result | blocked-response
 */
function withGpc(toolName, handler) {
  return async function gpcInterceptor(args, _meta = {}) {
    if (!isAllowed(toolName, _meta)) {
      return {
        status: 'blocked',
        reason: 'gpc_opt_out',
        tool: toolName,
        timestamp: new Date().toISOString(),
      };
    }

    const start = Date.now();
    const result = await handler(args, _meta);
    const durationMs = Date.now() - start;

    return { status: 'ok', tool: toolName, result, durationMs };
  };
}

module.exports = { SENSITIVE_TOOLS, isAllowed, withGpc };
