const searchAgent = require('../agents/search_agent.js');
const synthesisAgent = require('../agents/synthesis_agent.js');
const storage = require('../services/storage.js');
const { MODEL } = require('./agent_loop.js');

/**
 * Mirrors mcp/orchestrator/orchestrator.js: reads Sec-GPC, builds the Layer 2
 * signal envelope, dispatches the search and synthesis agents, then gates
 * storage. The only difference from the MCP version is the envelope shape:
 * A2A's Message.metadata instead of MCP's _meta.
 *
 * @param {object} options
 * @param {string}  options.query
 * @param {string}  options.user_id
 * @param {string}  [options.secGpc]   — value of the Sec-GPC request header ('1' or absent)
 * @param {Array}   [options.timing]
 */
async function handleRequest({ query, user_id, secGpc = '', timing = [] }) {
  // Layer 1: read GPC from Sec-GPC header (W3C GPC spec §3.3) — unchanged from the MCP version
  const gpc = secGpc === '1';

  // Layer 2: metadata envelope carried on every A2A message
  // gpc key is present only when the signal is active; absence means no signal
  const metadata = gpc ? { gpc: true } : {};

  // Agent 1: retrieval — LLM decides how many searches to run
  const searchResult = await searchAgent.run({ query, timing });

  // Agent 2: synthesis — LLM reasons over raw results, calls no tools
  const synthesisResult = await synthesisAgent.run({
    query,
    rawResults: searchResult.rawResults,
    timing,
  });

  // Deterministic storage — no LLM, GPC enforced in code and at the agent-server layer
  const storageResult = await storage.store({
    user_id,
    query,
    answer: synthesisResult.answer,
    metadata,
    timing,
  });

  return {
    model:            MODEL,
    gpc_active:       gpc,
    metadata_envelope: metadata,
    answer:           synthesisResult.answer,
    rawResults:       searchResult.rawResults,
    searchCalls:      searchResult.toolCalls,
    storageResult,
    timing,
  };
}

module.exports = { handleRequest };
