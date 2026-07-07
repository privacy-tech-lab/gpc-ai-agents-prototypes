const searchAgent = require('../agents/search_agent.js');
const synthesisAgent = require('../agents/synthesis_agent.js');
const storage = require('../services/storage.js');
const { MODEL } = require('./agent_loop.js');

/**
 * @param {object} options
 * @param {string}  options.query
 * @param {string}  options.user_id
 * @param {string}  [options.secGpc]   — value of the Sec-GPC request header ('1' or absent)
 * @param {Array}   [options.timing]
 */
async function handleRequest({ query, user_id, secGpc = '', timing = [] }) {
  // Layer 1: read GPC from Sec-GPC header (W3C GPC spec §3.3)
  const gpc = secGpc === '1';

  // Layer 2: _meta envelope carried on every downstream call
  // gpc key is present only when the signal is active; absence means no signal
  const _meta = gpc ? { gpc: 1 } : {};

  // Agent 1: retrieval — LLM decides how many searches to run
  const searchResult = await searchAgent.run({ query, _meta, timing });

  // Agent 2: synthesis — LLM reasons over raw results, calls no tools
  const synthesisResult = await synthesisAgent.run({
    query,
    rawResults: searchResult.rawResults,
    _meta,
    timing,
  });

  // Deterministic storage — no LLM, GPC enforced in code and at MCP layer
  const storageResult = await storage.store({
    user_id,
    query,
    answer: synthesisResult.answer,
    _meta,
    timing,
  });

  return {
    model:         MODEL,
    gpc_active:    gpc,
    meta_envelope: _meta,
    answer:        synthesisResult.answer,
    rawResults:    searchResult.rawResults,
    searchCalls:   searchResult.toolCalls,
    storageResult,
    timing,
  };
}

module.exports = { handleRequest };
