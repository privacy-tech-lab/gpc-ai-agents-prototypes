'use strict';

const {
  gpcAdoptionRate, topicDistribution, publisherReach,
  topicByGpcMatrix, inferUserInterests, siteLevelView,
} = require('../provider/aggregation');

const sample_log = [
  { user_id: 'u1', query: 'iPhone',  query_topic: 'mobile_device', fanout_targets: ['the-verge', 'cnet'], meta_received: { gpc: 1 } },
  { user_id: 'u1', query: 'Pixel',   query_topic: 'mobile_device', fanout_targets: ['the-verge'],         meta_received: { gpc: 1 } },
  { user_id: 'u2', query: 'laptop',  query_topic: 'laptop',        fanout_targets: ['ars-technica'],      meta_received: {} },
  { user_id: 'u3', query: 'iPhone',  query_topic: 'mobile_device', fanout_targets: ['cnet'],              meta_received: {} },
];

describe('aggregation derivations', () => {
  test('gpcAdoptionRate returns the fraction of GPC=1 entries', () => {
    expect(gpcAdoptionRate(sample_log)).toBeCloseTo(0.5);
  });

  test('gpcAdoptionRate handles an empty log', () => {
    expect(gpcAdoptionRate([])).toBe(0);
  });

  test('topicDistribution counts by query_topic', () => {
    expect(topicDistribution(sample_log)).toEqual({ mobile_device: 3, laptop: 1 });
  });

  test('publisherReach increments once per (call, target)', () => {
    expect(publisherReach(sample_log)).toEqual({
      'the-verge':    2,
      'cnet':         2,
      'ars-technica': 1,
    });
  });

  test('topicByGpcMatrix stratifies counts by GPC state', () => {
    const m = topicByGpcMatrix(sample_log);
    expect(m.mobile_device).toEqual({ gpc_on: 2, gpc_off: 1 });
    expect(m.laptop).toEqual({       gpc_on: 0, gpc_off: 1 });
  });

  test('inferUserInterests ranks topics by count for a single user', () => {
    const interests = inferUserInterests(sample_log, 'u1');
    expect(interests[0]).toEqual({ topic: 'mobile_device', count: 2 });
  });

  test('inferUserInterests respects k_anon_suppressed flag', () => {
    const suppressed_log = sample_log.map(e => ({ ...e, k_anon_suppressed: true }));
    expect(inferUserInterests(suppressed_log, 'u1')).toEqual([]);
  });

  test('publisherReach skips entries with non-array fanout_targets', () => {
    // Regression. An entry with undefined fanout_targets used to throw
    // "is not iterable" and crash the whole report.
    const malformedLog = [
      { user_id: 'a', query_topic: 't', fanout_targets: ['the-verge', 'cnet'], meta_received: { gpc: 1 } },
      { user_id: 'b', query_topic: 't', fanout_targets: undefined,             meta_received: {} },
      { user_id: 'c', query_topic: 't', fanout_targets: 'not-an-array',        meta_received: { gpc: 1 } },
    ];
    expect(publisherReach(malformedLog)).toEqual({ 'the-verge': 1, 'cnet': 1 });
  });

  test('aggregation functions skip null, undefined, and non-object log entries', () => {
    // Regression. Aggregation used to throw "Cannot read properties of
    // null (reading 'meta_received')" if any entry was non-object.
    const dirty = [
      { user_id: 'a', query_topic: 't', fanout_targets: ['x'], meta_received: { gpc: 1 } },
      null,
      undefined,
      'string entry',
      42,
      { user_id: 'a', query_topic: 't', fanout_targets: ['y'], meta_received: {} },
    ];
    expect(gpcAdoptionRate(dirty)).toBeCloseTo(0.5);
    expect(topicDistribution(dirty)).toEqual({ t: 2 });
    expect(publisherReach(dirty)).toEqual({ x: 1, y: 1 });
    expect(inferUserInterests(dirty, 'a')).toEqual([{ topic: 't', count: 2 }]);
  });

  test('siteLevelView extracts the per-site slice of a fanout result', () => {
    const site_results = [
      { site: 'the-verge', site_received_gpc: true,  tracking_decision: { logged: false, profile_write: false, reason: 'gpc_strict_enforcement' } },
      { site: 'cnet',      site_received_gpc: true,  tracking_decision: { logged: false, profile_write: false, reason: 'gpc_strict_enforcement' } },
    ];
    expect(siteLevelView(site_results)).toEqual([
      { site: 'the-verge', site_received_gpc: true, tracking_decision: { logged: false, profile_write: false, reason: 'gpc_strict_enforcement' } },
      { site: 'cnet',      site_received_gpc: true, tracking_decision: { logged: false, profile_write: false, reason: 'gpc_strict_enforcement' } },
    ]);
  });
});
