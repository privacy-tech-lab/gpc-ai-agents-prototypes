/**
 * Unit tests for persistence_gate.js, the Category D enforcement seam.
 *
 * Covers:
 *  - resolveScope: the hierarchy (d1 implies d2 and d3, d2 implies d3, d3
 *    stands alone); bare GPC asserts the strictest scope; invalid names drop
 *  - endSession: archives by default, discards under D1, always clears the
 *    transient session context
 *  - recallForSession: recalls merged facts, blocks under D2 even when the
 *    archive has entries, reports nothing_to_recall on an empty archive
 *  - synthesizeProfile: writes the model, blocks under D3, reports
 *    nothing_to_synthesize when nothing was retained
 */

const gate = require('../persistence_gate');
const fixture = require('../session_fixture');
const { createMemory } = require('../memory_store');

let memory;
let s1;
let s2;

beforeEach(() => {
  memory = createMemory();
  [s1, s2] = fixture.getSessions();
});

describe('resolveScope: the hierarchy', () => {
  test('no signal means no opt-outs', () => {
    expect(gate.resolveScope({})).toEqual(new Set());
  });

  test('d1 implies d2 and d3', () => {
    expect(gate.resolveScope({ scope: ['d1'] })).toEqual(new Set(['d1', 'd2', 'd3']));
  });

  test('d2 implies d3 but not d1', () => {
    expect(gate.resolveScope({ scope: ['d2'] })).toEqual(new Set(['d2', 'd3']));
  });

  test('d3 stands alone', () => {
    expect(gate.resolveScope({ scope: ['d3'] })).toEqual(new Set(['d3']));
  });

  test('bare GPC asserts the strictest scope', () => {
    expect(gate.resolveScope({ gpc: true })).toEqual(new Set(['d1', 'd2', 'd3']));
  });

  test('invalid names are dropped', () => {
    expect(gate.resolveScope({ scope: ['d3', 'd9'] })).toEqual(new Set(['d3']));
  });
});

describe('endSession: the D1 boundary', () => {
  test('archives the transcript and facts by default', () => {
    const result = gate.endSession(s1, memory, new Set());
    expect(result.status).toBe('archived');
    const snap = memory.archive.snapshot();
    expect(snap.entry_count).toBe(1);
    expect(snap.entries[0].facts).toEqual({ diet: 'vegetarian', budget: 'tight' });
  });

  test('discards everything under D1 and records what was lost', () => {
    const result = gate.endSession(s1, memory, new Set(['d1', 'd2', 'd3']));
    expect(result.status).toBe('discarded');
    expect(result.reason).toBe('d1_session_scope');
    expect(result.would_have_archived.facts.diet).toBe('vegetarian');
    expect(memory.archive.isEmpty()).toBe(true);
    expect(memory.archive.snapshot().blocked_count).toBe(1);
  });

  test('clears the transient session context in every mode', () => {
    memory.setContext('facts', s1.facts_disclosed);
    gate.endSession(s1, memory, new Set());
    expect(memory.getContext()).toEqual({});
    memory.setContext('facts', s1.facts_disclosed);
    gate.endSession(s1, memory, new Set(['d1', 'd2', 'd3']));
    expect(memory.getContext()).toEqual({});
  });
});

describe('recallForSession: the D2 boundary', () => {
  test('recalls merged facts from archived sessions', () => {
    gate.endSession(s1, memory, new Set());
    const result = gate.recallForSession(memory, new Set());
    expect(result.status).toBe('recalled');
    expect(result.recalled_facts.diet).toBe('vegetarian');
    expect(result.from_sessions).toEqual(['s1_recipes']);
  });

  test('blocks recall under D2 even when the archive has entries', () => {
    gate.endSession(s1, memory, new Set());
    const result = gate.recallForSession(memory, new Set(['d2', 'd3']));
    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('d2_cross_session_scope');
    expect(result.archived_sessions_present).toBe(1);
    expect(result.recalled_facts).toEqual({});
  });

  test('reports nothing_to_recall when the archive is empty', () => {
    const result = gate.recallForSession(memory, new Set());
    expect(result.status).toBe('nothing_to_recall');
    expect(result.recalled_facts).toEqual({});
  });
});

describe('synthesizeProfile: the D3 boundary', () => {
  const candidate = fixture.getProfileSynthesis();

  test('writes the behavioral model from a retained archive', () => {
    gate.endSession(s1, memory, new Set());
    const result = gate.synthesizeProfile(candidate, memory, new Set());
    expect(result.status).toBe('synthesized');
    expect(memory.profile.snapshot().entry_count).toBe(1);
  });

  test('blocks synthesis under D3 and records the model it stopped', () => {
    gate.endSession(s1, memory, new Set());
    const result = gate.synthesizeProfile(candidate, memory, new Set(['d3']));
    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('d3_profile_scope');
    expect(result.would_have_synthesized.dietary_pattern).toBe('vegetarian');
    expect(memory.profile.isEmpty()).toBe(true);
    expect(memory.profile.snapshot().blocked_count).toBe(1);
  });

  test('reports nothing_to_synthesize when nothing was retained', () => {
    const result = gate.synthesizeProfile(candidate, memory, new Set());
    expect(result.status).toBe('nothing_to_synthesize');
    expect(memory.profile.isEmpty()).toBe(true);
  });
});
