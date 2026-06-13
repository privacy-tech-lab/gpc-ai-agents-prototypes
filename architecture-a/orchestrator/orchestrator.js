const { readGpcFromBaggage } = require('./baggage.js');
const { issueToken } = require('../mcp-server/identity_provider.js');
const searchAgent = require('../agents/llm_search_agent.js');
const synthesisAgent = require('../agents/synthesis_agent.js');
const storage = require('../agents/storage.js');
const { MODEL } = require('./agent_loop.js');

/**
 * @param {object} options
 * @param {string}  options.query
 * @param {string}  options.user_id
 * @param {string}  [options.baggageHeader]
 * @param {Array}   [options.timing]
 */
async function handleRequest({ query, user_id, baggageHeader = '', timing = [] }) {
  // Layer 1: extract GPC from transport header
  const gpc = readGpcFromBaggage(baggageHeader);

  // Layer 3: mint JWT encoding GPC before any boundary crossing
  const jwt = issueToken('orchestrator', gpc);

  // Layer 2: meta envelope carried on every downstream call
  const meta = { gpc: gpc ? 1 : 0, jwt };

  // Agent 1: retrieval — LLM decides how many searches to run
  const searchResult = await searchAgent.run({ query, meta, timing });

  // Agent boundary: same meta envelope forwarded to synthesis agent
  // Agent 2: synthesis — LLM reasons over raw results, calls no tools
  const synthesisResult = await synthesisAgent.run({
    query,
    rawResults: searchResult.rawResults,
    meta,
    timing,
  });

  // Deterministic storage — no LLM, GPC enforced in code and at MCP layer
  const storageResult = await storage.store({
    user_id,
    query,
    answer: synthesisResult.answer,
    meta,
    timing,
  });

  return {
    model:         MODEL,
    gpc_active:    gpc,
    meta_envelope: { gpc: meta.gpc },
    answer:        synthesisResult.answer,
    rawResults:    searchResult.rawResults,
    searchCalls:   searchResult.toolCalls,
    storageResult,
    timing,
  };
}

module.exports = { handleRequest };
