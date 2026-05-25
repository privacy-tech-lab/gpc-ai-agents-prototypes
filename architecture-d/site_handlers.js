'use strict';

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
 * When TAVILY_API_KEY is set, the review snippet is fetched live from
 * the publisher's domain via Tavily; otherwise it falls back to a fixed
 * canned fragment so the demo runs deterministically.
 */

const { getPublisher } = require('./tool_registry');

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
 * @param {object}  pub        — publisher record from the registry
 * @param {boolean} gpc_on     — whether the request carried GPC=1
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
 * Fetch a single review snippet from the publisher's domain via Tavily.
 * Returns null on any failure so callers fall back to the canned fragment.
 *
 * @param {string} domain
 * @param {string} query
 */
async function fetchFromTavily(domain, query) {
  const api_key = process.env.TAVILY_API_KEY;
  if (!api_key) return null;
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key,
        query,
        include_domains: [domain],
        search_depth: 'basic',
        max_results: 1,
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const first = json.results?.[0];
    if (!first) return null;
    return { url: first.url, title: first.title, content: first.content };
  } catch {
    return null;
  }
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
  const live              = await fetchFromTavily(pub.domain, query);

  const review_snippet = live
    ? `[${pub.name}] ${live.content} (${live.url})`
    : `[${pub.name}] ${CANNED_FRAGMENTS[site_id] || 'Generic review.'} (re: "${query}")`;

  return {
    status: 'ok',
    site: site_id,
    publisher: pub.name,
    enforcement: pub.enforcement,
    query,
    review_snippet,
    review_source: live ? 'tavily_live' : 'canned',
    site_received_gpc: gpc_on,
    tracking_decision,
  };
}

module.exports = { querySite, decideTracking };
