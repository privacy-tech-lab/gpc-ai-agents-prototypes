/**
 * Search Agent — handles web search.
 *
 * search_web is not GPC-sensitive, so it always runs regardless of the signal.
 * We still forward meta for completeness (future tools on this agent may be sensitive).
 */

const { callTool } = require('../orchestrator/mcp_client.js');

/**
 * @param {object} task
 * @param {string} task.query
 * @param {object} [task.meta]
 * @param {object} [task.timing]
 * @param {boolean} [task.dropSignal]
 */
async function run(task) {
  const { query, meta = {}, timing = null, dropSignal = false } = task;
  const forwardMeta = dropSignal ? {} : meta;

  const result = await callTool('search_web', { query }, forwardMeta, timing);
  return { search: result };
}

module.exports = { run };
