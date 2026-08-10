/**
 * Category A turn loop.
 *
 * Thin wrapper around the shared core/agent_loop.js. Enforcement (the
 * presence gate) lives in the caller's executeToolFn, not here.
 */

'use strict';

const { runAgentLoop: baseRun } = require('../core/agent_loop');
const { DEFAULT_MODEL } = require('../core/ollama');

const MODEL = DEFAULT_MODEL;

async function runAgentLoop(opts) {
  return baseRun({
    ...opts,
    emptyResponseNudge: 'Please give a brief summary of what you did.',
  });
}

module.exports = { runAgentLoop, MODEL };
