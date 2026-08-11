/**
 * Unit tests for stores.js: the log stores (B1, B2) and the profile store (B3).
 */

const { createStores, createLogStore, createProfileStore } = require('../stores');

describe('log store', () => {
  test('starts empty with zero blocked count', () => {
    const log = createLogStore();
    expect(log.isEmpty()).toBe(true);
    expect(log.snapshot()).toEqual({ entries: [], entry_count: 0, blocked_count: 0 });
  });

  test('stores entries and counts them', () => {
    const log = createLogStore();
    log.store({ a: 1 });
    log.store({ b: 2 });
    const snap = log.snapshot();
    expect(snap.entry_count).toBe(2);
    expect(snap.entries).toEqual([{ a: 1 }, { b: 2 }]);
    expect(log.isEmpty()).toBe(false);
  });

  test('stores deep copies, not references', () => {
    const log = createLogStore();
    const entry = { nested: { x: 1 } };
    log.store(entry);
    entry.nested.x = 99;
    expect(log.snapshot().entries[0].nested.x).toBe(1);
  });

  test('incrementBlocked counts suppressed writes without storing', () => {
    const log = createLogStore();
    log.incrementBlocked();
    log.incrementBlocked();
    const snap = log.snapshot();
    expect(snap.blocked_count).toBe(2);
    expect(snap.entry_count).toBe(0);
  });
});

describe('profile store', () => {
  test('starts empty', () => {
    const profile = createProfileStore();
    expect(profile.isEmpty()).toBe(true);
    expect(profile.snapshot().attribute_count).toBe(0);
  });

  test('writes scalar attributes', () => {
    const profile = createProfileStore();
    profile.write({ financial_pressure: true });
    expect(profile.snapshot().attributes.financial_pressure).toBe(true);
  });

  test('merges array attributes without duplicates', () => {
    const profile = createProfileStore();
    profile.write({ health_flags: ['a', 'b'] });
    profile.write({ health_flags: ['b', 'c'] });
    expect(profile.snapshot().attributes.health_flags).toEqual(['a', 'b', 'c']);
  });

  test('overwrites scalars on later writes', () => {
    const profile = createProfileStore();
    profile.write({ mood: 'calm' });
    profile.write({ mood: 'anxious' });
    expect(profile.snapshot().attributes.mood).toBe('anxious');
  });

  test('incrementBlocked counts without writing', () => {
    const profile = createProfileStore();
    profile.incrementBlocked();
    const snap = profile.snapshot();
    expect(snap.blocked_count).toBe(1);
    expect(snap.attribute_count).toBe(0);
  });
});

describe('createStores', () => {
  test('returns three independent stores', () => {
    const stores = createStores();
    stores.inputLog.store({ x: 1 });
    expect(stores.behaviorLog.isEmpty()).toBe(true);
    expect(stores.derivedProfile.isEmpty()).toBe(true);
    expect(stores.inputLog.isEmpty()).toBe(false);
  });
});
