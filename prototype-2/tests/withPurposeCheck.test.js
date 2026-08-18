/**
 * Unit tests for lib/withPurposeCheck.js.
 *
 * evaluatePurpose is a pure function, so every case here runs without I/O.
 * withPurposeCheck wraps a mock fn so we can assert whether it was called.
 */

const { evaluatePurpose, withPurposeCheck } = require('../lib/withPurposeCheck');
const { RESTRICTABLE_PURPOSES_SET }         = require('../lib/purposeRegistry');

// ── evaluatePurpose ───────────────────────────────────────────────────────────

describe('evaluatePurpose — missing purpose', () => {
  test('undefined purpose → blocked with missing_purpose_field', () => {
    const r = evaluatePurpose({ gpc: 1 }, undefined, RESTRICTABLE_PURPOSES_SET);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('missing_purpose_field');
  });

  test('empty-string purpose → blocked with missing_purpose_field', () => {
    const r = evaluatePurpose({ gpc: 1 }, '', RESTRICTABLE_PURPOSES_SET);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('missing_purpose_field');
  });
});

describe('evaluatePurpose — primary purpose (not in registry)', () => {
  test('patient_response with gpc=1 → allowed (purpose_not_restrictable)', () => {
    const r = evaluatePurpose({ gpc: 1 }, 'patient_response', RESTRICTABLE_PURPOSES_SET);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('purpose_not_restrictable');
  });

  test('unknown purpose with gpc=1 → allowed (not restrictable)', () => {
    const r = evaluatePurpose({ gpc: 1 }, 'some_future_purpose', RESTRICTABLE_PURPOSES_SET);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('purpose_not_restrictable');
  });
});

describe('evaluatePurpose — secondary purposes, GPC signal absent', () => {
  test('analytics with no gpc field → allowed', () => {
    const r = evaluatePurpose({}, 'analytics', RESTRICTABLE_PURPOSES_SET);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('gpc_not_active');
  });

  test('model_training with no gpc field → allowed', () => {
    const r = evaluatePurpose({}, 'model_training', RESTRICTABLE_PURPOSES_SET);
    expect(r.allowed).toBe(true);
  });

  test('ad_targeting with no gpc field → allowed', () => {
    const r = evaluatePurpose({}, 'ad_targeting', RESTRICTABLE_PURPOSES_SET);
    expect(r.allowed).toBe(true);
  });
});

describe('evaluatePurpose — full opt-out (gpc=1, no gpc_scope)', () => {
  test('analytics blocked', () => {
    const r = evaluatePurpose({ gpc: 1 }, 'analytics', RESTRICTABLE_PURPOSES_SET);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('purpose_restricted');
  });

  test('model_training blocked', () => {
    const r = evaluatePurpose({ gpc: 1 }, 'model_training', RESTRICTABLE_PURPOSES_SET);
    expect(r.allowed).toBe(false);
  });

  test('ad_targeting blocked', () => {
    const r = evaluatePurpose({ gpc: 1 }, 'ad_targeting', RESTRICTABLE_PURPOSES_SET);
    expect(r.allowed).toBe(false);
  });

  test('primary purpose still allowed with gpc=1', () => {
    const r = evaluatePurpose({ gpc: 1 }, 'patient_response', RESTRICTABLE_PURPOSES_SET);
    expect(r.allowed).toBe(true);
  });

  test('accepts gpc=true and gpc="1" as truthy signals', () => {
    for (const gpc of [true, '1']) {
      const r = evaluatePurpose({ gpc }, 'analytics', RESTRICTABLE_PURPOSES_SET);
      expect(r.allowed).toBe(false);
    }
  });
});

describe('evaluatePurpose — partial opt-out (gpc_scope)', () => {
  test('only ad_targeting in scope → analytics and model_training allowed', () => {
    const ctx = { gpc: 1, gpc_scope: ['ad_targeting'] };
    expect(evaluatePurpose(ctx, 'analytics',       RESTRICTABLE_PURPOSES_SET).allowed).toBe(true);
    expect(evaluatePurpose(ctx, 'model_training',  RESTRICTABLE_PURPOSES_SET).allowed).toBe(true);
    expect(evaluatePurpose(ctx, 'ad_targeting',    RESTRICTABLE_PURPOSES_SET).allowed).toBe(false);
  });

  test('analytics + model_training in scope → ad_targeting still allowed', () => {
    const ctx = { gpc: 1, gpc_scope: ['analytics', 'model_training'] };
    expect(evaluatePurpose(ctx, 'analytics',      RESTRICTABLE_PURPOSES_SET).allowed).toBe(false);
    expect(evaluatePurpose(ctx, 'model_training', RESTRICTABLE_PURPOSES_SET).allowed).toBe(false);
    expect(evaluatePurpose(ctx, 'ad_targeting',   RESTRICTABLE_PURPOSES_SET).allowed).toBe(true);
  });

  test('all three in scope → all blocked', () => {
    const ctx = { gpc: 1, gpc_scope: ['analytics', 'model_training', 'ad_targeting'] };
    for (const p of ['analytics', 'model_training', 'ad_targeting']) {
      expect(evaluatePurpose(ctx, p, RESTRICTABLE_PURPOSES_SET).allowed).toBe(false);
    }
  });

  test('reason is purpose_not_in_gpc_scope when allowed via partial opt-out', () => {
    const ctx = { gpc: 1, gpc_scope: ['ad_targeting'] };
    const r = evaluatePurpose(ctx, 'analytics', RESTRICTABLE_PURPOSES_SET);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('purpose_not_in_gpc_scope');
  });
});

// ── withPurposeCheck wrapper ──────────────────────────────────────────────────

describe('withPurposeCheck — wrapper behaviour', () => {
  const mockFn = jest.fn().mockResolvedValue({ data: 'result' });

  beforeEach(() => mockFn.mockClear());

  test('allowed: calls fn and returns ok envelope with purpose + layer', async () => {
    const guarded = withPurposeCheck(mockFn, {
      purpose:  'analytics',
      registry: RESTRICTABLE_PURPOSES_SET,
      layer:    'analytics_pipeline',
    });
    const result = await guarded({ x: 1 }, {});
    expect(result.status).toBe('ok');
    expect(result.purpose).toBe('analytics');
    expect(result.layer).toBe('analytics_pipeline');
    expect(result.result).toEqual({ data: 'result' });
    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(mockFn).toHaveBeenCalledWith({ x: 1 }, {});
  });

  test('blocked: does not call fn, returns blocked envelope', async () => {
    const guarded = withPurposeCheck(mockFn, {
      purpose:  'analytics',
      registry: RESTRICTABLE_PURPOSES_SET,
      layer:    'analytics_pipeline',
    });
    const result = await guarded({ x: 1 }, { gpc: 1 });
    expect(result.status).toBe('blocked');
    expect(result.purpose).toBe('analytics');
    expect(result.layer).toBe('analytics_pipeline');
    expect(mockFn).not.toHaveBeenCalled();
  });

  test('primary purpose (patient_response): always calls fn even with gpc=1', async () => {
    const guarded = withPurposeCheck(mockFn, {
      purpose:  'patient_response',
      registry: RESTRICTABLE_PURPOSES_SET,
      layer:    'primary',
    });
    const result = await guarded({}, { gpc: 1 });
    expect(result.status).toBe('ok');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  test('partial opt-out: calls fn when purpose not in gpc_scope', async () => {
    const guarded = withPurposeCheck(mockFn, {
      purpose:  'analytics',
      registry: RESTRICTABLE_PURPOSES_SET,
      layer:    'analytics_pipeline',
    });
    const result = await guarded({}, { gpc: 1, gpc_scope: ['ad_targeting'] });
    expect(result.status).toBe('ok');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  test('partial opt-out: does not call fn when purpose is in gpc_scope', async () => {
    const guarded = withPurposeCheck(mockFn, {
      purpose:  'ad_targeting',
      registry: RESTRICTABLE_PURPOSES_SET,
      layer:    'ad_pipeline',
    });
    const result = await guarded({}, { gpc: 1, gpc_scope: ['ad_targeting'] });
    expect(result.status).toBe('blocked');
    expect(mockFn).not.toHaveBeenCalled();
  });

  test('default layer label is used when layer not specified', async () => {
    const guarded = withPurposeCheck(mockFn, {
      purpose:  'analytics',
      registry: RESTRICTABLE_PURPOSES_SET,
    });
    const result = await guarded({}, { gpc: 1 });
    expect(result.layer).toBe('unnamed_layer');
  });
});
