/**
 * Unit tests for W3C Baggage helpers (Layer 1).
 */

const { encodeBaggage, decodeBaggage, readGpcFromBaggage } = require('../orchestrator/baggage.js');

describe('encodeBaggage', () => {
  test('encodes a single entry', () => {
    expect(encodeBaggage({ gpc: '1' })).toBe('gpc=1');
  });

  test('encodes multiple entries as comma-separated pairs', () => {
    const header = encodeBaggage({ gpc: '1', session: 'abc' });
    expect(header).toContain('gpc=1');
    expect(header).toContain('session=abc');
  });

  test('encodes gpc=0', () => {
    expect(encodeBaggage({ gpc: '0' })).toBe('gpc=0');
  });
});

describe('decodeBaggage', () => {
  test('decodes a single entry', () => {
    expect(decodeBaggage('gpc=1')).toEqual({ gpc: '1' });
  });

  test('decodes multiple entries', () => {
    expect(decodeBaggage('gpc=1,session=abc')).toEqual({ gpc: '1', session: 'abc' });
  });

  test('returns empty object for empty/null header', () => {
    expect(decodeBaggage('')).toEqual({});
    expect(decodeBaggage(null)).toEqual({});
    expect(decodeBaggage(undefined)).toEqual({});
  });

  test('round-trips through encode', () => {
    const original = { gpc: '1', region: 'us-west' };
    expect(decodeBaggage(encodeBaggage(original))).toEqual(original);
  });
});

describe('readGpcFromBaggage', () => {
  test('returns true when gpc=1', () => {
    expect(readGpcFromBaggage('gpc=1')).toBe(true);
  });

  test('returns false when gpc=0', () => {
    expect(readGpcFromBaggage('gpc=0')).toBe(false);
  });

  test('returns false when gpc key is absent', () => {
    expect(readGpcFromBaggage('session=abc')).toBe(false);
  });

  test('returns false for empty header', () => {
    expect(readGpcFromBaggage('')).toBe(false);
  });

  test('extracts gpc from multi-entry baggage', () => {
    expect(readGpcFromBaggage('session=xyz,gpc=1,region=eu')).toBe(true);
  });
});
