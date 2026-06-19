'use strict';

const { createProvider } = require('../provider/provider');

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

  test('a throwing mitigation does not drop the observation; raw record kept', async () => {
    const evil = {
      name:  'evil',
      apply: () => { throw new Error('mitigation boom'); },
    };
    const p = createProvider({ mitigations: evil });

    // Silence the stderr write the provider emits.
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = () => true;
    let r;
    try {
      r = await p.fanout('u1', 'iPhone 17', ['the-verge'], { gpc: 1 });
    } finally {
      process.stderr.write = orig;
    }

    // The provider still records the request and the fanout completes.
    expect(p.getProviderView().length).toBe(1);
    const obs = p.getProviderView()[0];
    expect(obs.user_id).toBe('u1');
    expect(obs.query).toBe('iPhone 17');
    expect(obs.meta_received.gpc).toBe(1);
    // The failure is surfaced on the observation so it's visible to consumers.
    expect(obs.mitigation_error).toMatch(/mitigation boom/);
    // The mitigation tag is absent (not applied).
    expect(obs.do_not_train).toBeUndefined();
    expect(obs.k_anon_suppressed).toBeUndefined();
    // Site results came through.
    expect(r.site_results.length).toBe(1);
    expect(r.site_results[0].status).toBe('ok');
  });

  test('observation_id is correct when fanouts overlap on the same provider', async () => {
    const p = createProvider();
    const [a, b, c] = await Promise.all([
      p.fanout('u1', 'q1', ['the-verge'], { gpc: 0 }),
      p.fanout('u2', 'q2', ['wired'],     { gpc: 1 }),
      p.fanout('u3', 'q3', ['cnet'],      { gpc: 0 }),
    ]);
    // observation_ids should be unique and form a permutation of 0..2.
    const ids = [a.observation_id, b.observation_id, c.observation_id].sort();
    expect(ids).toEqual([0, 1, 2]);
    expect(p.getProviderView().length).toBe(3);
    // The id each fanout returned must index its own observation.
    const view = p.getProviderView();
    expect(view[a.observation_id].user_id).toBe('u1');
    expect(view[b.observation_id].user_id).toBe('u2');
    expect(view[c.observation_id].user_id).toBe('u3');
  });

  test('a throwing site is isolated as an error result; other sites complete', async () => {
    let r;
    await jest.isolateModulesAsync(async () => {
      jest.doMock('../services/site_handlers', () => ({
        querySite: async (siteId) => {
          if (siteId === 'BOOM') throw new Error('site crashed');
          return { status: 'ok', site: siteId, tracking_decision: { logged: false, profile_write: false, reason: 'mocked' } };
        },
        decideTracking: () => ({ logged: false, profile_write: false, reason: 'mocked' }),
      }));
      const { createProvider: cp2 } = require('../provider/provider');
      const p = cp2();
      r = await p.fanout('u1', 'q', ['the-verge', 'BOOM', 'cnet'], { gpc: 1 });
    });

    expect(r.site_results.length).toBe(3);
    const boom = r.site_results.find((s) => s.site === 'BOOM');
    expect(boom).toEqual({
      status: 'error',
      site:   'BOOM',
      reason: 'site_handler_threw',
      detail: 'site crashed',
    });
    const okSites = r.site_results.filter((s) => s.status === 'ok').map((s) => s.site).sort();
    expect(okSites).toEqual(['cnet', 'the-verge']);
  });

  test('getProviderView handles functions on the observation (JSON fallback path)', async () => {
    // Regression. structuredClone throws on functions. The layered
    // clone falls back to JSON which drops the function silently.
    const fnMit = {
      name:  'fn',
      apply: (o) => { o.callback = () => 'hi'; return o; },
    };
    const p = createProvider({ mitigations: fnMit });
    await p.fanout('u1', 'iPhone 17', ['the-verge'], { gpc: 1 });
    const view = p.getProviderView();
    expect(view).toHaveLength(1);
    expect(view[0].user_id).toBe('u1');
  });

  test('getProviderView handles circular references introduced by a mitigation', async () => {
    // Regression. JSON.parse(JSON.stringify(...)) used to throw on a
    // circular structure. structuredClone handles cycles natively.
    const cyclic = {
      name:  'cyclic',
      apply: (o) => { o.self = o; return o; },
    };
    const p = createProvider({ mitigations: cyclic });
    await p.fanout('u1', 'iPhone 17', ['the-verge'], { gpc: 1 });
    const view = p.getProviderView();
    expect(view).toHaveLength(1);
    expect(view[0].user_id).toBe('u1');
    expect(view[0].self).toBe(view[0]);
  });
});
