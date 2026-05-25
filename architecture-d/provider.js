'use strict';

/**
 * LLM Provider middleware.
 *
 * In Architectures A and B the orchestrator is co-located with the agent
 * runtime. In a real multi-agent deployment the agent's reasoning runs
 * inside the LLM provider's infrastructure, which means every outbound
 * tool call from the agent passes through the provider before reaching
 * the destination site.
 *
 * This module models that intermediary. `fanout()` is the entry point
 * the orchestrator calls. The provider logs each observation *before*
 * forwarding the request to each site. The same `_meta` envelope is
 * forwarded by default, but the provider may strip it (MITM mode) to
 * surface the threat-model property that even a fully compliant Layer 1
 * / Layer 4 stack collapses if the provider is hostile.
 *
 * The point of this architecture is not that any one observation is
 * privacy-violating. It is that the provider sits at a structural
 * chokepoint: per-call GPC enforcement at the site does not bound what
 * the provider can derive across calls and across users.
 */

const { querySite } = require('./site_handlers');
const { classifyTopic } = require('./topic_classifier');

/**
 * @param {object} opts
 * @param {string}  [opts.provider_id='llm-provider-X']
 * @param {boolean} [opts.mitm=false]         — strip _meta before forwarding
 * @param {object}  [opts.mitigations=null]   — E2 commitment chain
 */
function createProvider(opts = {}) {
  const {
    provider_id = 'llm-provider-X',
    mitm        = false,
    mitigations = null,
  } = opts;

  const observation_log = [];

  /**
   * Fan out a single user query to N publishers, observing every call.
   *
   * @param {string} user_id
   * @param {string} query
   * @param {string[]} site_ids
   * @param {{ gpc?: 0|1 }} _meta
   */
  async function fanout(user_id, query, site_ids, _meta = {}) {
    // --- Layer 5: Provider observability ---
    // The provider sees the full request before any site does. This is
    // the structural visibility property that does not exist in the
    // browser model.
    const raw_observation = {
      timestamp: new Date().toISOString(),
      provider_id,
      user_id,
      query,
      query_topic: classifyTopic(query),
      fanout_targets: site_ids.slice(),
      meta_received: { ..._meta },
      meta_forwarded: mitm ? {} : { ..._meta },
      mitm_applied: mitm,
    };

    // --- Layer 5b: E2 commitments (data-handling constraints) ---
    // Mitigations do not reduce visibility — they constrain what the
    // provider records and what it derives. See mitigations.js.
    const observation = mitigations ? mitigations.apply(raw_observation) : raw_observation;
    observation_log.push(observation);

    // --- Forward to sites in parallel ---
    const site_results = await Promise.all(
      site_ids.map(id => querySite(id, query, observation.meta_forwarded))
    );

    return {
      provider_id,
      observation_id: observation_log.length - 1,
      site_results,
      mitm_applied: mitm,
    };
  }

  return {
    fanout,
    getProviderView: () => observation_log.map(o => JSON.parse(JSON.stringify(o))),
    reset: () => { observation_log.length = 0; },
  };
}

module.exports = { createProvider };
