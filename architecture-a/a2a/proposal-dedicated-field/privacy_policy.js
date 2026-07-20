// Proposed alternative to agent-server/privacy_policy.js: instead of digging
// the GPC signal out of the generic Message.metadata bag, read it from a
// dedicated top-level field, privacySignals, sent alongside
// role/parts/metadata/extensions on every message.
//
// The sensitive-operation registry is not duplicated here — it is imported
// from agent-server/privacy_policy.js so there is one source of truth
// regardless of which field carries the signal.

const { SENSITIVE_OPERATIONS } = require('../agent-server/privacy_policy.js');

/**
 * Wrap an operation handler with GPC enforcement, reading the signal from a
 * dedicated privacySignals field rather than metadata.
 *
 * @param {string} operation
 * @param {Function} handler  async (args) => result
 * @returns {Function}        async (args, privacySignals) => result | blocked-response
 */
function withPrivacySignal(operation, handler) {
  return async function privacySignalInterceptor(args, privacySignals = {}) {
    const gpcSignal = privacySignals?.gpc === true;

    if (gpcSignal && SENSITIVE_OPERATIONS.has(operation)) {
      return {
        status: 'blocked',
        reason: 'gpc_opt_out',
        tool: operation,
        timestamp: new Date().toISOString(),
      };
    }

    const start = Date.now();
    const result = await handler(args, privacySignals);
    const durationMs = Date.now() - start;

    return { status: 'ok', tool: operation, result, durationMs };
  };
}

module.exports = { SENSITIVE_OPERATIONS, withPrivacySignal };
