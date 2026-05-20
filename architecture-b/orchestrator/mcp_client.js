/**
 * Lightweight in-process MCP client.
 *
 * Imports tool handlers directly and applies withPurposeCheck() interceptors,
 * mirroring the observable behaviour of a real stdio MCP subprocess without
 * the spawning overhead.
 *
 * The `meta` argument maps to MCP params._meta, carrying gpc, purpose, and
 * the optional gpc_scope list for partial opt-outs.
 */

const { withPurposeCheck } = require('../mcp-server/purpose_registry.js');
const handlers              = require('../mcp-server/tool_handlers.js');

const wrappedHandlers = {
  get_medical_records:    withPurposeCheck('get_medical_records',     handlers.get_medical_records),
  answer_question:        withPurposeCheck('answer_question',         handlers.answer_question),
  log_interaction:        withPurposeCheck('log_interaction',         handlers.log_interaction),
  update_interest_profile:withPurposeCheck('update_interest_profile', handlers.update_interest_profile),
  add_to_training_set:    withPurposeCheck('add_to_training_set',     handlers.add_to_training_set),
};

/**
 * @param {string}  toolName
 * @param {object}  args      — tool-specific arguments
 * @param {object}  meta      — carries gpc, purpose, and optionally gpc_scope
 * @param {Array}   [timing]  — optional array to push timing records into
 */
async function callTool(toolName, args, meta = {}, timing = null) {
  const start  = Date.now();
  const result = await wrappedHandlers[toolName](args, meta);
  const elapsed = Date.now() - start;

  if (timing) {
    timing.push({ tool: toolName, purpose: meta.purpose ?? null, durationMs: elapsed, status: result.status });
  }

  return result;
}

module.exports = { callTool };
