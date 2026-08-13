/**
 * Category B turn loop.
 *
 * Thin wrapper around the shared core/agent_loop.js. Enforcement (the
 * collection gate) lives in the platform code around the session, not here.
 */

'use strict';

const { runAgentLoop: baseRun } = require('../core/agent_loop');
const { DEFAULT_MODEL } = require('../core/ollama');

const MODEL = DEFAULT_MODEL;

async function runAgentLoop(opts) {
  return baseRun({
    ...opts,
    emptyResponseNudge: 'Please provide the polished email now.',
  });
}

module.exports = { runAgentLoop, MODEL };
