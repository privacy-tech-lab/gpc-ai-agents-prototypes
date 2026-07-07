'use strict';

const { buildPrivacyContext } = require('../gpc');

function req(headers = {}, body = {}) {
  return { headers, body };
}

// ── Sec-GPC header ─────────────────────────────────────────────────────────────

describe('Sec-GPC header', () => {
  test('Sec-GPC: 1 returns gpc=1', () => {
    expect(buildPrivacyContext(req({ 'sec-gpc': '1' })).gpc).toBe(1);
  });

  test('Sec-GPC: 0 returns gpc=0', () => {
    expect(buildPrivacyContext(req({ 'sec-gpc': '0' })).gpc).toBe(0);
  });

  test('Sec-GPC: 1 overrides body.gpc=0', () => {
    expect(buildPrivacyContext(req({ 'sec-gpc': '1' }, { gpc: 0 })).gpc).toBe(1);
  });

  test('Sec-GPC: 0 overrides body.gpc=1', () => {
    expect(buildPrivacyContext(req({ 'sec-gpc': '0' }, { gpc: 1 })).gpc).toBe(0);
  });

  test('unrecognized Sec-GPC value falls through to body', () => {
    expect(buildPrivacyContext(req({ 'sec-gpc': 'true' }, { gpc: 1 })).gpc).toBe(1);
  });

  // Node merges duplicate request headers into a comma-separated string.
  test('any "1" in a comma-joined Sec-GPC sets gpc=1 (most restrictive wins)', () => {
    expect(buildPrivacyContext(req({ 'sec-gpc': '1, 0' })).gpc).toBe(1);
    expect(buildPrivacyContext(req({ 'sec-gpc': '0, 1' })).gpc).toBe(1);
    expect(buildPrivacyContext(req({ 'sec-gpc': '1, 1' })).gpc).toBe(1);
  });

  test('all-zero comma-joined Sec-GPC sets gpc=0 and overrides body.gpc=1', () => {
    expect(buildPrivacyContext(req({ 'sec-gpc': '0, 0' }, { gpc: 1 })).gpc).toBe(0);
  });
});

// ── body.gpc fallback ──────────────────────────────────────────────────────────

describe('body.gpc fallback (no Sec-GPC header)', () => {
  test('body.gpc=1 (number) returns gpc=1', () => {
    expect(buildPrivacyContext(req({}, { gpc: 1 })).gpc).toBe(1);
  });

  test('body.gpc=0 (number) returns gpc=0', () => {
    expect(buildPrivacyContext(req({}, { gpc: 0 })).gpc).toBe(0);
  });

  test('body.gpc="1" (string) is normalized to 1', () => {
    expect(buildPrivacyContext(req({}, { gpc: '1' })).gpc).toBe(1);
  });

  test('body.gpc="0" (string) is normalized to 0', () => {
    expect(buildPrivacyContext(req({}, { gpc: '0' })).gpc).toBe(0);
  });

  test('body.gpc=true is normalized to 1', () => {
    expect(buildPrivacyContext(req({}, { gpc: true })).gpc).toBe(1);
  });

  test('body.gpc=false is normalized to 0', () => {
    expect(buildPrivacyContext(req({}, { gpc: false })).gpc).toBe(0);
  });

  test('unrecognized body.gpc value leaves gpc undefined', () => {
    expect(buildPrivacyContext(req({}, { gpc: 'yes'  })).gpc).toBeUndefined();
    expect(buildPrivacyContext(req({}, { gpc: null   })).gpc).toBeUndefined();
  });
});

// ── absent signal ──────────────────────────────────────────────────────────────

describe('absent signal', () => {
  test('no header and no body.gpc leaves gpc undefined', () => {
    expect(buildPrivacyContext(req()).gpc).toBeUndefined();
  });
});

// ── gpc_scope (partial opt-out) ────────────────────────────────────────────────

describe('gpc_scope', () => {
  test('body.gpc_scope array is included in the context', () => {
    const ctx = buildPrivacyContext(req({}, { gpc: 1, gpc_scope: ['ad_targeting'] }));
    expect(ctx.gpc_scope).toEqual(['ad_targeting']);
  });

  test('gpc_scope with multiple purposes is preserved in full', () => {
    const scopes = ['analytics', 'model_training'];
    const ctx = buildPrivacyContext(req({}, { gpc: 1, gpc_scope: scopes }));
    expect(ctx.gpc_scope).toEqual(scopes);
  });

  test('non-array gpc_scope is omitted from the context', () => {
    const ctx = buildPrivacyContext(req({}, { gpc: 1, gpc_scope: 'ad_targeting' }));
    expect(ctx.gpc_scope).toBeUndefined();
    expect('gpc_scope' in ctx).toBe(false);
  });

  test('absent gpc_scope is omitted from the context', () => {
    const ctx = buildPrivacyContext(req({}, { gpc: 1 }));
    expect('gpc_scope' in ctx).toBe(false);
  });
});
