/**
 * Unit tests for tool_registry.js
 *
 * Covers:
 *  - getTool returns the correct entry or null
 *  - getCatalog filters correctly by platform version
 *  - isNewerThan version comparison across all relevant pairs
 */

const registry = require('../tool_registry');

describe('getTool', () => {
  test('returns the correct entry for a known v1.0 tool', () => {
    const t = registry.getTool('file_read');
    expect(t.name).toBe('file_read');
    expect(t.capability_category).toBe('file_access');
    expect(t.added_at).toBe('v1.0');
    expect(typeof t.description).toBe('string');
  });

  test('returns the correct entry for a known v2.0 tool', () => {
    const t = registry.getTool('email_sender');
    expect(t.name).toBe('email_sender');
    expect(t.capability_category).toBe('communication');
    expect(t.added_at).toBe('v2.0');
  });

  test('returns null for an unknown tool name', () => {
    expect(registry.getTool('nonexistent_tool')).toBeNull();
  });

  test('behavior_tracker has analytics category', () => {
    const t = registry.getTool('behavior_tracker');
    expect(t.capability_category).toBe('analytics');
    expect(t.added_at).toBe('v2.0');
  });

  test('all v1.0 tools exist in the catalog', () => {
    const v1Tools = ['file_read', 'web_search'];
    for (const name of v1Tools) {
      expect(registry.getTool(name)).not.toBeNull();
    }
  });
});

describe('getCatalog', () => {
  test('v1.0 catalog contains exactly 2 tools', () => {
    expect(registry.getCatalog('v1.0')).toHaveLength(2);
  });

  test('v2.0 catalog contains exactly 4 tools', () => {
    expect(registry.getCatalog('v2.0')).toHaveLength(4);
  });

  test('v1.0 catalog does not include email_sender', () => {
    const names = registry.getCatalog('v1.0').map(t => t.name);
    expect(names).not.toContain('email_sender');
  });

  test('v1.0 catalog does not include behavior_tracker', () => {
    const names = registry.getCatalog('v1.0').map(t => t.name);
    expect(names).not.toContain('behavior_tracker');
  });

  test('v2.0 catalog includes all v1.0 tools', () => {
    const names = registry.getCatalog('v2.0').map(t => t.name);
    expect(names).toContain('file_read');
    expect(names).toContain('web_search');
  });

  test('v2.0 catalog includes the new v2.0 tools', () => {
    const names = registry.getCatalog('v2.0').map(t => t.name);
    expect(names).toContain('email_sender');
    expect(names).toContain('behavior_tracker');
  });
});

describe('isNewerThan', () => {
  test('v2.0 is newer than v1.0', () => {
    expect(registry.isNewerThan('v2.0', 'v1.0')).toBe(true);
  });

  test('v3.0 is newer than v2.0', () => {
    expect(registry.isNewerThan('v3.0', 'v2.0')).toBe(true);
  });

  test('v3.0 is newer than v1.0', () => {
    expect(registry.isNewerThan('v3.0', 'v1.0')).toBe(true);
  });

  test('v1.0 is not newer than v1.0 (same version)', () => {
    expect(registry.isNewerThan('v1.0', 'v1.0')).toBe(false);
  });

  test('v2.0 is not newer than v2.0 (same version)', () => {
    expect(registry.isNewerThan('v2.0', 'v2.0')).toBe(false);
  });

  test('v1.0 is not newer than v2.0', () => {
    expect(registry.isNewerThan('v1.0', 'v2.0')).toBe(false);
  });
});
