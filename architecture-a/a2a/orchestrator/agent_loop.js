/**
 * Architecture A turn loop (A2A variant).
 *
 * Thin wrapper around the shared core/agent_loop.js, identical to the MCP
 * variant's orchestrator/agent_loop.js. The turn loop itself has nothing to
 * do with which protocol carries the privacy signal.
 */

const { runAgentLoop: baseRun } = require('../../../core/agent_loop');
const { DEFAULT_MODEL }         = require('../../../core/ollama');

const MODEL = DEFAULT_MODEL;

async function runAgentLoop(opts) {
  return baseRun({
    ...opts,
    emptyResponseNudge: 'Please provide a brief summary of what you found and what was stored.',
  });
}

module.exports = { runAgentLoop, MODEL };
