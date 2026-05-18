/**
 * Lightweight in-process MCP client that calls tools on the shared server.
 *
 * Rather than spawning a real stdio subprocess (which adds significant test
 * complexity), this module imports the tool handlers directly and applies the
 * same gpc_policy.js interceptors.  The observable behaviour — tool call
 * results including blocked responses — is identical.
 *
 * Layer 2: the `meta` argument maps to the MCP params._meta field, which is
 * how the GPC signal travels inside task envelopes between agents.
 */

const { withGpc } = require('../mcp-server/gpc_policy.js');
const handlers = require('../mcp-server/tool_handlers.js');

const wrappedHandlers = {
  user_profile_lookup: withGpc('user_profile_lookup', handlers.user_profile_lookup),
  save_to_profile: withGpc('save_to_profile', handlers.save_to_profile),
  log_interaction: withGpc('log_interaction', handlers.log_interaction),
  search_web: withGpc('search_web', handlers.search_web),
};

/**
 * Call a tool, embedding the GPC signal in the MCP metadata envelope.
 *
 * @param {string}  toolName
 * @param {object}  args      — tool-specific arguments
 * @param {object}  meta      — MCP _meta field; set meta.gpc=1 to opt out
 * @param {object}  [timing]  — optional array to push timing records into
 */
async function callTool(toolName, args, meta = {}, timing = null) {
  const start = Date.now();
  const result = await wrappedHandlers[toolName](args, meta);
  const elapsed = Date.now() - start;

  if (timing) {
    timing.push({ tool: toolName, durationMs: elapsed, status: result.status });
  }

  return result;
}

module.exports = { callTool };
