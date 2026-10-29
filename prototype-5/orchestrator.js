'use strict';

/**
 * orchestrator.js
 *
 * Processes every query in the classifier's table and routes each one through
 * either the inference engine (gate off) or the profile write gate (gate on).
 *
 * run(gateOn = false)
 *
 *   @param {boolean} gateOn — when true, the GPC signal is active and inference
 *                         is blocked for every query
 *
 *   @returns {Promise<{
 *     results:         Array<object>,  // per-query outcome records
 *     profileSnapshot: object,         // final profile state (attributes + blocked_count)
 *   }>}
 *
 * Per-query result shape (gate off):
 *   { query, status: 'derived', attributes, answer }
 *
 * Per-query result shape (gate on):
 *   { query, status: 'blocked', reason: 'profile_write_gate', would_have_written, answer }
 */

const classifier  = require('./query_classifier');
const mcpClient   = require('./mcp_client');
const engine      = require('./inference_engine');
const gate        = require('./profile_write_gate');
const { createProfileStore } = require('./profile_store');

async function run(gateOn = false) {
  const store   = createProfileStore();
  const queries = classifier.allQueries();
  const results = [];

  for (const query of queries) {
    const classified = await mcpClient.classify(query);

    let engineResult;
    if (gateOn) {
      engineResult = gate.block(query, classified, store);
    } else {
      engineResult = engine.derive(query, classified, store);
    }

    results.push({
      ...engineResult,
      answer: classified.answer,
    });
  }

  return {
    results,
    profileSnapshot: store.snapshot(),
  };
}

module.exports = { run };
