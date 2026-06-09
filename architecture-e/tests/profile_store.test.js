/**
 * Unit tests for profile_store.js
 *
 * Covers:
 *  - New store starts empty
 *  - write() adds scalar attributes
 *  - write() merges array attributes without duplicates
 *  - write() overwrites scalar on second call
 *  - incrementBlocked() counts correctly
 *  - snapshot() returns a point-in-time copy
 *  - Mutating a snapshot does not affect the store
 *  - isEmpty() and attributeCount() reflect store state
 *  - Multiple createProfileStore() calls are independent
 */

const { createProfileStore } = require('../profile_store');

describe('initial state', () => {
  test('isEmpty() returns true for a new store', () => {
    const store = createProfileStore();
    expect(store.isEmpty()).toBe(true);
  });

  test('attributeCount() returns 0 for a new store', () => {
    const store = createProfileStore();
    expect(store.attributeCount()).toBe(0);
  });

  test('snapshot() has an empty attributes object', () => {
    const store = createProfileStore();
    const snap = store.snapshot();
    expect(snap.attributes).toEqual({});
  });

  test('snapshot() has blocked_count of 0', () => {
    const store = createProfileStore();
    const snap = store.snapshot();
    expect(snap.blocked_count).toBe(0);
  });
});

describe('write() — scalar values', () => {
  test('adds a scalar attribute', () => {
    const store = createProfileStore();
    store.write({ housing_situation: 'renting' });
    expect(store.snapshot().attributes.housing_situation).toBe('renting');
  });

  test('adds a boolean attribute', () => {
    const store = createProfileStore();
    store.write({ financial_pressure: true });
    expect(store.snapshot().attributes.financial_pressure).toBe(true);
  });

  test('overwrites a scalar attribute on second write', () => {
    const store = createProfileStore();
    store.write({ housing_situation: 'renting' });
    store.write({ housing_situation: 'owned' });
    expect(store.snapshot().attributes.housing_situation).toBe('owned');
  });

  test('attributeCount() increases after write', () => {
    const store = createProfileStore();
    store.write({ a: 1, b: 2 });
    expect(store.attributeCount()).toBe(2);
  });

  test('isEmpty() returns false after write', () => {
    const store = createProfileStore();
    store.write({ x: 'y' });
    expect(store.isEmpty()).toBe(false);
  });
});

describe('write() — array values', () => {
  test('adds an array attribute', () => {
    const store = createProfileStore();
    store.write({ health_flags: ['possible_diabetes'] });
    expect(store.snapshot().attributes.health_flags).toContain('possible_diabetes');
  });

  test('merges two arrays without duplicates', () => {
    const store = createProfileStore();
    store.write({ health_flags: ['possible_diabetes'] });
    store.write({ health_flags: ['possible_diabetes', 'cardiovascular_concern'] });
    const { health_flags } = store.snapshot().attributes;
    expect(health_flags).toContain('possible_diabetes');
    expect(health_flags).toContain('cardiovascular_concern');
    // possible_diabetes should appear exactly once
    expect(health_flags.filter(f => f === 'possible_diabetes')).toHaveLength(1);
  });

  test('preserves existing array items when adding new ones', () => {
    const store = createProfileStore();
    store.write({ health_flags: ['a'] });
    store.write({ health_flags: ['b'] });
    const { health_flags } = store.snapshot().attributes;
    expect(health_flags).toContain('a');
    expect(health_flags).toContain('b');
  });
});

describe('incrementBlocked()', () => {
  test('blocked_count starts at 0', () => {
    const store = createProfileStore();
    expect(store.snapshot().blocked_count).toBe(0);
  });

  test('increments by 1 each call', () => {
    const store = createProfileStore();
    store.incrementBlocked();
    expect(store.snapshot().blocked_count).toBe(1);
  });

  test('accumulates across multiple calls', () => {
    const store = createProfileStore();
    store.incrementBlocked();
    store.incrementBlocked();
    store.incrementBlocked();
    expect(store.snapshot().blocked_count).toBe(3);
  });

  test('does not affect attributes', () => {
    const store = createProfileStore();
    store.incrementBlocked();
    expect(store.isEmpty()).toBe(true);
  });
});

describe('snapshot() isolation', () => {
  test('mutating a snapshot does not affect subsequent snapshots', () => {
    const store = createProfileStore();
    store.write({ health_flags: ['possible_diabetes'] });
    const snap1 = store.snapshot();
    snap1.attributes.health_flags.push('mutated');
    const snap2 = store.snapshot();
    expect(snap2.attributes.health_flags).not.toContain('mutated');
  });

  test('snapshot reflects state at time of call', () => {
    const store = createProfileStore();
    store.write({ a: 1 });
    const snap1 = store.snapshot();
    store.write({ b: 2 });
    const snap2 = store.snapshot();
    expect(snap1.attributes.b).toBeUndefined();
    expect(snap2.attributes.b).toBe(2);
  });
});

describe('store isolation across instances', () => {
  test('two stores are independent', () => {
    const storeA = createProfileStore();
    const storeB = createProfileStore();
    storeA.write({ x: 1 });
    expect(storeB.isEmpty()).toBe(true);
  });

  test('blocked_count is independent between stores', () => {
    const storeA = createProfileStore();
    const storeB = createProfileStore();
    storeA.incrementBlocked();
    storeA.incrementBlocked();
    expect(storeB.snapshot().blocked_count).toBe(0);
  });
});
