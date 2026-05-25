/**
 * Unit tests for consent_manifest.js
 *
 * Covers:
 *  - reset restores the v1.0 seed state
 *  - isApproved / isDeclined read categories correctly
 *  - requiresFreshConsent enforces all three gating conditions
 *  - approve writes to disk and records a timestamp
 *  - decline writes to disk and removes from approved
 *  - approve/decline are idempotent
 *  - approve reverses a prior decline, and vice versa
 */

const manifest = require('../consent_manifest');

beforeEach(() => manifest.reset());

describe('reset', () => {
  test('restores manifest_version to v1.0', () => {
    const mf = manifest.reset();
    expect(mf.manifest_version).toBe('v1.0');
  });

  test('restores approved_categories to file_access and external_api', () => {
    const mf = manifest.reset();
    expect(mf.approved_categories).toContain('file_access');
    expect(mf.approved_categories).toContain('external_api');
    expect(mf.approved_categories).toHaveLength(2);
  });

  test('clears declined_categories', () => {
    manifest.decline('analytics');
    const mf = manifest.reset();
    expect(mf.declined_categories).toHaveLength(0);
  });

  test('discards previous approve decisions', () => {
    manifest.approve('communication');
    const mf = manifest.reset();
    expect(mf.approved_categories).not.toContain('communication');
  });
});

describe('isApproved', () => {
  test('file_access is approved in seed state', () => {
    const mf = manifest.load();
    expect(manifest.isApproved('file_access', mf)).toBe(true);
  });

  test('external_api is approved in seed state', () => {
    const mf = manifest.load();
    expect(manifest.isApproved('external_api', mf)).toBe(true);
  });

  test('communication is not approved in seed state', () => {
    const mf = manifest.load();
    expect(manifest.isApproved('communication', mf)).toBe(false);
  });

  test('analytics is not approved in seed state', () => {
    const mf = manifest.load();
    expect(manifest.isApproved('analytics', mf)).toBe(false);
  });
});

describe('isDeclined', () => {
  test('nothing is declined in seed state', () => {
    const mf = manifest.load();
    expect(manifest.isDeclined('communication', mf)).toBe(false);
    expect(manifest.isDeclined('analytics', mf)).toBe(false);
  });

  test('returns true for a category that was declined', () => {
    manifest.decline('analytics');
    const mf = manifest.load();
    expect(manifest.isDeclined('analytics', mf)).toBe(true);
  });
});

describe('requiresFreshConsent', () => {
  test('v2.0 tool requires fresh consent against a v1.0 manifest', () => {
    const tool = { capability_category: 'communication', added_at: 'v2.0' };
    const mf = manifest.load();
    expect(manifest.requiresFreshConsent(tool, mf)).toBe(true);
  });

  test('v1.0 tool does not require fresh consent against a v1.0 manifest', () => {
    const tool = { capability_category: 'file_access', added_at: 'v1.0' };
    const mf = manifest.load();
    expect(manifest.requiresFreshConsent(tool, mf)).toBe(false);
  });

  test('already approved category does not require fresh consent', () => {
    manifest.approve('communication');
    const tool = { capability_category: 'communication', added_at: 'v2.0' };
    const mf = manifest.load();
    expect(manifest.requiresFreshConsent(tool, mf)).toBe(false);
  });

  test('previously declined category does not require fresh consent — it is hard blocked', () => {
    manifest.decline('communication');
    const tool = { capability_category: 'communication', added_at: 'v2.0' };
    const mf = manifest.load();
    expect(manifest.requiresFreshConsent(tool, mf)).toBe(false);
  });
});

describe('approve', () => {
  test('adds the category to approved_categories', () => {
    manifest.approve('communication');
    const mf = manifest.load();
    expect(mf.approved_categories).toContain('communication');
  });

  test('records a consented_at timestamp', () => {
    const before = Date.now();
    manifest.approve('communication');
    const after = Date.now();
    const mf = manifest.load();
    const ts = new Date(mf.consented_at.communication).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  test('persists to disk — survives a fresh load() call', () => {
    manifest.approve('analytics');
    const mf = manifest.load();
    expect(mf.approved_categories).toContain('analytics');
  });

  test('is idempotent — approving twice does not duplicate the entry', () => {
    manifest.approve('communication');
    manifest.approve('communication');
    const mf = manifest.load();
    const count = mf.approved_categories.filter(c => c === 'communication').length;
    expect(count).toBe(1);
  });

  test('removes the category from declined_categories if previously declined', () => {
    manifest.decline('analytics');
    manifest.approve('analytics');
    const mf = manifest.load();
    expect(mf.declined_categories).not.toContain('analytics');
    expect(mf.approved_categories).toContain('analytics');
  });
});

describe('decline', () => {
  test('adds the category to declined_categories', () => {
    manifest.decline('communication');
    const mf = manifest.load();
    expect(mf.declined_categories).toContain('communication');
  });

  test('removes the category from approved_categories', () => {
    manifest.approve('analytics');
    manifest.decline('analytics');
    const mf = manifest.load();
    expect(mf.approved_categories).not.toContain('analytics');
  });

  test('persists to disk — survives a fresh load() call', () => {
    manifest.decline('communication');
    const mf = manifest.load();
    expect(mf.declined_categories).toContain('communication');
  });

  test('is idempotent — declining twice does not duplicate the entry', () => {
    manifest.decline('communication');
    manifest.decline('communication');
    const mf = manifest.load();
    const count = mf.declined_categories.filter(c => c === 'communication').length;
    expect(count).toBe(1);
  });

  test('preserves other approved categories', () => {
    manifest.decline('communication');
    const mf = manifest.load();
    expect(mf.approved_categories).toContain('file_access');
    expect(mf.approved_categories).toContain('external_api');
  });
});
