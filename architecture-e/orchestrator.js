'use strict';

/**
 * orchestrator.js
 *
 * Processes every query in the classifier's table and routes each one through
 * either the inference engine (B3 off) or the inference firewall (B3 on).
 *
 * run(b3 = false)
 *
 *   @param {boolean} b3 — when true, the GPC B3 signal is active and inference
 *                         is blocked for every query
 *
 *   @returns {Promise<{
 *     results:         Array<object>,  // per-query outcome records
 *     profileSnapshot: object,         // final profile state (attributes + blocked_count)
 *   }>}
 *
 * Per-query result shape (B3 off):
 *   { query, status: 'derived', attributes, answer }
 *
 * Per-query result shape (B3 on):
 *   { query, status: 'blocked', reason: 'b3_inference_firewall', would_have_written, answer }
 */

const classifier  = require('./query_classifier');
const mcpClient   = require('./mcp_client');
const engine      = require('./inference_engine');
const firewall    = require('./inference_firewall');
const { createProfileStore } = require('./profile_store');

async function run(b3 = false) {
  const store   = createProfileStore();
  const queries = classifier.allQueries();
  const results = [];

  for (const query of queries) {
    const classified = await mcpClient.classify(query);

    let engineResult;
    if (b3) {
      engineResult = firewall.block(query, classified, store);
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
