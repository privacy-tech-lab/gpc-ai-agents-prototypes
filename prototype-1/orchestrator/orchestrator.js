const storage = require('../services/storage.js');
const { buildPersonalizationContext } = require('../services/personalization.js');
const { MODEL } = require('./agent_loop.js');
const { callAgent } = require('./a2a_client.js');
const { closeClient } = require('./mcp_client.js');

let runtimePromise = null;

/**
 * Starts (once, memoized) the search and synthesis agents' A2A servers.
 * Both run in-process (app.listen(0)) so jest.mock() on the underlying
 * agent modules is still observed by the executor that wraps them.
 */
function getRuntime() {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const searchAgentServer = require('../agents/search_agent_server.js');
      const synthesisAgentServer = require('../agents/synthesis_agent_server.js');
      const [search, synthesis] = await Promise.all([
        searchAgentServer.start(),
        synthesisAgentServer.start(),
      ]);
      return { search, synthesis };
    })();
  }
  return runtimePromise;
}

/** Closes the A2A agent servers and the MCP client. Call in test/harness teardown. */
async function shutdown() {
  if (runtimePromise) {
    const runtime = await runtimePromise;
    runtimePromise = null;
    await Promise.all([runtime.search.close(), runtime.synthesis.close()]);
  }
  await closeClient();
}

/**
 * @param {object} options
 * @param {string}  options.query
 * @param {string}  options.user_id
 * @param {string}  [options.secGpc]           — value of the Sec-GPC request header ('1' or absent)
 * @param {string}  [options.persistenceScope] — Category D tier ('d1' | 'd2' | 'd3'), only meaningful when secGpc is '1'
 * @param {Array}   [options.timing]
 */
async function handleRequest({ query, user_id, secGpc = '', persistenceScope, timing = [] }) {
  // Layer 1: read GPC from Sec-GPC header (W3C GPC spec §3.3)
  const gpc = secGpc === '1';

  // Layer 2: metadata envelope carried on every downstream call —
  // MCP's params._meta on tool calls, A2A's Message.metadata on agent calls.
  // gpc key is present only when the signal is active; absence means no signal
  const _meta = gpc ? { gpc: 1, ...(persistenceScope ? { persistence_scope: persistenceScope } : {}) } : {};

  const { search, synthesis } = await getRuntime();

  // Agent 1: retrieval — reached over A2A; the LLM decides how many searches to run.
  // Personalization consultation (Category D tiers) runs alongside it, before synthesis.
  const [searchReply, personalization] = await Promise.all([
    callAgent({ baseUrl: search.url, text: query, metadata: _meta }),
    buildPersonalizationContext({ user_id, _meta, timing }),
  ]);
  const rawResults = searchReply.metadata.rawResults ?? [];
  const searchCalls = searchReply.metadata.toolCalls ?? [];
  if (Array.isArray(searchReply.metadata.timing)) timing.push(...searchReply.metadata.timing);

  // Agent 2: synthesis — reached over A2A; the LLM reasons over raw results, calls no tools
  const synthesisReply = await callAgent({
    baseUrl: synthesis.url,
    text: query,
    metadata: { ..._meta, rawResults },
  });

  // Deterministic storage — no LLM, GPC enforced in code and at the MCP layer
  const storageResult = await storage.store({
    user_id,
    query,
    answer: synthesisReply.text,
    _meta,
    timing,
  });

  return {
    model:         MODEL,
    gpc_active:    gpc,
    meta_envelope: _meta,
    answer:        synthesisReply.text,
    rawResults,
    searchCalls,
    storageResult,
    personalization,
    timing,
  };
}

module.exports = { handleRequest, shutdown };
