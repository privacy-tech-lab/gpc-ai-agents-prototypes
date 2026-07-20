/**
 * Lightweight in-process MCP client that calls tools on the shared server.
 *
 * Rather than spawning a real stdio subprocess (which adds significant test
 * complexity), this module imports the tool handlers directly and applies the
 * same gpc_policy.js interceptors. The observable behaviour — tool call
 * results including blocked responses — is identical.
 *
 * Each call mirrors the MCP params structure: { name, arguments, _meta }.
 * The GPC signal travels in params._meta.gpc, matching how server.js reads it.
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
 * Simulate an MCP tools/call request.
 *
 * @param {string}  toolName           — maps to params.name
 * @param {object}  args               — maps to params.arguments
 * @param {object}  [_meta]            — maps to params._meta; set _meta.gpc=1 to opt out
 * @param {Array}   [timing]
 */
async function callTool(toolName, args, _meta = {}, timing = null) {
  const start = Date.now();
  const result = await wrappedHandlers[toolName](args, _meta);
  const elapsed = Date.now() - start;

  if (timing) {
    timing.push({ tool: toolName, durationMs: elapsed, status: result.status });
  }

  return result;
}

module.exports = { callTool };
