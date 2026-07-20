/**
 * In-process MCP client for the dedicated-field proposal. Mirrors
 * orchestrator/mcp_client.js, but applies withPrivacySignal() instead of
 * withGpc(), so the signal travels via params.privacySignals rather than
 * params._meta.
 */

const { withPrivacySignal } = require('./privacy_signal_policy.js');
const handlers = require('../mcp-server/tool_handlers.js');

const wrappedHandlers = {
  user_profile_lookup: withPrivacySignal('user_profile_lookup', handlers.user_profile_lookup),
  save_to_profile: withPrivacySignal('save_to_profile', handlers.save_to_profile),
  log_interaction: withPrivacySignal('log_interaction', handlers.log_interaction),
  search_web: withPrivacySignal('search_web', handlers.search_web),
};

/**
 * Simulate an MCP tools/call request carrying params.privacySignals.
 *
 * @param {string}  toolName
 * @param {object}  args
 * @param {object}  [privacySignals]   — maps to params.privacySignals; set { gpc: true } to opt out
 * @param {Array}   [timing]
 */
async function callTool(toolName, args, privacySignals = {}, timing = null) {
  const start = Date.now();
  const result = await wrappedHandlers[toolName](args, privacySignals);
  const elapsed = Date.now() - start;

  if (timing) {
    timing.push({ tool: toolName, durationMs: elapsed, status: result.status });
  }

  return result;
}

module.exports = { callTool };
