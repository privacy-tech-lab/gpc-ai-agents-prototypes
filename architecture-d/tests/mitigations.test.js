'use strict';

const { noTrainCommitment, kAnonymity, dpNoise, chain } = require('../mitigations');

describe('noTrainCommitment', () => {
  test('tags every observation with do_not_train', () => {
    const m = noTrainCommitment();
    const o = m.apply({ user_id: 'u1', query_topic: 't1' });
    expect(o.do_not_train).toBe(true);
  });
});

describe('kAnonymity', () => {
  test('suppresses user_id below the cohort threshold', () => {
    const m = kAnonymity(3);
    const o1 = m.apply({ user_id: 'u1', query_topic: 't1' });
    expect(o1.user_id).toBe('<suppressed>');
    expect(o1.k_anon_suppressed).toBe(true);
    expect(o1.cohort_size).toBe(1);
  });

  test('reveals user_id once the cohort reaches k', () => {
    const m = kAnonymity(3);
    m.apply({ user_id: 'u1', query_topic: 't1' });
    m.apply({ user_id: 'u2', query_topic: 't1' });
    const o3 = m.apply({ user_id: 'u3', query_topic: 't1' });
    expect(o3.k_anon_suppressed).toBe(false);
    expect(o3.cohort_size).toBe(3);
  });

  test('cohort tracking is per-topic', () => {
    const m = kAnonymity(2);
    m.apply({ user_id: 'u1', query_topic: 't1' });
    const o = m.apply({ user_id: 'u1', query_topic: 't2' });
    expect(o.k_anon_suppressed).toBe(true);
    expect(o.cohort_size).toBe(1);
  });
});

describe('dpNoise', () => {
  test('returns a numeric noise-perturbed value', () => {
    const dp = dpNoise(1.0);
    const v = dp.noise(100);
    expect(typeof v).toBe('number');
    expect(Number.isFinite(v)).toBe(true);
  });

  test('apply is a passthrough — DP runs at aggregation time, not log time', () => {
    const dp = dpNoise(1.0);
    const input = { user_id: 'u1', query_topic: 't1' };
    expect(dp.apply(input)).toEqual(input);
  });
});

describe('chain', () => {
  test('applies mitigations left-to-right', () => {
    const m = chain(noTrainCommitment(), kAnonymity(2));
    const o = m.apply({ user_id: 'u1', query_topic: 't1' });
    expect(o.do_not_train).toBe(true);
    expect(o.k_anon_suppressed).toBe(true);
  });

  test('delegates noise() to the first DP member', () => {
    const m = chain(noTrainCommitment(), dpNoise(0.5));
    expect(typeof m.noise(50)).toBe('number');
  });

  test('chain name reflects the composition', () => {
    const m = chain(noTrainCommitment(), kAnonymity(5), dpNoise(1.0));
    expect(m.name).toBe('no_train+k_anon_5+dp_eps_1');
  });
});
