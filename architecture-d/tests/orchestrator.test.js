/**
 * Tests for the orchestrator: the function-level fanout helpers and
 * the HTTP `/ask` route. The route is exercised against a real
 * `app.listen` on an ephemeral port so the Sec-GPC header read path
 * is covered end-to-end.
 */

const { createProvider } = require('../provider/provider');
const { fanoutAll, fanoutSelected, app, buildPrivacyContext } = require('../orchestrator/orchestrator');
const { listPublisherIds } = require('../services/tool_registry');

// Test isolation: prevent live Tavily fetches during the whole file
// regardless of which describe is running.
const ORIGINAL_TAVILY_KEY = process.env.TAVILY_API_KEY;
beforeAll(() => { delete process.env.TAVILY_API_KEY; });
afterAll(()  => { if (ORIGINAL_TAVILY_KEY !== undefined) process.env.TAVILY_API_KEY = ORIGINAL_TAVILY_KEY; });


////////////////////////////////////////////////////////////////////////////////
//
//  Fanout helpers
//
////////////////////////////////////////////////////////////////////////////////

describe('fanout helpers', () => {
  test('fanoutAll hits every publisher in the registry', async () => {
    const p = createProvider();
    const r = await fanoutAll(p, 'u1', 'iPhone 17', { gpc: 0 });
    expect(r.site_results.length).toBe(listPublisherIds().length);
  });

  test('fanoutSelected hits only the requested set', async () => {
    const p = createProvider();
    const r = await fanoutSelected(p, 'u1', 'iPhone 17', ['the-verge', 'wired'], { gpc: 1 });
    expect(r.site_results.length).toBe(2);
    expect(r.site_results.map(x => x.site).sort()).toEqual(['the-verge', 'wired']);
  });

  test('fanoutSelected with empty siteIds yields one observation, no site results', async () => {
    const p = createProvider();
    const r = await fanoutSelected(p, 'u1', 'iPhone 17', [], { gpc: 0 });
    expect(r.site_results.length).toBe(0);
    // The provider still records the request — visibility is structural.
    expect(p.getProviderView().length).toBe(1);
    expect(p.getProviderView()[0].fanout_targets).toEqual([]);
  });

  test('fanoutSelected with an unknown publisher returns an error result', async () => {
    const p = createProvider();
    const r = await fanoutSelected(p, 'u1', 'iPhone 17', ['NOT_A_REAL_SITE'], { gpc: 0 });
    expect(r.site_results.length).toBe(1);
    expect(r.site_results[0].status).toBe('error');
    expect(r.site_results[0].reason).toBe('unknown_site');
  });

  test('end-to-end: sites enforce GPC, provider still observes', async () => {
    const p = createProvider();
    const r = await fanoutAll(p, 'u1', 'iPhone 17', { gpc: 1 });

    // Strict site honored the signal
    const strict = r.site_results.find(s => s.site === 'the-verge');
    expect(strict.tracking_decision.logged).toBe(false);

    // Provider still has the complete observation
    const view = p.getProviderView()[0];
    expect(view.query).toBe('iPhone 17');
    expect(view.fanout_targets.length).toBe(listPublisherIds().length);
    expect(view.meta_received.gpc).toBe(1);
  });

  test('per-call enforcement is independent across publishers', async () => {
    const p = createProvider();
    const r = await fanoutAll(p, 'u1', 'iPhone 17', { gpc: 1 });
    const reasons = new Set(r.site_results.map(s => s.tracking_decision.reason));
    // We expect a mix because the registry has strict, advisory, and none entries.
    expect(reasons.has('gpc_strict_enforcement')).toBe(true);
    expect(reasons.has('gpc_advisory_partial')).toBe(true);
    expect(reasons.has('site_does_not_support_gpc')).toBe(true);
  });

  // Regression: handleRequest used to throw `header.split is not a
  // function` when a caller passed a non-string baggageHeader (object,
  // number, etc.). HTTP route always passes a string, but the function
  // is exported and reachable directly.
  test('handleRequest tolerates non-string baggageHeader (object, null, undefined)', async () => {
    const { handleRequest } = require('../orchestrator/orchestrator');
    for (const bad of [null, undefined, { malformed: true }, 42, true]) {
      const r = await handleRequest({ user_id: 'u1', query: 'iPhone 17 review summary', baggageHeader: bad });
      expect(r.gpc_active).toBe(false);
      expect(r.meta_envelope.gpc).toBe(0);
    }
  });
});


////////////////////////////////////////////////////////////////////////////////
//
//  buildPrivacyContext — Sec-GPC / body.gpc precedence and normalization
//
////////////////////////////////////////////////////////////////////////////////

describe('buildPrivacyContext', () => {
  test('Sec-GPC header takes precedence over body.gpc', () => {
    const ctx = buildPrivacyContext({ headers: { 'sec-gpc': '1' }, body: { gpc: 0 } });
    expect(ctx.gpc).toBe(1);
  });

  test('falls back to body.gpc when Sec-GPC absent', () => {
    const ctx = buildPrivacyContext({ headers: {}, body: { gpc: 1 } });
    expect(ctx.gpc).toBe(1);
  });

  test('returns undefined gpc when neither is set', () => {
    const ctx = buildPrivacyContext({ headers: {}, body: {} });
    expect(ctx.gpc).toBeUndefined();
  });

  // Regression: JSON bodies often arrive with string-encoded numbers
  // or booleans. Previously body.gpc === "1" was preserved verbatim
  // and a downstream `=== 1` check silently dropped the signal.
  test('normalizes body.gpc string "1" to numeric 1', () => {
    expect(buildPrivacyContext({ headers: {}, body: { gpc: '1' } }).gpc).toBe(1);
  });

  test('normalizes body.gpc string "0" to numeric 0', () => {
    expect(buildPrivacyContext({ headers: {}, body: { gpc: '0' } }).gpc).toBe(0);
  });

  test('normalizes body.gpc boolean true to 1 and false to 0', () => {
    expect(buildPrivacyContext({ headers: {}, body: { gpc: true  } }).gpc).toBe(1);
    expect(buildPrivacyContext({ headers: {}, body: { gpc: false } }).gpc).toBe(0);
  });

  test('leaves gpc undefined when body.gpc is an unrecognised value', () => {
    expect(buildPrivacyContext({ headers: {}, body: { gpc: 'yes' } }).gpc).toBeUndefined();
    expect(buildPrivacyContext({ headers: {}, body: { gpc: null  } }).gpc).toBeUndefined();
  });

  // Regression: Sec-GPC=0 used to fall through to body.gpc, so a
  // request with Sec-GPC: 0 and body { gpc: 1 } would resolve to 1.
  test('Sec-GPC: 0 overrides body.gpc=1', () => {
    expect(buildPrivacyContext({ headers: { 'sec-gpc': '0' }, body: { gpc: 1 } }).gpc).toBe(0);
  });

  test('Sec-GPC: 0 with no body resolves to 0', () => {
    expect(buildPrivacyContext({ headers: { 'sec-gpc': '0' }, body: {} }).gpc).toBe(0);
  });

  test('unrecognized Sec-GPC value (e.g. "true") falls through to body', () => {
    expect(buildPrivacyContext({ headers: { 'sec-gpc': 'true' }, body: { gpc: 1 } }).gpc).toBe(1);
  });

  // Regression: Node concatenates duplicate request headers into a
  // comma-separated string. A duplicated Sec-GPC: 1 arrives as "1, 1";
  // a mixed pair arrives as "1, 0". A strict === '1' check missed both.
  test('any "1" value in a comma-joined Sec-GPC sets gpc=1 (most restrictive wins)', () => {
    expect(buildPrivacyContext({ headers: { 'sec-gpc': '1, 0' }, body: {} }).gpc).toBe(1);
    expect(buildPrivacyContext({ headers: { 'sec-gpc': '0, 1' }, body: {} }).gpc).toBe(1);
    expect(buildPrivacyContext({ headers: { 'sec-gpc': '1, 1' }, body: {} }).gpc).toBe(1);
  });

  test('all-zero comma-joined Sec-GPC sets gpc=0 and still overrides body.gpc=1', () => {
    expect(buildPrivacyContext({ headers: { 'sec-gpc': '0, 0' }, body: { gpc: 1 } }).gpc).toBe(0);
  });
});


////////////////////////////////////////////////////////////////////////////////
//
//  start() — port validation and bind lifecycle
//
////////////////////////////////////////////////////////////////////////////////

describe('start()', () => {
  const { start } = require('../orchestrator/orchestrator');

  test('throws on a non-numeric ASSISTANT_PORT instead of opening a Unix socket', () => {
    const original = process.env.ASSISTANT_PORT;
    process.env.ASSISTANT_PORT = 'abc';
    try {
      expect(() => start()).toThrow(/Invalid ASSISTANT_PORT/);
    } finally {
      if (original === undefined) delete process.env.ASSISTANT_PORT;
      else process.env.ASSISTANT_PORT = original;
    }
  });

  test('throws on out-of-range ASSISTANT_PORT', () => {
    expect(() => start(70000)).toThrow(/Invalid ASSISTANT_PORT/);
    expect(() => start(-1)).toThrow(/Invalid ASSISTANT_PORT/);
  });

  // Regression: port collisions used to resolve the Promise with a
  // server whose .address() was null instead of rejecting.
  test('rejects on port collision (EADDRINUSE)', async () => {
    const first = await start(0);
    const port  = first.address().port;
    try {
      await expect(start(port)).rejects.toMatchObject({ code: 'EADDRINUSE' });
    } finally {
      first.close();
    }
  });
});


////////////////////////////////////////////////////////////////////////////////
//
//  POST /ask — HTTP error responses (status code surface area)
//
//  Every entry here asserts that a bad request (or a missing route,
//  oversized body, etc.) produces a clean JSON error with the right
//  status code, not an HTML page or a stack trace.
//
////////////////////////////////////////////////////////////////////////////////

describe('POST /ask — error responses', () => {
  let server;
  let url;

  beforeAll(async () => {
    server = await new Promise((resolve) => {
      const srv = app.listen(0, () => resolve(srv));
    });
    url = `http://localhost:${server.address().port}/ask`;
  });

  afterAll(() => server?.close());

  test('unknown HTTP path returns a JSON 404 (not an HTML error page)', async () => {
    const res = await fetch(url.replace('/ask', '/nonexistent'), { method: 'GET' });
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    const body = await res.json();
    expect(body.error).toBe('not_found');
    expect(body.path).toBe('/nonexistent');
  });

  test('wrong method on /ask returns a JSON 404', async () => {
    const res = await fetch(url, { method: 'GET' });
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    const body = await res.json();
    expect(body.method).toBe('GET');
    expect(body.path).toBe('/ask');
  });

  test('400 when user_id or query missing', async () => {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test('missing Content-Type returns 400 (not a 500 server error)', async () => {
    const res = await fetch(url, {
      method: 'POST',
      body:   JSON.stringify({ user_id: 'u1', query: 'iPhone 17' }),
      // no Content-Type header
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('user_id and query are required');
  });

  test('text/plain body returns 400 (not a 500 server error)', async () => {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain' },
      body:    'hello',
    });
    expect(res.status).toBe(400);
  });

  test('unknown mode is rejected with 400 (not silently dispatched)', async () => {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ user_id: 'u1', query: 'iPhone 17', mode: 'AGENT' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('unknown_mode');
    expect(body.detail).toMatch(/"agent" or omitted/);
  });

  test('mode: null is rejected with 400 and a non-misleading allowed message', async () => {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ user_id: 'u1', query: 'iPhone 17', mode: null }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('unknown_mode');
    // The previous implementation reported `allowed: [null, "agent"]` which
    // wrongly suggested null was permitted (undefined → null after JSON
    // serialization). The detail string should make it unambiguous.
    expect(body.allowed).toBeUndefined();
    expect(body.detail).toMatch(/"agent" or omitted/);
  });

  test('malformed JSON returns 400 JSON, not a raw stack trace', async () => {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    '{not valid json',
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_json' });
  });

  test('oversized body returns 413 JSON, not a raw stack trace', async () => {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    'x'.repeat(50000),
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'request_body_too_large' });
  });
});


////////////////////////////////////////////////////////////////////////////////
//
//  POST /ask — happy paths
//
//  Successful scripted and agent fanouts; GPC propagation through
//  Sec-GPC, body.gpc, and the various JSON-encoded variants.
//
////////////////////////////////////////////////////////////////////////////////

describe('POST /ask — happy paths', () => {
  let server;
  let url;

  beforeAll(async () => {
    server = await new Promise((resolve) => {
      const srv = app.listen(0, () => resolve(srv));
    });
    url = `http://localhost:${server.address().port}/ask`;
  });

  afterAll(() => server?.close());

  test('fans out and returns provider view (Sec-GPC=1)', async () => {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'sec-gpc': '1' },
      body:    JSON.stringify({ user_id: 'u1', query: 'iPhone 17 review summary' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.privacy_context.gpc).toBe(1);
    expect(body.meta_envelope.gpc).toBe(1);
    expect(body.fanout.site_results.length).toBe(listPublisherIds().length);
    expect(body.provider_view.length).toBe(1);
    expect(body.provider_view[0].meta_received.gpc).toBe(1);
  });

  test('honors body.gpc when Sec-GPC is absent', async () => {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ user_id: 'u1', query: 'iPhone 17 review summary', gpc: 1 }),
    });
    const body = await res.json();
    expect(body.privacy_context.gpc).toBe(1);
    expect(body.meta_envelope.gpc).toBe(1);
  });

  test('body.gpc as a JSON string "1" propagates to the provider envelope', async () => {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ user_id: 'u1', query: 'iPhone 17 review summary', gpc: '1' }),
    });
    const body = await res.json();
    expect(body.privacy_context.gpc).toBe(1);
    expect(body.meta_envelope.gpc).toBe(1);
    expect(body.provider_view[0].meta_received.gpc).toBe(1);
  });

  test('mode=agent dispatches the LLM path; provider observes every model call', async () => {
    // Mock Ollama: three tool_calls turns (one each for three publishers),
    // then a final content turn so the loop exits with a summary.
    const realFetch = global.fetch;
    const targets   = ['the-verge', 'wired', 'cnet'];
    let   ollamaCalls = 0;
    global.fetch = async (u, opts) => {
      if (typeof u === 'string' && u.includes('/chat/completions')) {
        ollamaCalls += 1;
        if (ollamaCalls <= targets.length) {
          return {
            ok:   true,
            json: async () => ({ choices: [{ message: { tool_calls: [{
              id: `tc-${ollamaCalls}`,
              function: {
                name:      'query_publisher',
                arguments: JSON.stringify({
                  publisher_id: targets[ollamaCalls - 1],
                  sub_query:    `tell me about ${targets[ollamaCalls - 1]}`,
                }),
              },
            }] } }] }),
          };
        }
        return { ok: true, json: async () => ({ choices: [{ message: { content: 'Brief consensus summary across publishers.' } }] }) };
      }
      return realFetch(u, opts);
    };

    try {
      const res = await realFetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'sec-gpc': '1' },
        body:    JSON.stringify({
          user_id: 'u1',
          query:   'Research iPhone 17 across tech publishers and summarize',
          mode:    'agent',
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.privacy_context.gpc).toBe(1);
      expect(body.meta_envelope.gpc).toBe(1);
      expect(body.agent.model_tool_calls.length).toBe(targets.length);
      expect(body.agent.model_tool_calls.map((c) => c.publisher_id)).toEqual(targets);
      expect(body.agent.user_facing_summary).toMatch(/summary/i);
      // The provider observed one call per model decision.
      expect(body.provider_view.length).toBe(targets.length);
      for (const obs of body.provider_view) {
        expect(obs.meta_received.gpc).toBe(1);
      }
    } finally {
      global.fetch = realFetch;
    }
  });
});
