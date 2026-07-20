// Single source of truth for which operations are GPC-sensitive.
// Any operation in this set touches personal data and must be blocked when gpc is set.
// Mirrors mcp/mcp-server/gpc_policy.js, but reads the signal from an A2A
// Message's metadata field instead of MCP's _meta.

const SENSITIVE_OPERATIONS = new Set([
  'user_profile_lookup',
  'save_to_profile',
  'log_interaction',
]);

/**
 * Wrap an operation handler with GPC enforcement (Layer 4).
 *
 * Reads the GPC signal from metadata.gpc, which is the A2A Message.metadata
 * field forwarded on every message the orchestrator sends.
 *
 * @param {string} operation
 * @param {Function} handler  async (args) => result
 * @returns {Function}        async (args, metadata) => result | blocked-response
 */
function withPrivacyPolicy(operation, handler) {
  return async function privacyPolicyInterceptor(args, metadata = {}) {
    const gpcSignal = metadata?.gpc === true || metadata?.gpc === 1 || metadata?.gpc === '1';

    if (gpcSignal && SENSITIVE_OPERATIONS.has(operation)) {
      return {
        status: 'blocked',
        reason: 'gpc_opt_out',
        tool: operation,
        timestamp: new Date().toISOString(),
      };
    }

    const start = Date.now();
    const result = await handler(args, metadata);
    const durationMs = Date.now() - start;

    return { status: 'ok', tool: operation, result, durationMs };
  };
}

module.exports = { SENSITIVE_OPERATIONS, withPrivacyPolicy };
