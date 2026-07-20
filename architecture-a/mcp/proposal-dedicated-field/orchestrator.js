/**
 * Orchestrator for the dedicated-field proposal. Mirrors
 * orchestrator/orchestrator.js, but builds a privacySignals field instead of
 * a _meta envelope for Layer 2.
 *
 * search_agent.js and synthesis_agent.js are reused unchanged: search_web is
 * not GPC-sensitive, so it behaves identically no matter which envelope
 * shape the demo carries the signal in. Only storage.js differs.
 */

const searchAgent = require('../agents/search_agent.js');
const synthesisAgent = require('../agents/synthesis_agent.js');
const storage = require('./storage.js');
const { MODEL } = require('../orchestrator/agent_loop.js');

/**
 * @param {object} options
 * @param {string}  options.query
 * @param {string}  options.user_id
 * @param {string}  [options.secGpc]   — value of the Sec-GPC request header ('1' or absent)
 * @param {Array}   [options.timing]
 */
async function handleRequest({ query, user_id, secGpc = '', timing = [] }) {
  // Layer 1: read GPC from Sec-GPC header (W3C GPC spec §3.3) — unchanged from the _meta version
  const gpc = secGpc === '1';

  // Layer 2 (proposed): dedicated top-level field, sibling to name/arguments/_meta,
  // instead of nesting the signal inside _meta
  const privacySignals = gpc ? { gpc: true } : {};

  // Agent 1: retrieval — LLM decides how many searches to run.
  // search_web is not sensitive, so this branch is identical to the _meta pipeline.
  const searchResult = await searchAgent.run({ query, _meta: {}, timing });

  // Agent 2: synthesis — LLM reasons over raw results, calls no tools
  const synthesisResult = await synthesisAgent.run({
    query,
    rawResults: searchResult.rawResults,
    _meta: {},
    timing,
  });

  // Deterministic storage — no LLM, GPC enforced in code and at MCP layer via privacySignals
  const storageResult = await storage.store({
    user_id,
    query,
    answer: synthesisResult.answer,
    privacySignals,
    timing,
  });

  return {
    model:         MODEL,
    gpc_active:    gpc,
    privacy_signals_envelope: privacySignals,
    answer:        synthesisResult.answer,
    rawResults:    searchResult.rawResults,
    searchCalls:   searchResult.toolCalls,
    storageResult,
    timing,
  };
}

module.exports = { handleRequest };
