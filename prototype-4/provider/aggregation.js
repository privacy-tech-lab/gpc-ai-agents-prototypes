/**
 * Derivations the provider can compute from its observation log.
 *
 * The pre-agent browser model gives no single intermediary this view.
 * The exercise here is to demonstrate, with running code, what falls
 * out of the provider's structurally-mandated visibility.
 */

function gpcOn(entry) {
  return entry?.meta_received && (entry.meta_received.gpc === 1 || entry.meta_received.gpc === true);
}

// Treat null, undefined, and non-object entries as invisible to the
// aggregation functions. A malformed log (custom mitigation, imported
// file) used to crash the report with "Cannot read properties of null".
function isValidEntry(e) {
  return e !== null && typeof e === 'object';
}

/**
 * Fraction of observations carrying GPC=1.
 */
function gpcAdoptionRate(log) {
  const valid = log.filter(isValidEntry);
  if (valid.length === 0) return 0;
  return valid.filter(gpcOn).length / valid.length;
}

/**
 * Count of observations per inferred topic.
 */
function topicDistribution(log) {
  const counts = {};
  for (const e of log) {
    if (!isValidEntry(e)) continue;
    counts[e.query_topic] = (counts[e.query_topic] || 0) + 1;
  }
  return counts;
}

/**
 * Count of fanout reaches per publisher (one increment per call per site).
 * Defensive against entries that lack fanout_targets so a malformed log
 * (custom mitigation, imported file) does not crash the report.
 */
function publisherReach(log) {
  const reach = {};
  for (const e of log) {
    if (!isValidEntry(e) || !Array.isArray(e.fanout_targets)) continue;
    for (const site of e.fanout_targets) {
      reach[site] = (reach[site] || 0) + 1;
    }
  }
  return reach;
}

/**
 * For each inferred topic, split observation count by GPC state.
 * Surfaces population-level correlations the provider alone can derive.
 */
function topicByGpcMatrix(log) {
  const matrix = {};
  for (const e of log) {
    if (!isValidEntry(e)) continue;
    const t = e.query_topic;
    if (!matrix[t]) matrix[t] = { gpc_on: 0, gpc_off: 0 };
    if (gpcOn(e)) matrix[t].gpc_on += 1;
    else          matrix[t].gpc_off += 1;
  }
  return matrix;
}

/**
 * Per-user interest profile derived from observed queries. Filters out
 * observations the provider has agreed (via mitigation) to suppress.
 */
function inferUserInterests(log, user_id) {
  const entries = log.filter((e) => isValidEntry(e) && e.user_id === user_id && !e.k_anon_suppressed);
  const topic_counts = {};
  for (const e of entries) topic_counts[e.query_topic] = (topic_counts[e.query_topic] || 0) + 1;
  return Object.entries(topic_counts)
    .sort((a, b) => b[1] - a[1])
    .map(([topic, count]) => ({ topic, count }));
}

/**
 * What a single site sees: its own slice of one observation. Used to
 * produce the headline side-by-side comparison against the provider view.
 */
function siteLevelView(site_results) {
  return site_results.map(r => ({
    site: r.site,
    site_received_gpc: r.site_received_gpc,
    tracking_decision: r.tracking_decision,
  }));
}

module.exports = {
  gpcAdoptionRate,
  topicDistribution,
  publisherReach,
  topicByGpcMatrix,
  inferUserInterests,
  siteLevelView,
};
