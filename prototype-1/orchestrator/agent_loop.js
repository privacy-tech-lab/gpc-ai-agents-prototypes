/**
 * Prototype 1 turn loop.
 *
 * Thin wrapper around the shared core/agent_loop.js. Sets the nudge prompt
 * used when the model returns an empty content (prototype-1's variant asks for
 * a summary of what was found and stored).
 */

const { runAgentLoop: baseRun } = require('../../core/agent_loop');
const { DEFAULT_MODEL }         = require('../../core/ollama');

const MODEL = DEFAULT_MODEL;

async function runAgentLoop(opts) {
  return baseRun({
    ...opts,
    emptyResponseNudge: 'Please provide a brief summary of what you found and what was stored.',
  });
}

module.exports = { runAgentLoop, MODEL };
