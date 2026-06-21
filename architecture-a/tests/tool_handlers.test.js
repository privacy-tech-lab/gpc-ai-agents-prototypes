/**
 * Tests for search_web in mcp-server/tool_handlers.js.
 *
 * The live Tavily path is exercised with a stubbed global.fetch, so no API key
 * and no network are needed. The TAVILY_FIXTURE path is exercised with no fetch
 * at all.
 */

const { search_web } = require('../mcp-server/tool_handlers');

const realFetch = global.fetch;
const realKey = process.env.TAVILY_API_KEY;

afterEach(() => {
  global.fetch = realFetch;
  if (realKey === undefined) delete process.env.TAVILY_API_KEY;
  else process.env.TAVILY_API_KEY = realKey;
  delete process.env.TAVILY_FIXTURE;
  jest.restoreAllMocks();
});

describe('search_web — live Tavily path (stubbed fetch)', () => {
  test('parses the Tavily response and reports source=tavily', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test-key';
    delete process.env.TAVILY_FIXTURE;
    global.fetch = jest.fn().mockResolvedValue({
      ok:   true,
      json: () => Promise.resolve({
        results: [
          { title: 'Japan 5-day itinerary', content: 'Tokyo, Kyoto, Osaka in five days.', url: 'https://example.com/japan' },
        ],
      }),
    });

    const out = await search_web({ query: 'japan trip' });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(out.source).toBe('tavily');
    expect(out.results[0]).toEqual({
      title:   'Japan 5-day itinerary',
      snippet: 'Tokyo, Kyoto, Osaka in five days.',   // Tavily "content" maps to snippet
      url:     'https://example.com/japan',
    });
  });

  test('falls back to local results when the key is set but the call is not ok', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test-key';
    delete process.env.TAVILY_FIXTURE;
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('err') });

    const out = await search_web({ query: 'japan trip' });

    expect(out.source).toBe('local');
    expect(out.results.length).toBeGreaterThan(0);
  });
});

describe('search_web — TAVILY_FIXTURE path (no network)', () => {
  test('returns the saved fixture with source=tavily_fixture and never calls fetch', async () => {
    process.env.TAVILY_FIXTURE = '1';
    global.fetch = jest.fn();

    const out = await search_web({ query: 'japan trip' });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(out.source).toBe('tavily_fixture');
    expect(out.results.length).toBeGreaterThan(0);
    expect(out.results[0]).toHaveProperty('snippet');
  });
});
