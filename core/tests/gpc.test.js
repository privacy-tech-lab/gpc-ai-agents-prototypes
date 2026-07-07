'use strict';

const { buildPrivacyContext } = require('../gpc');

function req(headers = {}, body = {}) {
  return { headers, body };
}

// ── Sec-GPC header ─────────────────────────────────────────────────────────────

describe('Sec-GPC header', () => {
  test('Sec-GPC: 1 sets gpc=1', () => {
    expect(buildPrivacyContext(req({ 'sec-gpc': '1' })).gpc).toBe(1);
  });

  test('Sec-GPC: 0 is treated as absent (gpc undefined)', () => {
    expect(buildPrivacyContext(req({ 'sec-gpc': '0' })).gpc).toBeUndefined();
  });

  test('Sec-GPC: 0 does not override body.gpc=1 (falls through to body)', () => {
    expect(buildPrivacyContext(req({ 'sec-gpc': '0' }, { gpc: 1 })).gpc).toBe(1);
  });

  test('unrecognized Sec-GPC value falls through to body', () => {
    expect(buildPrivacyContext(req({ 'sec-gpc': 'true' }, { gpc: 1 })).gpc).toBe(1);
  });

  // Node merges duplicate request headers into a comma-separated string.
  test('any "1" in a comma-joined Sec-GPC activates GPC', () => {
    expect(buildPrivacyContext(req({ 'sec-gpc': '1, 0' })).gpc).toBe(1);
    expect(buildPrivacyContext(req({ 'sec-gpc': '0, 1' })).gpc).toBe(1);
    expect(buildPrivacyContext(req({ 'sec-gpc': '1, 1' })).gpc).toBe(1);
  });

  test('all-zero comma-joined Sec-GPC is treated as absent', () => {
    expect(buildPrivacyContext(req({ 'sec-gpc': '0, 0' }, { gpc: 1 })).gpc).toBe(1);
  });
});

// ── body.gpc fallback ──────────────────────────────────────────────────────────

describe('body.gpc fallback (no Sec-GPC header)', () => {
  test('body.gpc=1 (number) sets gpc=1', () => {
    expect(buildPrivacyContext(req({}, { gpc: 1 })).gpc).toBe(1);
  });

  test('body.gpc="1" (string) sets gpc=1', () => {
    expect(buildPrivacyContext(req({}, { gpc: '1' })).gpc).toBe(1);
  });

  test('body.gpc=true sets gpc=1', () => {
    expect(buildPrivacyContext(req({}, { gpc: true })).gpc).toBe(1);
  });

  test('body.gpc=0 is treated as absent (gpc undefined)', () => {
    expect(buildPrivacyContext(req({}, { gpc: 0 })).gpc).toBeUndefined();
  });

  test('body.gpc=false is treated as absent (gpc undefined)', () => {
    expect(buildPrivacyContext(req({}, { gpc: false })).gpc).toBeUndefined();
  });

  test('body.gpc="0" is treated as absent (gpc undefined)', () => {
    expect(buildPrivacyContext(req({}, { gpc: '0' })).gpc).toBeUndefined();
  });

  test('unrecognized body.gpc value leaves gpc absent', () => {
    expect(buildPrivacyContext(req({}, { gpc: 'yes'  })).gpc).toBeUndefined();
    expect(buildPrivacyContext(req({}, { gpc: null   })).gpc).toBeUndefined();
  });
});

// ── absent signal ──────────────────────────────────────────────────────────────

describe('absent signal', () => {
  test('no header and no body.gpc: gpc key is absent from the returned object', () => {
    const ctx = buildPrivacyContext(req());
    expect('gpc' in ctx).toBe(false);
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
    expect('gpc_scope' in ctx).toBe(false);
  });

  test('absent gpc_scope is omitted from the context', () => {
    const ctx = buildPrivacyContext(req({}, { gpc: 1 }));
    expect('gpc_scope' in ctx).toBe(false);
  });
});
