/**
 * Unit tests for inference_firewall.js and inference_engine.js
 *
 * Covers the firewall (B3 on):
 *  - block() returns status=blocked with reason=b3_inference_firewall
 *  - block() records what would have been written
 *  - block() does NOT write any attributes to the store
 *  - block() increments the store's blocked_count
 *  - block() includes the query in the result
 *
 * Covers the engine (B3 off):
 *  - derive() returns status=derived
 *  - derive() writes attributes to the store
 *  - derive() returns the attributes that were written
 *  - derive() does NOT increment blocked_count
 */

const firewall = require('../inference_firewall');
const engine   = require('../inference_engine');
const { createProfileStore } = require('../profile_store');
const classifier = require('../query_classifier');

// Reusable fixtures
const METFORMIN_QUERY = 'What are the side effects of metformin?';
const SNAP_QUERY      = 'How do I apply for SNAP benefits?';

function classified(query) {
  return classifier.classify(query);
}

// ─── Firewall (B3 on) ────────────────────────────────────────────────────────

describe('inference_firewall.block() — status and reason', () => {
  test('returns status=blocked', () => {
    const store = createProfileStore();
    const result = firewall.block(METFORMIN_QUERY, classified(METFORMIN_QUERY), store);
    expect(result.status).toBe('blocked');
  });

  test('returns reason=b3_inference_firewall', () => {
    const store = createProfileStore();
    const result = firewall.block(METFORMIN_QUERY, classified(METFORMIN_QUERY), store);
    expect(result.reason).toBe('b3_inference_firewall');
  });

  test('includes the query string in the result', () => {
    const store = createProfileStore();
    const result = firewall.block(METFORMIN_QUERY, classified(METFORMIN_QUERY), store);
    expect(result.query).toBe(METFORMIN_QUERY);
  });
});

describe('inference_firewall.block() — would_have_written', () => {
  test('includes would_have_written field', () => {
    const store = createProfileStore();
    const result = firewall.block(METFORMIN_QUERY, classified(METFORMIN_QUERY), store);
    expect(result.would_have_written).toBeDefined();
  });

  test('would_have_written contains health_flags for metformin query', () => {
    const store = createProfileStore();
    const result = firewall.block(METFORMIN_QUERY, classified(METFORMIN_QUERY), store);
    expect(result.would_have_written.health_flags).toContain('possible_diabetes');
  });

  test('would_have_written contains income_bracket for SNAP query', () => {
    const store = createProfileStore();
    const result = firewall.block(SNAP_QUERY, classified(SNAP_QUERY), store);
    expect(result.would_have_written.income_bracket).toBe('low');
  });
});

describe('inference_firewall.block() — profile store isolation', () => {
  test('does not write any attributes to the store', () => {
    const store = createProfileStore();
    firewall.block(METFORMIN_QUERY, classified(METFORMIN_QUERY), store);
    expect(store.isEmpty()).toBe(true);
  });

  test('store remains empty after multiple block() calls', () => {
    const store = createProfileStore();
    for (const q of classifier.allQueries()) {
      firewall.block(q, classified(q), store);
    }
    expect(store.isEmpty()).toBe(true);
  });

  test('increments blocked_count by 1 per call', () => {
    const store = createProfileStore();
    firewall.block(METFORMIN_QUERY, classified(METFORMIN_QUERY), store);
    expect(store.snapshot().blocked_count).toBe(1);
  });

  test('blocked_count equals number of block() calls', () => {
    const store = createProfileStore();
    for (const q of classifier.allQueries()) {
      firewall.block(q, classified(q), store);
    }
    expect(store.snapshot().blocked_count).toBe(8);
  });
});

describe('inference_firewall.block() — deep copy isolation', () => {
  test('mutating would_have_written does not affect classifier output', () => {
    const store = createProfileStore();
    const result = firewall.block(METFORMIN_QUERY, classified(METFORMIN_QUERY), store);
    result.would_have_written.health_flags.push('mutation');
    // Classify again — should be clean
    const again = classifier.classify(METFORMIN_QUERY);
    expect(again.inferred_attributes.health_flags).not.toContain('mutation');
  });
});

// ─── Engine (B3 off) ─────────────────────────────────────────────────────────

describe('inference_engine.derive() — status and return value', () => {
  test('returns status=derived', () => {
    const store = createProfileStore();
    const result = engine.derive(METFORMIN_QUERY, classified(METFORMIN_QUERY), store);
    expect(result.status).toBe('derived');
  });

  test('includes the query in the result', () => {
    const store = createProfileStore();
    const result = engine.derive(METFORMIN_QUERY, classified(METFORMIN_QUERY), store);
    expect(result.query).toBe(METFORMIN_QUERY);
  });

  test('returns the attributes that were written', () => {
    const store = createProfileStore();
    const result = engine.derive(METFORMIN_QUERY, classified(METFORMIN_QUERY), store);
    expect(result.attributes.health_flags).toContain('possible_diabetes');
  });
});

describe('inference_engine.derive() — profile store writes', () => {
  test('writes attributes to the store', () => {
    const store = createProfileStore();
    engine.derive(METFORMIN_QUERY, classified(METFORMIN_QUERY), store);
    expect(store.isEmpty()).toBe(false);
  });

  test('store contains health_flags after metformin derive', () => {
    const store = createProfileStore();
    engine.derive(METFORMIN_QUERY, classified(METFORMIN_QUERY), store);
    expect(store.snapshot().attributes.health_flags).toContain('possible_diabetes');
  });

  test('store attribute count grows with each derive call', () => {
    const store = createProfileStore();
    engine.derive('How do I negotiate a lower rent?', classified('How do I negotiate a lower rent?'), store);
    const countAfterFirst = store.attributeCount();
    engine.derive(SNAP_QUERY, classified(SNAP_QUERY), store);
    expect(store.attributeCount()).toBeGreaterThan(countAfterFirst);
  });

  test('does not increment blocked_count', () => {
    const store = createProfileStore();
    engine.derive(METFORMIN_QUERY, classified(METFORMIN_QUERY), store);
    expect(store.snapshot().blocked_count).toBe(0);
  });
});
