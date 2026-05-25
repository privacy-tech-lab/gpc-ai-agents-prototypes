'use strict';

const {
  gpcAdoptionRate, topicDistribution, publisherReach,
  topicByGpcMatrix, inferUserInterests, siteLevelView,
} = require('../aggregation');

const sample_log = [
  { user_id: 'u1', query: 'iPhone',  query_topic: 'mobile_device', fanout_targets: ['the-verge', 'cnet'], meta_received: { gpc: 1 } },
  { user_id: 'u1', query: 'Pixel',   query_topic: 'mobile_device', fanout_targets: ['the-verge'],         meta_received: { gpc: 1 } },
  { user_id: 'u2', query: 'laptop',  query_topic: 'laptop',        fanout_targets: ['ars-technica'],      meta_received: { gpc: 0 } },
  { user_id: 'u3', query: 'iPhone',  query_topic: 'mobile_device', fanout_targets: ['cnet'],              meta_received: { gpc: 0 } },
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
