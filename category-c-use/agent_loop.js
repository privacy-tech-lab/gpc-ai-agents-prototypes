/**
 * Category C turn loop.
 *
 * Thin wrapper around the shared core/agent_loop.js. Enforcement (the use
 * gate) lives in the platform code around the session, not here.
 */

'use strict';

const { runAgentLoop: baseRun } = require('../core/agent_loop');
const { DEFAULT_MODEL } = require('../core/ollama');

const MODEL = DEFAULT_MODEL;

async function runAgentLoop(opts) {
  return baseRun({
    ...opts,
    emptyResponseNudge: 'Please give the patient a brief answer now.',
  });
}

module.exports = { runAgentLoop, MODEL };
