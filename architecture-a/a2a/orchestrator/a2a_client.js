/**
 * In-process A2A client for the demo. Mirrors mcp/orchestrator/mcp_client.js:
 * rather than running a real A2A agent server over HTTP, this builds a real-
 * shaped A2A Message object and dispatches directly to the local,
 * privacy-policy-wrapped handler. The observable behaviour — blocked vs ok
 * responses — is identical to what a real round trip through
 * agent-server/server.js would produce.
 *
 * Each call builds a Message: { kind: 'message', messageId, role: 'user',
 * parts: [{ kind: 'data', data: { operation, ...args } }], metadata }.
 * The GPC signal travels in message.metadata.gpc — A2A's closest equivalent
 * to MCP's _meta.gpc.
 */

const crypto = require('crypto');
const { withPrivacyPolicy } = require('../agent-server/privacy_policy.js');
const handlers = require('../agent-server/tool_handlers.js');

const wrappedHandlers = {
  user_profile_lookup: withPrivacyPolicy('user_profile_lookup', handlers.user_profile_lookup),
  save_to_profile: withPrivacyPolicy('save_to_profile', handlers.save_to_profile),
  log_interaction: withPrivacyPolicy('log_interaction', handlers.log_interaction),
};

/**
 * Simulate sending an A2A message: params ride in a data Part, the GPC
 * signal rides in Message.metadata.
 *
 * @param {string}  operation
 * @param {object}  args
 * @param {object}  [metadata]   — maps to Message.metadata; set { gpc: true } to opt out
 * @param {Array}   [timing]
 */
async function sendMessage(operation, args, metadata = {}, timing = null) {
  const message = {
    kind: 'message',
    messageId: crypto.randomUUID(),
    role: 'user',
    parts: [{ kind: 'data', data: { operation, ...args } }],
    metadata,
  };

  const start = Date.now();
  const result = await wrappedHandlers[operation](args, message.metadata);
  const elapsed = Date.now() - start;

  if (timing) {
    timing.push({ tool: operation, durationMs: elapsed, status: result.status });
  }

  return result;
}

module.exports = { sendMessage };
