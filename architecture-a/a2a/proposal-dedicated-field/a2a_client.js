/**
 * In-process A2A client for the dedicated-field proposal. Mirrors
 * orchestrator/a2a_client.js, but applies withPrivacySignal() instead of
 * withPrivacyPolicy(), so the signal travels via Message.privacySignals
 * rather than Message.metadata.
 */

const crypto = require('crypto');
const { withPrivacySignal } = require('./privacy_policy.js');
const handlers = require('../agent-server/tool_handlers.js');

const wrappedHandlers = {
  user_profile_lookup: withPrivacySignal('user_profile_lookup', handlers.user_profile_lookup),
  save_to_profile: withPrivacySignal('save_to_profile', handlers.save_to_profile),
  log_interaction: withPrivacySignal('log_interaction', handlers.log_interaction),
};

/**
 * Simulate sending an A2A message carrying Message.privacySignals.
 *
 * @param {string}  operation
 * @param {object}  args
 * @param {object}  [privacySignals]   — maps to Message.privacySignals; set { gpc: true } to opt out
 * @param {Array}   [timing]
 */
async function sendMessage(operation, args, privacySignals = {}, timing = null) {
  const message = {
    kind: 'message',
    messageId: crypto.randomUUID(),
    role: 'user',
    parts: [{ kind: 'data', data: { operation, ...args } }],
    privacySignals,
  };

  const start = Date.now();
  const result = await wrappedHandlers[operation](args, message.privacySignals);
  const elapsed = Date.now() - start;

  if (timing) {
    timing.push({ tool: operation, durationMs: elapsed, status: result.status });
  }

  return result;
}

module.exports = { sendMessage };
