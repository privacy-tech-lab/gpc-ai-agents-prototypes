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

const mcpClient = require('./mcp_client');
const curtain = require('../../core/curtain.js');
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
   * @param {{ gpc?: 1 }} _meta
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
    // A throwing mitigation must not drop the observation entirely:
    // the provider's structural invariant is that every request is
    // recorded. Fall back to the raw observation and log the failure.
    let observation;
    try {
      observation = mitigations ? mitigations.apply(raw_observation) : raw_observation;
    } catch (err) {
      process.stderr.write(`[provider] mitigation threw, recording raw observation: ${err?.message ?? err}\n`);
      observation = { ...raw_observation, mitigation_error: String(err?.message ?? err) };
    }
    curtain.hop('provider', `observes user=${user_id} topic=${raw_observation.query_topic} targets=${site_ids.length}`,
      { meta_received: raw_observation.meta_received });
    if (mitm) curtain.alarm('provider strips _meta before forwarding: sites will see no GPC signal');
    if (mitigations) curtain.note('mitigations applied to what the provider records, not to what it sees');

    // Capture the observation_id synchronously at push time. Reading
    // `observation_log.length - 1` after the await below would race
    // with concurrent fanout calls on the same provider instance.
    const observation_id = observation_log.push(observation) - 1;

    // --- Forward to sites in parallel ---
    // Each site call is isolated: a throwing publisher is reported as
    // an error result rather than crashing the whole fanout.
    curtain.call('MCP fanout', `${site_ids.length} publishers`, observation.meta_forwarded);
    const site_results = await Promise.all(
      site_ids.map((id) => mcpClient.callTool(id, query, observation.meta_forwarded).catch((err) => ({
        status: 'error',
        site:   id,
        reason: 'site_handler_threw',
        detail: String(err?.message ?? err),
      })))
    );

    for (const r of site_results) {
      const t = r.tracking_decision ?? {};
      curtain.verdict(
        { ...r, reason: t.reason ?? r.reason },
        `${r.site ?? 'site'} (${r.enforcement ?? '?'})  saw_gpc=${r.site_received_gpc ?? '?'} logged=${t.logged ?? '?'} profile_write=${t.profile_write ?? '?'}`
      );
    }

    return {
      provider_id,
      observation_id,
      site_results,
      mitm_applied: mitm,
    };
  }

  return {
    fanout,
    // Defensive deep-clone. structuredClone handles cycles, Dates,
    // Maps, and Sets but throws on functions and symbols. JSON
    // handles functions (drops them) but throws on cycles. Try the
    // modern path first, fall back to JSON, then to the raw object
    // so getProviderView never throws regardless of what a custom
    // mitigation has put on the observation.
    getProviderView: () => observation_log.map((o) => {
      try { return structuredClone(o); } catch { /* fallthrough */ }
      try { return JSON.parse(JSON.stringify(o)); } catch { /* fallthrough */ }
      return o;
    }),
    /**
     * Clears the observation log. Intended for test setup. Should not
     * be called while fanouts are in flight — the `observation_id`
     * values returned by those fanouts reference indices that no
     * longer point at the original observations after reset.
     */
    reset: () => { observation_log.length = 0; },
  };
}

module.exports = { createProvider };
