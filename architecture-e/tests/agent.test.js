/**
 * Tests for the LLM-agent tool boundary (agent.js).
 *
 * These test executeSearch directly — the seam where the firewall lives — so the
 * enforcement is verified deterministically without needing Ollama or the model.
 * The agent loop itself (agent_loop.js) is the same loop already used by
 * Architectures A and B. executeSearch is async because it classifies over a
 * real MCP connection (mcp_client.js); the firewall/engine/store logic below
 * it stays synchronous and in-process, unchanged.
 *
 * Key properties under test:
 *   - executeSearch returns ONLY the answer (the model never sees inferred attrs)
 *   - B3 off writes attributes to the store; B3 on suppresses the write
 *   - the answer is identical regardless of B3
 *   - unknown queries degrade gracefully with no inference
 */

const { executeSearch } = require('../agent');
const { createProfileStore } = require('../profile_store');
const { closeClient } = require('../mcp_client');

const KNOWN_QUERY = 'What are the side effects of metformin?';

afterAll(async () => {
  await closeClient();
});

describe('executeSearch — return shape', () => {
  test('returns only an answer, never the inferred attributes', async () => {
    const store = createProfileStore();
    const result = await executeSearch({ query: KNOWN_QUERY }, store, false);

    expect(Object.keys(result)).toEqual(['answer']);
    expect(typeof result.answer).toBe('string');
    expect(result.inferred_attributes).toBeUndefined();
    expect(result.would_have_written).toBeUndefined();
  });

  test('answer is identical whether B3 is on or off', async () => {
    const off = await executeSearch({ query: KNOWN_QUERY }, createProfileStore(), false);
    const on  = await executeSearch({ query: KNOWN_QUERY }, createProfileStore(), true);
    expect(on.answer).toBe(off.answer);
  });
});

describe('executeSearch — B3 off (engine writes)', () => {
  test('writes the inferred attributes to the store', async () => {
    const store = createProfileStore();
    await executeSearch({ query: KNOWN_QUERY }, store, false);

    const snap = store.snapshot();
    expect(snap.attributes.health_flags).toContain('possible_diabetes');
    expect(snap.attributes.medical_interest).toBe(true);
    expect(snap.blocked_count).toBe(0);
  });
});

describe('executeSearch — B3 on (firewall blocks)', () => {
  test('does not write, increments blocked_count', async () => {
    const store = createProfileStore();
    await executeSearch({ query: KNOWN_QUERY }, store, true);

    const snap = store.snapshot();
    expect(store.isEmpty()).toBe(true);
    expect(snap.blocked_count).toBe(1);
  });
});

describe('executeSearch — unknown query', () => {
  test('returns a generic answer and runs no inference', async () => {
    const store = createProfileStore();
    const result = await executeSearch({ query: 'an unrecognised question xyz' }, store, false);

    expect(typeof result.answer).toBe('string');
    expect(store.isEmpty()).toBe(true);
    expect(store.snapshot().blocked_count).toBe(0);
  });
});
