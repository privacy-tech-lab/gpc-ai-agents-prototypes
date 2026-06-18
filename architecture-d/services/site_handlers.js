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
 *
 * When TAVILY_FIXTURE is set, the live fetch is replaced by a checked-in
 * JSON fixture from fixtures/tavily/. This lets a reviewer run the demo
 * without provisioning a Tavily key and lets a dev pick a specific result
 * shape (full / empty / partial) to exercise the parser. See the README
 * "Fixtures" section for the selector convention.
 */

const path = require('path');
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
 * Load a Tavily fixture for a single publisher. When TAVILY_FIXTURE='1',
 * the variant defaults to the publisher's site id (e.g. fixtures/tavily/the-verge.json).
 * Any other value names the variant directly (e.g. TAVILY_FIXTURE=empty_results
 * loads fixtures/tavily/empty_results.json for every site).
 *
 * Falls back to fixtures/tavily/full_results.json when the publisher does not
 * have its own fixture, so a new publisher does not silently disable the demo.
 *
 * Returns the same { url, title, content } shape as the live path, or null
 * when the fixture is empty / partial, which forces the canned fallback.
 *
 * @param {string} site_id
 */
function loadTavilyFixture(site_id) {
  const variant = process.env.TAVILY_FIXTURE;
  if (!variant) return null;
  const name = variant === '1' ? site_id : variant;
  let fx;
  try {
    fx = require(path.join(__dirname, '..', 'fixtures', 'tavily', `${name}.json`));
  } catch {
    try {
      fx = require(path.join(__dirname, '..', 'fixtures', 'tavily', 'full_results.json'));
    } catch { return null; }
  }
  const first = fx.results?.[0];
  if (!first || !first.content) return null;
  return { url: first.url, title: first.title, content: first.content };
}

/**
 * Fetch a single review snippet from the publisher's domain via Tavily.
 * Returns null on any failure so callers fall back to the canned fragment.
 *
 * Aborts after TAVILY_TIMEOUT_MS (default 5000 ms) so a hung Tavily
 * call cannot stall an entire fanout.
 *
 * @param {string} domain
 * @param {string} query
 */
async function fetchFromTavily(domain, query) {
  const api_key = process.env.TAVILY_API_KEY;
  if (!api_key) return null;
  const timeoutMs = Number(process.env.TAVILY_TIMEOUT_MS) || 5000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        api_key,
        query,
        include_domains: [domain],
        search_depth:    'basic',
        max_results:     1,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    const first = json.results?.[0];
    if (!first) return null;
    return { url: first.url, title: first.title, content: first.content };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
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

  const fixture = loadTavilyFixture(site_id);
  const live    = fixture ? null : await fetchFromTavily(pub.domain, query);
  const hit     = fixture || live;
  const source  = fixture ? 'tavily_fixture' : (live ? 'tavily_live' : 'canned');

  const review_snippet = hit
    ? `[${pub.name}] ${hit.content} (${hit.url})`
    : `[${pub.name}] ${CANNED_FRAGMENTS[site_id] || 'Generic review.'} (re: "${query}")`;

  return {
    status: 'ok',
    site: site_id,
    publisher: pub.name,
    enforcement: pub.enforcement,
    query,
    review_snippet,
    review_source: source,
    site_received_gpc: gpc_on,
    tracking_decision,
  };
}

module.exports = { querySite, decideTracking, loadTavilyFixture };
