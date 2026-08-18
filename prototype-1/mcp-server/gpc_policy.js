// Single source of truth for which MCP tools are GPC-sensitive.
// Any tool in this set touches personal data and must be blocked when gpc=1.

const SENSITIVE_TOOLS = new Set([
  'user_profile_lookup',
  'save_to_profile',
  'log_interaction',
]);

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
    const gpcSignal = _meta?.gpc === true || _meta?.gpc === 1 || _meta?.gpc === '1';

    if (gpcSignal && SENSITIVE_TOOLS.has(toolName)) {
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

module.exports = { SENSITIVE_TOOLS, withGpc };
