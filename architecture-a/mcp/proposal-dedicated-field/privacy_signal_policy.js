// Proposed alternative to mcp-server/gpc_policy.js: instead of digging the GPC
// signal out of the generic _meta envelope, read it from a dedicated top-level
// field, privacySignals, sent alongside name/arguments/_meta on every tool call.
//
// The sensitive-tool registry is not duplicated here — it is imported from
// gpc_policy.js so there is one source of truth regardless of which envelope
// carries the signal.

const { SENSITIVE_TOOLS } = require('../mcp-server/gpc_policy.js');

/**
 * Wrap a tool handler with GPC enforcement, reading the signal from a
 * dedicated privacySignals field rather than _meta.
 *
 * @param {string} toolName
 * @param {Function} handler  async (args) => result
 * @returns {Function}        async (args, privacySignals) => result | blocked-response
 */
function withPrivacySignal(toolName, handler) {
  return async function privacySignalInterceptor(args, privacySignals = {}) {
    const gpcSignal = privacySignals?.gpc === true;

    if (gpcSignal && SENSITIVE_TOOLS.has(toolName)) {
      return {
        status: 'blocked',
        reason: 'gpc_opt_out',
        tool: toolName,
        timestamp: new Date().toISOString(),
      };
    }

    const start = Date.now();
    const result = await handler(args, privacySignals);
    const durationMs = Date.now() - start;

    return { status: 'ok', tool: toolName, result, durationMs };
  };
}

module.exports = { SENSITIVE_TOOLS, withPrivacySignal };
