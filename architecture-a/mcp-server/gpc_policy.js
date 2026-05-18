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
 * @param {string} toolName
 * @param {Function} handler  async (args) => result
 * @returns {Function}        async (args, meta) => result | blocked-response
 */
function withGpc(toolName, handler) {
  return async function gpcInterceptor(args, meta = {}) {
    const gpcSignal = meta?.gpc === true || meta?.gpc === 1 || meta?.gpc === '1';

    if (gpcSignal && SENSITIVE_TOOLS.has(toolName)) {
      return {
        status: 'blocked',
        reason: 'gpc_opt_out',
        tool: toolName,
        timestamp: new Date().toISOString(),
      };
    }

    const start = Date.now();
    const result = await handler(args, meta);
    const durationMs = Date.now() - start;

    return { status: 'ok', tool: toolName, result, durationMs };
  };
}

module.exports = { SENSITIVE_TOOLS, withGpc };
