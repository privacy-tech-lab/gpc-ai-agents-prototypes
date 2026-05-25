'use strict';

const { createProvider } = require('../provider');
const { fanoutAll, fanoutSelected } = require('../orchestrator');
const { listPublisherIds } = require('../tool_registry');

describe('orchestrator', () => {
  const original_key = process.env.TAVILY_API_KEY;
  beforeAll(() => { delete process.env.TAVILY_API_KEY; });
  afterAll(()  => { if (original_key !== undefined) process.env.TAVILY_API_KEY = original_key; });

  test('fanoutAll hits every publisher in the registry', async () => {
    const p = createProvider();
    const r = await fanoutAll(p, 'u1', 'iPhone 17', { gpc: 0 });
    expect(r.site_results.length).toBe(listPublisherIds().length);
  });

  test('fanoutSelected hits only the requested set', async () => {
    const p = createProvider();
    const r = await fanoutSelected(p, 'u1', 'iPhone 17', ['the-verge', 'wired'], { gpc: 1 });
    expect(r.site_results.length).toBe(2);
    expect(r.site_results.map(x => x.site).sort()).toEqual(['the-verge', 'wired']);
  });

  test('end-to-end: sites enforce GPC, provider still observes', async () => {
    const p = createProvider();
    const r = await fanoutAll(p, 'u1', 'iPhone 17', { gpc: 1 });

    // Strict site honored the signal
    const strict = r.site_results.find(s => s.site === 'the-verge');
    expect(strict.tracking_decision.logged).toBe(false);

    // Provider still has the complete observation
    const view = p.getProviderView()[0];
    expect(view.query).toBe('iPhone 17');
    expect(view.fanout_targets.length).toBe(listPublisherIds().length);
    expect(view.meta_received.gpc).toBe(1);
  });

  test('per-call enforcement is independent across publishers', async () => {
    const p = createProvider();
    const r = await fanoutAll(p, 'u1', 'iPhone 17', { gpc: 1 });
    const reasons = new Set(r.site_results.map(s => s.tracking_decision.reason));
    // We expect a mix because the registry has strict, advisory, and none entries.
    expect(reasons.has('gpc_strict_enforcement')).toBe(true);
    expect(reasons.has('gpc_advisory_partial')).toBe(true);
    expect(reasons.has('site_does_not_support_gpc')).toBe(true);
  });
});
