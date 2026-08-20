/**
 * Per-site (publisher) MCP-style tool handlers.
 *
 * Each handler is invoked once per fanout target. The handler is the
 * site's own enforcement point: it reads `_meta.gpc` and decides whether
 * to log the request and write to the visitor profile, according to the
 * enforcement level declared in the registry.
 *
 * The handler always returns a review snippet so the user's primary task
 * (synthesise an answer across N sites) succeeds either way. Only the
 * site-side tracking decisions vary.
 *
 * Tavily IO lives in core/tavily.js. This file owns the per-publisher
 * tracking decision, the canned fragment fallback, and the snippet
 * formatting that is specific to Architecture D.
 *
 * When TAVILY_API_KEY is set, the review snippet is fetched live from
 * the publisher's domain via Tavily; otherwise the fallback canned
 * fragment is used so the demo runs deterministically. The fixture-gate
 * (TAVILY_FIXTURE env var) is consumed by core/tavily.js; each call
 * passes the site_id as a fixture hint, so with TAVILY_FIXTURE=1 core
 * looks for `fixtures/tavily/<site_id>.json` and falls back to
 * `full_results.json` if no per-site file is present.
 */

const { getPublisher }    = require('./tool_registry');
const { searchPublisher } = require('../../core/tavily');

const CANNED_FRAGMENTS = {
  'the-verge':         'Polished refinement, iterative gains.',
  'ars-technica':      'Meaningful improvement in sustained workloads.',
  'cnet':              'Build quality up, camera marginal.',
  'tomsguide':         'Category-leading battery life.',
  'engadget':          'Display is the headline feature this year.',
  'wired':             'Software polish continues to define the experience.',
  'android-authority': 'Comparison against the current Android flagships.',
  'techcrunch':        'Notable pricing and market-positioning shifts.',
};

/**
 * Site-level tracking decision.
 *
 * @param {object}  pub        publisher record from the registry
 * @param {boolean} gpc_on     whether the request carried GPC=1
 * @returns {{ logged: boolean, profile_write: boolean, reason: string }}
 */
function decideTracking(pub, gpc_on) {
  if (!pub.supports_gpc) {
    return { logged: true, profile_write: true, reason: 'site_does_not_support_gpc' };
  }
  if (gpc_on && pub.enforcement === 'strict') {
    return { logged: false, profile_write: false, reason: 'gpc_strict_enforcement' };
  }
  if (gpc_on && pub.enforcement === 'advisory') {
    return { logged: true, profile_write: false, reason: 'gpc_advisory_partial' };
  }
  return { logged: true, profile_write: true, reason: 'normal_operation' };
}

/**
 * Query a single publisher.
 *
 * @param {string} site_id
 * @param {string} query
 * @param {{ gpc?: 0|1 }} _meta
 */
async function querySite(site_id, query, _meta = {}) {
  const pub = getPublisher(site_id);
  if (!pub) {
    return { status: 'error', site: site_id, reason: 'unknown_site' };
  }

  const gpc_on            = _meta.gpc === 1 || _meta.gpc === true;
  const tracking_decision = decideTracking(pub, gpc_on);

  const hit   = await searchPublisher(query, {
    domain:     pub.domain,
    maxResults: 1,
    fixture:    site_id,
  });
  const first = hit?.results?.[0];

  const review_snippet = first?.content
    ? `[${pub.name}] ${first.content} (${first.url})`
    : `[${pub.name}] ${CANNED_FRAGMENTS[site_id] || 'Generic review.'} (re: "${query}")`;
  const review_source = first?.content ? hit.source : 'canned';

  return {
    status: 'ok',
    site: site_id,
    publisher: pub.name,
    enforcement: pub.enforcement,
    query,
    review_snippet,
    review_source,
    site_received_gpc: gpc_on,
    tracking_decision,
  };
}

module.exports = { querySite, decideTracking };
