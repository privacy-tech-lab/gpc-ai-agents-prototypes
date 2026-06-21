'use strict';

/**
 * Tests for the shared Tavily caller in core/tavily.js.
 *
 * The live fetch is replaced by a stubbed global.fetch so the happy path
 * runs without an API key. The fixture-gate is tested against the
 * placeholder fixtures shipped in core/fixtures/tavily/.
 */

const { searchPublisher } = require('../tavily');

describe('searchPublisher with stubbed global.fetch', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.TAVILY_API_KEY;
    delete process.env.TAVILY_FIXTURE;
    delete process.env.TAVILY_TIMEOUT_MS;
  });

  test('returns null when no API key and no fixture set', async () => {
    const r = await searchPublisher('anything');
    expect(r).toBeNull();
  });

  test('returns parsed results on a successful Tavily response', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { title: 'A', url: 'https://example.com/a', content: 'snippet A' },
          { title: 'B', url: 'https://example.com/b', content: 'snippet B' },
        ],
      }),
    });
    const r = await searchPublisher('iphone 17');
    expect(r.source).toBe('tavily_live');
    expect(r.results).toHaveLength(2);
    expect(r.results[0].content).toBe('snippet A');
  });

  test('passes include_domains when opts.domain is set', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });
    await searchPublisher('iphone 17', { domain: 'theverge.com', maxResults: 1 });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.include_domains).toEqual(['theverge.com']);
    expect(body.max_results).toBe(1);
  });

  test('returns null on non-2xx response', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test';
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    const r = await searchPublisher('anything');
    expect(r).toBeNull();
  });

  test('honors a configured abort timeout and surfaces the error to onError', async () => {
    process.env.TAVILY_API_KEY    = 'tvly-test';
    process.env.TAVILY_TIMEOUT_MS = '50';
    global.fetch = (url, opts) => new Promise((_, reject) => {
      opts.signal.addEventListener('abort', () => reject(new Error('aborted')));
    });
    let captured;
    const start = Date.now();
    const r = await searchPublisher('anything', { onError: (err) => { captured = err; } });
    const ms = Date.now() - start;
    expect(r).toBeNull();
    expect(captured?.message).toMatch(/aborted/);
    expect(ms).toBeLessThan(500);
  });
});

describe('searchPublisher with TAVILY_FIXTURE', () => {
  afterEach(() => {
    delete process.env.TAVILY_FIXTURE;
  });

  test('TAVILY_FIXTURE=1 loads the default fixture and reports tavily_fixture', async () => {
    process.env.TAVILY_FIXTURE = '1';
    const r = await searchPublisher('anything');
    expect(r.source).toBe('tavily_fixture');
    expect(r.results.length).toBeGreaterThan(0);
  });

  test('TAVILY_FIXTURE=empty_results returns an empty results array', async () => {
    process.env.TAVILY_FIXTURE = 'empty_results';
    const r = await searchPublisher('anything');
    expect(r.source).toBe('tavily_fixture');
    expect(r.results).toEqual([]);
  });

  test('TAVILY_FIXTURE=partial_results returns a result missing the content field', async () => {
    process.env.TAVILY_FIXTURE = 'partial_results';
    const r = await searchPublisher('anything');
    expect(r.source).toBe('tavily_fixture');
    expect(r.results[0].url).toBe('https://example.com/partial');
    expect(r.results[0].content).toBeUndefined();
  });

  test('unknown fixture name falls back to full_results', async () => {
    process.env.TAVILY_FIXTURE = 'no_such_variant';
    const r = await searchPublisher('anything');
    expect(r.source).toBe('tavily_fixture');
    expect(r.results.length).toBeGreaterThan(0);
  });

  test('opts.fixture provides a default when TAVILY_FIXTURE=1', async () => {
    process.env.TAVILY_FIXTURE = '1';
    const r = await searchPublisher('anything', { fixture: 'empty_results' });
    expect(r.results).toEqual([]);
  });
});
