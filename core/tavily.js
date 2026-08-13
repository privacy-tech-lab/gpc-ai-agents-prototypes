/**
 * Shared Tavily search caller.
 *
 * Owned by every architecture that needs to query Tavily (arch-A, arch-D).
 * Each arch wraps the result in its own envelope (`searchWeb` in arch-A,
 * `querySite` in arch-D); this module owns the network call, response
 * parsing, the abort timeout, and the fixture-gate.
 *
 * The fixture-gate (TAVILY_FIXTURE env var) short-circuits the live fetch
 * to a checked-in JSON payload. See `core/fixtures/tavily/` for the
 * variants that ship today. A future recorder script (#50) overwrites
 * these placeholder fixtures with real captured Tavily responses.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'tavily');

function resolveFixtureName(envFixture, optsFixture) {
  if (!envFixture) return null;
  if (envFixture === '1') return optsFixture || 'full_results';
  return envFixture;
}

function loadFixture(name) {
  const file = path.join(FIXTURE_DIR, `${name}.json`);
  if (!fs.existsSync(file)) {
    const fallback = path.join(FIXTURE_DIR, 'full_results.json');
    if (!fs.existsSync(fallback)) return null;
    return JSON.parse(fs.readFileSync(fallback, 'utf8'));
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Issue a Tavily search.
 *
 * @param {string} query
 * @param {object} [opts]
 * @param {string} [opts.apiKey]      default process.env.TAVILY_API_KEY
 * @param {string} [opts.domain]      if set, adds Tavily's include_domains filter
 * @param {number} [opts.maxResults]  default 5
 * @param {number} [opts.timeoutMs]   default process.env.TAVILY_TIMEOUT_MS or 5000
 * @param {string} [opts.fixture]     hint for the fixture-gate; ignored when TAVILY_FIXTURE is unset
 * @param {Function} [opts.onError]   called with the thrown Error on network failure
 * @returns {Promise<{source: 'tavily_live'|'tavily_fixture', results: Array}|null>}
 *
 * Returns null when no API key is set and no fixture is active, or when the
 * upstream call fails for any reason (timeout, non-2xx, parse error).
 */
async function searchPublisher(query, opts = {}) {
  const fixtureName = resolveFixtureName(process.env.TAVILY_FIXTURE, opts.fixture);
  if (fixtureName) {
    const fx = loadFixture(fixtureName);
    return { source: 'tavily_fixture', results: fx?.results ?? [] };
  }

  const apiKey = opts.apiKey ?? process.env.TAVILY_API_KEY;
  if (!apiKey) return null;

  // Reject non-positive or NaN timeouts. Otherwise setTimeout would either
  // fire immediately (aborting every fetch) or trigger a Node "negative
  // timeout" warning per call.
  const rawTimeout = opts.timeoutMs ?? Number(process.env.TAVILY_TIMEOUT_MS);
  const timeoutMs  = Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 5000;
  const maxResults = opts.maxResults ?? 5;
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body = { api_key: apiKey, query, search_depth: 'basic', max_results: maxResults };
    if (opts.domain) body.include_domains = [opts.domain];

    const res = await fetch('https://api.tavily.com/search', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { source: 'tavily_live', results: data.results ?? [] };
  } catch (err) {
    if (opts.onError) opts.onError(err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { searchPublisher };
