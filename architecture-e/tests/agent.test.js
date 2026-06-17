/**
 * Tests for the LLM-agent tool boundary (agent.js).
 *
 * These test executeSearch directly — the seam where the firewall lives — so the
 * enforcement is verified deterministically without needing Ollama or the model.
 * The agent loop itself (agent_loop.js) is the same loop already used by
 * Architectures A and B.
 *
 * Key properties under test:
 *   - executeSearch returns ONLY the answer (the model never sees inferred attrs)
 *   - B3 off writes attributes to the store; B3 on suppresses the write
 *   - the answer is identical regardless of B3
 *   - unknown queries degrade gracefully with no inference
 */

const { executeSearch } = require('../agent');
const { createProfileStore } = require('../profile_store');

const KNOWN_QUERY = 'What are the side effects of metformin?';

describe('executeSearch — return shape', () => {
  test('returns only an answer, never the inferred attributes', () => {
    const store = createProfileStore();
    const result = executeSearch({ query: KNOWN_QUERY }, store, false);

    expect(Object.keys(result)).toEqual(['answer']);
    expect(typeof result.answer).toBe('string');
    expect(result.inferred_attributes).toBeUndefined();
    expect(result.would_have_written).toBeUndefined();
  });

  test('answer is identical whether B3 is on or off', () => {
    const off = executeSearch({ query: KNOWN_QUERY }, createProfileStore(), false);
    const on  = executeSearch({ query: KNOWN_QUERY }, createProfileStore(), true);
    expect(on.answer).toBe(off.answer);
  });
});

describe('executeSearch — B3 off (engine writes)', () => {
  test('writes the inferred attributes to the store', () => {
    const store = createProfileStore();
    executeSearch({ query: KNOWN_QUERY }, store, false);

    const snap = store.snapshot();
    expect(snap.attributes.health_flags).toContain('possible_diabetes');
    expect(snap.attributes.medical_interest).toBe(true);
    expect(snap.blocked_count).toBe(0);
  });
});

describe('executeSearch — B3 on (firewall blocks)', () => {
  test('does not write, increments blocked_count', () => {
    const store = createProfileStore();
    executeSearch({ query: KNOWN_QUERY }, store, true);

    const snap = store.snapshot();
    expect(store.isEmpty()).toBe(true);
    expect(snap.blocked_count).toBe(1);
  });
});

describe('executeSearch — unknown query', () => {
  test('returns a generic answer and runs no inference', () => {
    const store = createProfileStore();
    const result = executeSearch({ query: 'an unrecognised question xyz' }, store, false);

    expect(typeof result.answer).toBe('string');
    expect(store.isEmpty()).toBe(true);
    expect(store.snapshot().blocked_count).toBe(0);
  });
});
