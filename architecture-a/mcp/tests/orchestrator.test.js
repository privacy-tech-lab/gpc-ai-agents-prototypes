/**
 * Integration tests for the pipeline (Layers 1, 2, and 4).
 *
 * LLM agents (search, synthesis) are mocked — no Ollama required.
 * Storage is tested both through handleRequest and directly so that
 * Layer 4 assertions do not depend on the mock shape.
 */

jest.mock('../agents/search_agent.js', () => ({
  run: jest.fn().mockResolvedValue({
    answer:     'mock search answer',
    rawResults: [{ status: 'ok', results: ['r1'] }],
    toolCalls:  [{ tool: 'search_web', input: { query: 'test' }, result: { status: 'ok' } }],
  }),
}));

jest.mock('../agents/synthesis_agent.js', () => ({
  run: jest.fn().mockResolvedValue({ answer: 'mock synthesized answer' }),
}));

const { handleRequest } = require('../orchestrator/orchestrator.js');
const { store }         = require('../services/storage.js');
const fs   = require('fs');
const path = require('path');

const LOG_FILE     = path.join(__dirname, '..', 'output', 'interaction_log.jsonl');
const PROFILE_FILE = path.join(__dirname, '..', 'output', 'profiles.json');

beforeAll(() => {
  [LOG_FILE, PROFILE_FILE].forEach((f) => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
});

// ── Layer 1: Sec-GPC header ───────────────────────────────────────────────────

describe('Layer 1 — Sec-GPC header', () => {
  test('Sec-GPC: 1 → gpc_active is true', async () => {
    const result = await handleRequest({ query: 'test', user_id: 'u1', secGpc: '1' });
    expect(result.gpc_active).toBe(true);
  });

  test('absent Sec-GPC header → gpc_active is false', async () => {
    const result = await handleRequest({ query: 'test', user_id: 'u1' });
    expect(result.gpc_active).toBe(false);
  });

  test('Sec-GPC: 0 is not a valid signal → gpc_active is false', async () => {
    const result = await handleRequest({ query: 'test', user_id: 'u1', secGpc: '0' });
    expect(result.gpc_active).toBe(false);
  });
});

// ── Layer 2: MCP _meta envelope ───────────────────────────────────────────────

describe('Layer 2 — MCP _meta envelope', () => {
  test('meta_envelope has no gpc key when signal is absent', async () => {
    const result = await handleRequest({ query: 'test', user_id: 'u1' });
    expect('gpc' in result.meta_envelope).toBe(false);
  });

  test('meta_envelope carries gpc=1 when GPC is on', async () => {
    const result = await handleRequest({ query: 'test', user_id: 'u1', secGpc: '1' });
    expect(result.meta_envelope.gpc).toBe(1);
  });
});

// ── Layer 4: MCP tool enforcement ────────────────────────────────────────────

describe('Layer 4 — MCP tool enforcement', () => {
  test('baseline: sensitive storage tools return ok', async () => {
    const _meta  = {};
    const result = await store({ user_id: 'u-baseline', query: 'q', answer: 'a', _meta, timing: [] });

    expect(result.stored).toContain('save_to_profile');
    expect(result.stored).toContain('log_interaction');
    expect(result.blocked).not.toContain('save_to_profile');
    expect(result.blocked).not.toContain('log_interaction');
  });

  test('GPC run: sensitive storage tools are blocked', async () => {
    const _meta  = { gpc: 1 };
    const result = await store({ user_id: 'u-gpc', query: 'q', answer: 'a', _meta, timing: [] });

    expect(result.blocked).toContain('save_to_profile');
    expect(result.blocked).toContain('log_interaction');
    expect(result.stored).not.toContain('save_to_profile');
    expect(result.stored).not.toContain('log_interaction');
  });

  test('GPC run: search_web still executes (not a sensitive tool)', async () => {
    const result = await handleRequest({ query: 'test', user_id: 'u-gpc', secGpc: '1' });
    expect(result.searchCalls.length).toBeGreaterThanOrEqual(1);
    expect(result.searchCalls[0].result.status).toBe('ok');
  });

  test('GPC run: answer is returned regardless of GPC state', async () => {
    const result = await handleRequest({ query: 'test', user_id: 'u-gpc', secGpc: '1' });
    expect(typeof result.answer).toBe('string');
    expect(result.answer.length).toBeGreaterThan(0);
  });
});

// ── Timing instrumentation ────────────────────────────────────────────────────

describe('Timing instrumentation', () => {
  test('timing array is populated for all tool calls', async () => {
    const timing = [];
    await handleRequest({ query: 'timing test', user_id: 'u-timing', timing });
    expect(timing.length).toBeGreaterThanOrEqual(1);
    timing.forEach((t) => {
      expect(typeof t.durationMs).toBe('number');
      expect(typeof t.tool).toBe('string');
      expect(typeof t.status).toBe('string');
    });
  });

  test('GPC run: blocked timing entries have status=blocked', async () => {
    const timing = [];
    await store({ user_id: 'u-timing-gpc', query: 'q', answer: 'a', _meta: { gpc: 1 }, timing });
    const blocked = timing.filter((t) => t.status === 'blocked');
    expect(blocked.length).toBeGreaterThanOrEqual(2);
  });
});
