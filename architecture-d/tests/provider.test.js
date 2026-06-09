'use strict';

const { createProvider } = require('../provider');

describe('provider middleware', () => {
  const original_key = process.env.TAVILY_API_KEY;
  beforeAll(() => { delete process.env.TAVILY_API_KEY; });
  afterAll(()  => { if (original_key !== undefined) process.env.TAVILY_API_KEY = original_key; });

  test('logs every fanout call', async () => {
    const p = createProvider();
    await p.fanout('u1', 'iPhone 17',  ['the-verge', 'cnet'], { gpc: 0 });
    await p.fanout('u2', 'Pixel Watch', ['wired'],            { gpc: 1 });
    const log = p.getProviderView();
    expect(log).toHaveLength(2);
    expect(log[0].user_id).toBe('u1');
    expect(log[1].meta_received.gpc).toBe(1);
  });

  test('observation captures all fields needed for E1 derivations', async () => {
    const p = createProvider();
    await p.fanout('u1', 'iPhone 17', ['the-verge', 'cnet'], { gpc: 1 });
    const o = p.getProviderView()[0];
    expect(o).toEqual(expect.objectContaining({
      timestamp:       expect.any(String),
      provider_id:     expect.any(String),
      user_id:         'u1',
      query:           'iPhone 17',
      query_topic:     'mobile_device',
      fanout_targets:  ['the-verge', 'cnet'],
      meta_received:   { gpc: 1 },
      meta_forwarded:  { gpc: 1 },
      mitm_applied:    false,
    }));
  });

  test('structural invariant: provider view unchanged by GPC state', async () => {
    const a = createProvider();
    await a.fanout('u1', 'iPhone 17', ['the-verge'], { gpc: 0 });
    const off = a.getProviderView()[0];

    const b = createProvider();
    await b.fanout('u1', 'iPhone 17', ['the-verge'], { gpc: 1 });
    const on  = b.getProviderView()[0];

    // The observability fields that drive aggregation are identical.
    expect(on.query).toBe(off.query);
    expect(on.fanout_targets).toEqual(off.fanout_targets);
    expect(on.query_topic).toBe(off.query_topic);
    expect(on.user_id).toBe(off.user_id);
  });

  test('mitm mode strips meta_forwarded but retains meta_received', async () => {
    const p = createProvider({ mitm: true });
    await p.fanout('u1', 'iPhone 17', ['the-verge'], { gpc: 1 });
    const o = p.getProviderView()[0];
    expect(o.meta_received.gpc).toBe(1);
    expect(o.meta_forwarded).toEqual({});
    expect(o.mitm_applied).toBe(true);
  });

  test('sites receive no GPC under mitm even though the user sent GPC=1', async () => {
    const p = createProvider({ mitm: true });
    const r = await p.fanout('u1', 'iPhone 17', ['the-verge'], { gpc: 1 });
    expect(r.site_results[0].site_received_gpc).toBe(false);
    expect(r.site_results[0].tracking_decision.reason).toBe('normal_operation');
  });

  test('reset clears the observation log', async () => {
    const p = createProvider();
    await p.fanout('u1', 'q', ['the-verge'], {});
    expect(p.getProviderView()).toHaveLength(1);
    p.reset();
    expect(p.getProviderView()).toHaveLength(0);
  });

  test('mitigations are applied to each observation', async () => {
    const tag = {
      name: 'tag',
      apply(o) { return { ...o, tagged: true }; },
    };
    const p = createProvider({ mitigations: tag });
    await p.fanout('u1', 'q', ['the-verge'], { gpc: 1 });
    expect(p.getProviderView()[0].tagged).toBe(true);
  });
});
