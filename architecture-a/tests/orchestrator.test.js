/**
 * Integration tests for the pipeline (all four GPC layers).
 *
 * LLM agents (search, synthesis) are mocked — no Ollama required.
 * Storage is tested both through handleRequest and directly so that
 * Layer 3 and Layer 4 assertions do not depend on the mock shape.
 */

process.env.THIRD_PARTY_PORT = '4099';

jest.mock('../agents/llm_search_agent.js', () => ({
  run: jest.fn().mockResolvedValue({
    answer:     'mock search answer',
    rawResults: [{ status: 'ok', results: ['r1'] }],
    toolCalls:  [{ tool: 'search_web', input: { query: 'test' }, result: { status: 'ok' } }],
  }),
}));

jest.mock('../agents/synthesis_agent.js', () => ({
  run: jest.fn().mockResolvedValue({ answer: 'mock synthesized answer' }),
}));

const thirdParty    = require('../agents/third_party_storage.js');
const { handleRequest } = require('../orchestrator/orchestrator.js');
const { store }     = require('../agents/storage.js');
const { encodeBaggage } = require('../orchestrator/baggage.js');
const { issueToken }    = require('../mcp-server/identity_provider.js');
const fs   = require('fs');
const path = require('path');

const LOG_FILE     = path.join(__dirname, '..', 'output', 'interaction_log.jsonl');
const PROFILE_FILE = path.join(__dirname, '..', 'output', 'profiles.json');
const VECTOR_FILE  = path.join(__dirname, '..', 'output', 'vector_store.json');

let server;

beforeAll(async () => {
  server = await thirdParty.start(4099);
  [LOG_FILE, PROFILE_FILE, VECTOR_FILE].forEach((f) => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
});

afterAll(() => server?.close());

// ── Layer 1: W3C Baggage propagation ─────────────────────────────────────────

describe('Layer 1 — W3C Baggage propagation', () => {
  test('gpc=0 in Baggage → gpc_active is false', async () => {
    const result = await handleRequest({
      query: 'test', user_id: 'u1',
      baggageHeader: encodeBaggage({ gpc: '0' }),
    });
    expect(result.gpc_active).toBe(false);
  });

  test('gpc=1 in Baggage → gpc_active is true', async () => {
    const result = await handleRequest({
      query: 'test', user_id: 'u1',
      baggageHeader: encodeBaggage({ gpc: '1' }),
    });
    expect(result.gpc_active).toBe(true);
  });

  test('absent Baggage header → gpc_active is false', async () => {
    const result = await handleRequest({ query: 'test', user_id: 'u1' });
    expect(result.gpc_active).toBe(false);
  });
});

// ── Layer 2: MCP _meta envelope ───────────────────────────────────────────────

describe('Layer 2 — MCP _meta envelope', () => {
  test('meta_envelope carries gpc=0 when GPC is off', async () => {
    const result = await handleRequest({
      query: 'test', user_id: 'u1',
      baggageHeader: encodeBaggage({ gpc: '0' }),
    });
    expect(result.meta_envelope.gpc).toBe(0);
  });

  test('meta_envelope carries gpc=1 when GPC is on', async () => {
    const result = await handleRequest({
      query: 'test', user_id: 'u1',
      baggageHeader: encodeBaggage({ gpc: '1' }),
    });
    expect(result.meta_envelope.gpc).toBe(1);
  });
});

// ── Layer 4: MCP tool enforcement — tested via storage directly ───────────────

describe('Layer 4 — MCP tool enforcement', () => {
  test('baseline: sensitive storage tools return ok', async () => {
    const jwt  = issueToken('orchestrator', false);
    const meta = { gpc: 0, jwt };
    const result = await store({ user_id: 'u-baseline', query: 'q', answer: 'a', meta, timing: [] });

    expect(result.stored).toContain('save_to_profile');
    expect(result.stored).toContain('log_interaction');
    expect(result.blocked).not.toContain('save_to_profile');
    expect(result.blocked).not.toContain('log_interaction');
  });

  test('GPC run: sensitive storage tools are blocked', async () => {
    const jwt  = issueToken('orchestrator', true);
    const meta = { gpc: 1, jwt };
    const result = await store({ user_id: 'u-gpc', query: 'q', answer: 'a', meta, timing: [] });

    expect(result.blocked).toContain('save_to_profile');
    expect(result.blocked).toContain('log_interaction');
    expect(result.stored).not.toContain('save_to_profile');
    expect(result.stored).not.toContain('log_interaction');
  });

  test('GPC run: search_web still executes (not a sensitive tool)', async () => {
    const result = await handleRequest({
      query: 'test', user_id: 'u-gpc',
      baggageHeader: encodeBaggage({ gpc: '1' }),
    });
    expect(result.searchCalls.length).toBeGreaterThanOrEqual(1);
    expect(result.searchCalls[0].result.status).toBe('ok');
  });

  test('GPC run: answer is returned regardless of GPC state', async () => {
    const result = await handleRequest({
      query: 'test', user_id: 'u-gpc',
      baggageHeader: encodeBaggage({ gpc: '1' }),
    });
    expect(typeof result.answer).toBe('string');
    expect(result.answer.length).toBeGreaterThan(0);
  });
});

// ── Layer 3: JWT trust boundary ───────────────────────────────────────────────

describe('Layer 3 — JWT trust boundary', () => {
  test('baseline: third-party store writes succeed', async () => {
    const jwt  = issueToken('orchestrator', false);
    const meta = { gpc: 0, jwt };
    const result = await store({ user_id: 'u-store', query: 'q', answer: 'a', meta, timing: [] });
    expect(result.detail.third_party.status).toBe('ok');
  });

  test('GPC run: third-party store is blocked via JWT claim', async () => {
    const jwt  = issueToken('orchestrator', true);
    const meta = { gpc: 1, jwt };
    const result = await store({ user_id: 'u-store-gpc', query: 'q', answer: 'a', meta, timing: [] });
    expect(result.detail.third_party.status).toBe('blocked');
    expect(result.detail.third_party.layer).toBe('trust_boundary_jwt');
  });

  test('missing JWT → third-party call returns error', async () => {
    const meta   = { gpc: 0, jwt: null };
    const result = await store({ user_id: 'u-nojwt', query: 'q', answer: 'a', meta, timing: [] });
    expect(result.detail.third_party.status).toBe('error');
  });
});

// ── Timing instrumentation ────────────────────────────────────────────────────

describe('Timing instrumentation', () => {
  test('timing array is populated for all tool calls', async () => {
    const timing = [];
    await handleRequest({
      query: 'timing test', user_id: 'u-timing',
      baggageHeader: encodeBaggage({ gpc: '0' }),
      timing,
    });
    expect(timing.length).toBeGreaterThanOrEqual(1);
    timing.forEach((t) => {
      expect(typeof t.durationMs).toBe('number');
      expect(typeof t.tool).toBe('string');
      expect(typeof t.status).toBe('string');
    });
  });

  test('GPC run: blocked timing entries have status=blocked', async () => {
    const timing = [];
    const jwt    = issueToken('orchestrator', true);
    await store({ user_id: 'u-timing-gpc', query: 'q', answer: 'a', meta: { gpc: 1, jwt }, timing });
    const blocked = timing.filter((t) => t.status === 'blocked');
    expect(blocked.length).toBeGreaterThanOrEqual(3);
  });
});
