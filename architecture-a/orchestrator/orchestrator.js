/**
 * Orchestrator — entry point for a user request.
 *
 * Responsibilities:
 *   Layer 1: Read the GPC signal from the W3C Baggage header.
 *   Layer 2: Embed the signal in MCP _meta task envelopes for sub-agents.
 *   Layer 3: Obtain a signed JWT from the IdP and attach it to calls that
 *             cross the third-party trust boundary.
 *
 * @param {object} options
 * @param {string}  options.query           — user's query
 * @param {string}  options.user_id         — user identifier
 * @param {string}  [options.baggageHeader] — W3C Baggage header value from the incoming HTTP request
 * @param {boolean} [options.dropSignal]    — experiment: strip meta before forwarding
 * @param {object}  [options.timing]        — array to collect per-tool timings
 */

const { readGpcFromBaggage } = require('./baggage.js');
const { issueToken } = require('../mcp-server/identity_provider.js');
const dataAgent = require('../agents/data_agent.js');
const searchAgent = require('../agents/search_agent.js');

async function handleRequest(options) {
  const {
    query,
    user_id,
    baggageHeader = '',
    dropSignal = false,
    timing = [],
  } = options;

  // --- Layer 1: read GPC from W3C Baggage ---
  const gpc = readGpcFromBaggage(baggageHeader);

  // --- Layer 3: obtain JWT for third-party boundary ---
  // The JWT embeds the same GPC flag so the vendor can independently verify it.
  const jwt = issueToken('orchestrator', gpc);

  // --- Layer 2: build MCP _meta task envelope ---
  const meta = { gpc: gpc ? 1 : 0, jwt };

  // Dispatch to sub-agents in parallel
  const [searchResult, dataResult] = await Promise.all([
    searchAgent.run({ query, meta, timing, dropSignal }),
    dataAgent.run({
      user_id,
      query,
      response_summary: `Summary of search results for: ${query}`,
      meta,
      timing,
      dropSignal,
    }),
  ]);

  return {
    gpc_active: gpc,
    baggage_header: baggageHeader,
    meta_envelope: { gpc: meta.gpc },  // jwt excluded from output for readability
    search: searchResult,
    data: dataResult,
    timing,
  };
}

module.exports = { handleRequest };
