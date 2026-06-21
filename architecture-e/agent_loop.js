/**
 * Architecture E turn loop.
 *
 * Thin wrapper around the shared core/agent_loop.js. Enforcement (the
 * inference firewall) lives in the caller's executeToolFn, not here.
 */

const { runAgentLoop: baseRun } = require('../core/agent_loop');
const { DEFAULT_MODEL }         = require('../core/ollama');

const MODEL = DEFAULT_MODEL;

async function runAgentLoop(opts) {
  return baseRun({
    ...opts,
    emptyResponseNudge: 'Please give the user a brief answer.',
  });
}

module.exports = { runAgentLoop, MODEL };
