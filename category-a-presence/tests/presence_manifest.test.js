/**
 * Unit tests for presence_manifest.js.
 */

const manifest = require('../presence_manifest');

beforeEach(() => {
  manifest.reset();
});

describe('reset', () => {
  test('returns the seed state: no AI enabled, ambient off', () => {
    const mf = manifest.reset();
    expect(mf.manifest_version).toBe('v1.0');
    expect(mf.enabled_ai_features).toEqual([]);
    expect(mf.declined_ai_features).toEqual([]);
    expect(mf.ambient_enabled).toBe(false);
    expect(mf.decided_at).toEqual({});
  });
});

describe('enable', () => {
  test('adds the feature to enabled_ai_features', () => {
    manifest.enable('ai_summarize');
    expect(manifest.isEnabled('ai_summarize')).toBe(true);
  });

  test('records a decision timestamp', () => {
    const mf = manifest.enable('ai_summarize');
    expect(mf.decided_at.ai_summarize).toBeDefined();
    expect(new Date(mf.decided_at.ai_summarize).toString()).not.toBe('Invalid Date');
  });

  test('removes the feature from declined_ai_features', () => {
    manifest.decline('ai_summarize');
    manifest.enable('ai_summarize');
    expect(manifest.isDeclined('ai_summarize')).toBe(false);
    expect(manifest.isEnabled('ai_summarize')).toBe(true);
  });

  test('does not duplicate an already enabled feature', () => {
    manifest.enable('ai_summarize');
    const mf = manifest.enable('ai_summarize');
    expect(mf.enabled_ai_features).toEqual(['ai_summarize']);
  });

  test('bumps the manifest version when one is given', () => {
    const mf = manifest.enable('ai_summarize', 'v2.0');
    expect(mf.manifest_version).toBe('v2.0');
  });
});

describe('decline', () => {
  test('adds the feature to declined_ai_features', () => {
    manifest.decline('ai_ambient_copilot');
    expect(manifest.isDeclined('ai_ambient_copilot')).toBe(true);
  });

  test('removes the feature from enabled_ai_features', () => {
    manifest.enable('ai_ambient_copilot');
    manifest.decline('ai_ambient_copilot');
    expect(manifest.isEnabled('ai_ambient_copilot')).toBe(false);
    expect(manifest.isDeclined('ai_ambient_copilot')).toBe(true);
  });

  test('does not duplicate an already declined feature', () => {
    manifest.decline('ai_summarize');
    const mf = manifest.decline('ai_summarize');
    expect(mf.declined_ai_features).toEqual(['ai_summarize']);
  });
});

describe('setAmbient', () => {
  test('turns ambient mode on', () => {
    const mf = manifest.setAmbient(true);
    expect(mf.ambient_enabled).toBe(true);
  });

  test('turns ambient mode back off', () => {
    manifest.setAmbient(true);
    const mf = manifest.setAmbient(false);
    expect(mf.ambient_enabled).toBe(false);
  });

  test('records a decision timestamp under ambient_mode', () => {
    const mf = manifest.setAmbient(true);
    expect(mf.decided_at.ambient_mode).toBeDefined();
  });
});

describe('persistence', () => {
  test('decisions survive a fresh load', () => {
    manifest.enable('ai_summarize');
    manifest.decline('ai_ambient_copilot');
    manifest.setAmbient(true);
    const mf = manifest.load();
    expect(mf.enabled_ai_features).toContain('ai_summarize');
    expect(mf.declined_ai_features).toContain('ai_ambient_copilot');
    expect(mf.ambient_enabled).toBe(true);
  });
});
