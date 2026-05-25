'use strict';

/**
 * Orchestrator — entry point for a research-with-fanout request.
 *
 * Responsibilities:
 *   Layer 2: Build the MCP _meta envelope carrying GPC into every call.
 *   Fan out: Hand off to the provider middleware with the full target set.
 *
 * The orchestrator does not call sites directly. In the Architecture D
 * threat model the provider sits between the orchestrator and the sites,
 * which is why all fanout flows through `provider.fanout()`.
 */

const { listPublisherIds } = require('./tool_registry');

/**
 * Fan out a query to every publisher in the registry.
 *
 * @param {object} provider  — created by createProvider()
 * @param {string} user_id
 * @param {string} query
 * @param {{ gpc?: 0|1 }} _meta
 */
async function fanoutAll(provider, user_id, query, _meta = {}) {
  return provider.fanout(user_id, query, listPublisherIds(), _meta);
}

/**
 * Fan out a query to a specified subset of publishers.
 */
async function fanoutSelected(provider, user_id, query, site_ids, _meta = {}) {
  return provider.fanout(user_id, query, site_ids, _meta);
}

module.exports = { fanoutAll, fanoutSelected };
