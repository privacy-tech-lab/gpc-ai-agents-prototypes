/**
 * Unit tests for feature_registry.js.
 */

const registry = require('../feature_registry');

describe('getFeature', () => {
  test('returns the feature object for a known name', () => {
    const f = registry.getFeature('ai_summarize');
    expect(f).not.toBeNull();
    expect(f.is_ai).toBe(true);
    expect(f.invocation).toBe('on_demand');
    expect(f.added_in).toBe('v2.0');
  });

  test('returns null for an unknown name', () => {
    expect(registry.getFeature('nonexistent')).toBeNull();
  });
});

describe('getCatalog', () => {
  test('v1.0 catalog contains only the two non-AI features', () => {
    const names = registry.getCatalog('v1.0').map(f => f.name);
    expect(names).toEqual(['note_read', 'note_save']);
  });

  test('v1.0 catalog contains no AI features at all', () => {
    const ai = registry.getCatalog('v1.0').filter(f => f.is_ai);
    expect(ai).toHaveLength(0);
  });

  test('v2.0 catalog contains all four features', () => {
    expect(registry.getCatalog('v2.0')).toHaveLength(4);
  });

  test('v2.0 catalog includes one on-demand and one passive AI feature', () => {
    const ai = registry.getCatalog('v2.0').filter(f => f.is_ai);
    const invocations = ai.map(f => f.invocation).sort();
    expect(invocations).toEqual(['on_demand', 'passive']);
  });
});

describe('isNewerThan', () => {
  test('v2.0 is newer than v1.0', () => {
    expect(registry.isNewerThan('v2.0', 'v1.0')).toBe(true);
  });

  test('v1.0 is not newer than v1.0', () => {
    expect(registry.isNewerThan('v1.0', 'v1.0')).toBe(false);
  });

  test('v1.0 is not newer than v2.0', () => {
    expect(registry.isNewerThan('v1.0', 'v2.0')).toBe(false);
  });
});
