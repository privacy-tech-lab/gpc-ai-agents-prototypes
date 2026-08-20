'use strict';

const { querySite, decideTracking } = require('../services/site_handlers');
const { getPublisher } = require('../services/tool_registry');

describe('decideTracking', () => {
  test('non-supporting site ignores GPC', () => {
    const d = decideTracking(getPublisher('android-authority'), true);
    expect(d).toEqual({ logged: true, profile_write: true, reason: 'site_does_not_support_gpc' });
  });

  test('strict site suppresses log and profile write when GPC=1', () => {
    const d = decideTracking(getPublisher('the-verge'), true);
    expect(d).toEqual({ logged: false, profile_write: false, reason: 'gpc_strict_enforcement' });
  });

  test('advisory site logs but suppresses profile write when GPC=1', () => {
    const d = decideTracking(getPublisher('engadget'), true);
    expect(d).toEqual({ logged: true, profile_write: false, reason: 'gpc_advisory_partial' });
  });

  test('no GPC = normal operation', () => {
    const d = decideTracking(getPublisher('the-verge'), false);
    expect(d).toEqual({ logged: true, profile_write: true, reason: 'normal_operation' });
  });
});

describe('querySite', () => {
  // Tests run without TAVILY_API_KEY so review_source must be 'canned'.
  const original_key = process.env.TAVILY_API_KEY;
  beforeAll(() => { delete process.env.TAVILY_API_KEY; });
  afterAll(()  => { if (original_key !== undefined) process.env.TAVILY_API_KEY = original_key; });

  test('returns a review snippet on success', async () => {
    const r = await querySite('the-verge', 'iPhone 17', { gpc: 1 });
    expect(r.status).toBe('ok');
    expect(r.review_source).toBe('canned');
    expect(r.review_snippet).toMatch(/iPhone 17/);
    expect(r.site_received_gpc).toBe(true);
    expect(r.tracking_decision.logged).toBe(false);
  });

  test('returns error for an unknown site', async () => {
    const r = await querySite('not-a-site', 'q', {});
    expect(r.status).toBe('error');
    expect(r.reason).toBe('unknown_site');
  });

  test('returns review even when GPC=1 (primary task is never blocked)', async () => {
    const r = await querySite('the-verge', 'iPhone 17', { gpc: 1 });
    expect(r.status).toBe('ok');
    expect(r.review_snippet).toBeTruthy();
  });

  test('invalid TAVILY_TIMEOUT_MS values are ignored (no negative-timeout warning, no immediate abort)', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test';
    const realFetch = global.fetch;
    let signalAbortedAtCall = null;
    global.fetch = async (url, opts) => {
      signalAbortedAtCall = opts.signal?.aborted ?? null;
      return { ok: true, json: async () => ({ results: [{ url: 'x', title: 't', content: 'c' }] }) };
    };

    for (const bad of ['-1', '0', 'NaN', 'abc']) {
      process.env.TAVILY_TIMEOUT_MS = bad;
      const r = await querySite('the-verge', 'iPhone 17', {});
      expect(r.status).toBe('ok');
      expect(signalAbortedAtCall).toBe(false);
    }

    delete process.env.TAVILY_API_KEY;
    delete process.env.TAVILY_TIMEOUT_MS;
    global.fetch = realFetch;
  });

  test('hung Tavily fetch is aborted; querySite falls back to canned', async () => {
    process.env.TAVILY_API_KEY     = 'tvly-test';
    process.env.TAVILY_TIMEOUT_MS  = '50';
    const realFetch = global.fetch;
    // Fetch hangs until aborted, then rejects with AbortError.
    global.fetch = (url, opts) => new Promise((_, reject) => {
      opts.signal.addEventListener('abort', () => reject(new Error('aborted')));
    });

    try {
      const start = Date.now();
      const r     = await querySite('the-verge', 'iPhone 17', { gpc: 0 });
      const ms    = Date.now() - start;
      expect(r.status).toBe('ok');
      expect(r.review_source).toBe('canned');
      // Should resolve within a small multiple of the configured timeout.
      expect(ms).toBeLessThan(500);
    } finally {
      delete process.env.TAVILY_API_KEY;
      delete process.env.TAVILY_TIMEOUT_MS;
      global.fetch = realFetch;
    }
  });
});
