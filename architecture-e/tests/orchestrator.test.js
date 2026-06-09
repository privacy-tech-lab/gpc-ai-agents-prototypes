/**
 * Integration tests for orchestrator.js
 *
 * Covers:
 *  - Baseline (B3 off): all 8 queries return status=derived
 *  - Baseline: shadow profile accumulates attributes from every query
 *  - Baseline: profile is non-empty and blocked_count is 0
 *  - Baseline: specific attribute values match classifier output
 *  - B3 on: all 8 queries return status=blocked
 *  - B3 on: blocked reason is b3_inference_firewall for every result
 *  - B3 on: shadow profile stays completely empty
 *  - B3 on: blocked_count equals 8
 *  - B3 on: would_have_written is present on every result
 *  - B3 on: answers are still returned (inference blocked, answers not)
 *  - Baseline: answers are still returned (identical to B3 on)
 *  - Structural: results array has 8 entries in both modes
 */

const orchestrator = require('../orchestrator');

// ─── Baseline (B3 off) ───────────────────────────────────────────────────────

describe('baseline — B3 off', () => {
  let run;

  beforeEach(async () => {
    run = await orchestrator.run(false);
  });

  test('returns exactly 8 results', () => {
    expect(run.results).toHaveLength(8);
  });

  test('all results have status=derived', () => {
    for (const r of run.results) {
      expect(r.status).toBe('derived');
    }
  });

  test('shadow profile is not empty', () => {
    const { attributes } = run.profileSnapshot;
    expect(Object.keys(attributes).length).toBeGreaterThan(0);
  });

  test('blocked_count is 0', () => {
    expect(run.profileSnapshot.blocked_count).toBe(0);
  });

  test('profile contains health_flags from metformin query', () => {
    expect(run.profileSnapshot.attributes.health_flags).toContain('possible_diabetes');
  });

  test('profile contains financial_pressure from rent query', () => {
    expect(run.profileSnapshot.attributes.financial_pressure).toBe(true);
  });

  test('profile contains income_bracket from SNAP query', () => {
    expect(run.profileSnapshot.attributes.income_bracket).toBe('low');
  });

  test('profile contains employment_status from resume query', () => {
    expect(run.profileSnapshot.attributes.employment_status).toBe('job_seeking');
  });

  test('profile contains mental_health_flags from anxiety query', () => {
    expect(run.profileSnapshot.attributes.mental_health_flags).toContain('possible_anxiety');
  });

  test('profile accumulates cardiovascular_concern from low-sodium query', () => {
    expect(run.profileSnapshot.attributes.health_flags).toContain('cardiovascular_concern');
  });

  test('all results carry a non-empty answer', () => {
    for (const r of run.results) {
      expect(typeof r.answer).toBe('string');
      expect(r.answer.length).toBeGreaterThan(0);
    }
  });

  test('results do not have would_have_written in baseline mode', () => {
    for (const r of run.results) {
      expect(r.would_have_written).toBeUndefined();
    }
  });
});

// ─── B3 enforced ─────────────────────────────────────────────────────────────

describe('B3 enforced — b3=true', () => {
  let run;

  beforeEach(async () => {
    run = await orchestrator.run(true);
  });

  test('returns exactly 8 results', () => {
    expect(run.results).toHaveLength(8);
  });

  test('all results have status=blocked', () => {
    for (const r of run.results) {
      expect(r.status).toBe('blocked');
    }
  });

  test('all results have reason=b3_inference_firewall', () => {
    for (const r of run.results) {
      expect(r.reason).toBe('b3_inference_firewall');
    }
  });

  test('shadow profile attributes are completely empty', () => {
    expect(run.profileSnapshot.attributes).toEqual({});
  });

  test('blocked_count equals 8', () => {
    expect(run.profileSnapshot.blocked_count).toBe(8);
  });

  test('every result has a would_have_written field', () => {
    for (const r of run.results) {
      expect(r.would_have_written).toBeDefined();
    }
  });

  test('metformin result would_have_written has health_flags', () => {
    const r = run.results.find(r => r.query === 'What are the side effects of metformin?');
    expect(r.would_have_written.health_flags).toContain('possible_diabetes');
  });

  test('SNAP result would_have_written has income_bracket', () => {
    const r = run.results.find(r => r.query === 'How do I apply for SNAP benefits?');
    expect(r.would_have_written.income_bracket).toBe('low');
  });

  test('resume result would_have_written has employment_status', () => {
    const r = run.results.find(r => r.query === 'What is a good entry-level resume template?');
    expect(r.would_have_written.employment_status).toBe('job_seeking');
  });

  test('all results still carry a non-empty answer', () => {
    for (const r of run.results) {
      expect(typeof r.answer).toBe('string');
      expect(r.answer.length).toBeGreaterThan(0);
    }
  });

  test('results do not have an attributes field (no derived data)', () => {
    for (const r of run.results) {
      expect(r.attributes).toBeUndefined();
    }
  });
});

// ─── Comparison between modes ────────────────────────────────────────────────

describe('baseline vs B3 — answer parity', () => {
  test('the answer for each query is identical in both modes', async () => {
    const baseline = await orchestrator.run(false);
    const b3       = await orchestrator.run(true);

    for (let i = 0; i < baseline.results.length; i++) {
      expect(b3.results[i].answer).toBe(baseline.results[i].answer);
    }
  });

  test('baseline profile has attributes; B3 profile does not', async () => {
    const baseline = await orchestrator.run(false);
    const b3       = await orchestrator.run(true);

    expect(Object.keys(baseline.profileSnapshot.attributes).length).toBeGreaterThan(0);
    expect(Object.keys(b3.profileSnapshot.attributes).length).toBe(0);
  });

  test('baseline blocked_count is 0; B3 blocked_count is 8', async () => {
    const baseline = await orchestrator.run(false);
    const b3       = await orchestrator.run(true);

    expect(baseline.profileSnapshot.blocked_count).toBe(0);
    expect(b3.profileSnapshot.blocked_count).toBe(8);
  });
});
