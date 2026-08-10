/**
 * Unit tests for use_gate.js, the Category C enforcement seam.
 *
 * Covers:
 *  - resolveOptouts: GPC asserts all six subtypes; scope lists assert exact
 *    subsets; c1 implies c1a and c2 implies c2a, but not the reverse
 *  - checkUse: the primary task is never gated; each subtype writes to its
 *    store when permitted and is blocked with a reason when asserted
 *  - transferAlongChain: full payload without C4; with C4 a necessary hop is
 *    minimized to its required fields and an unnecessary hop is refused
 */

const gate = require('../use_gate');
const { createOutputs } = require('../stores');

let outputs;

beforeEach(() => {
  outputs = createOutputs();
});

describe('resolveOptouts', () => {
  test('no signal means no opt-outs', () => {
    expect(gate.resolveOptouts({})).toEqual(new Set());
  });

  test('bare GPC asserts all six subtypes', () => {
    expect(gate.resolveOptouts({ gpc: true })).toEqual(
      new Set(['c1', 'c1a', 'c2', 'c2a', 'c3', 'c4'])
    );
  });

  test('c1 implies c1a', () => {
    expect(gate.resolveOptouts({ scope: ['c1'] })).toEqual(new Set(['c1', 'c1a']));
  });

  test('c2 implies c2a', () => {
    expect(gate.resolveOptouts({ scope: ['c2'] })).toEqual(new Set(['c2', 'c2a']));
  });

  test('c1a alone does not imply c1', () => {
    expect(gate.resolveOptouts({ scope: ['c1a'] })).toEqual(new Set(['c1a']));
  });

  test('c2a alone does not imply c2', () => {
    expect(gate.resolveOptouts({ scope: ['c2a'] })).toEqual(new Set(['c2a']));
  });

  test('invalid names are dropped', () => {
    expect(gate.resolveOptouts({ scope: ['c3', 'c9'] })).toEqual(new Set(['c3']));
  });

  test('scope narrows GPC when both are present', () => {
    expect(gate.resolveOptouts({ gpc: true, scope: ['c4'] })).toEqual(new Set(['c4']));
  });
});

describe('checkUse', () => {
  const primary = { use: 'primary_answer', subtype: null, store: null };
  const training = { use: 'training_append', subtype: 'c3', store: 'training_set' };

  test('the primary task is allowed even under full GPC', () => {
    const result = gate.checkUse(primary, {}, outputs, gate.resolveOptouts({ gpc: true }));
    expect(result.status).toBe('allowed');
    expect(result.in_task_scope).toBe(true);
  });

  test('a permitted use writes to its store', () => {
    const result = gate.checkUse(training, { prompt: 'q' }, outputs, new Set());
    expect(result.status).toBe('allowed');
    expect(outputs.training_set.snapshot().entry_count).toBe(1);
  });

  test('an asserted subtype blocks the write with a reason', () => {
    const result = gate.checkUse(training, { prompt: 'q' }, outputs, new Set(['c3']));
    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('c3_repurposing_restriction');
    expect(result.would_have_written).toEqual({ prompt: 'q' });
    expect(outputs.training_set.isEmpty()).toBe(true);
    expect(outputs.training_set.snapshot().blocked_count).toBe(1);
  });

  test('each gated subtype maps to its own reason', () => {
    const cases = [
      ['insurance_risk_assessment', 'c1', 'insurance_assessments', 'c1_primary_use_restriction'],
      ['personalization_update', 'c1a', 'personalization_profile', 'c1a_personalization_restriction'],
      ['analytics_aggregation', 'c2', 'analytics_log', 'c2_secondary_use_restriction'],
      ['ad_targeting', 'c2a', 'ad_queue', 'c2a_targeting_restriction'],
    ];
    for (const [use, subtype, store, reason] of cases) {
      const result = gate.checkUse({ use, subtype, store }, {}, outputs, new Set([subtype]));
      expect(result.status).toBe('blocked');
      expect(result.reason).toBe(reason);
    }
  });
});

describe('transferAlongChain', () => {
  const necessary = { hop: 'pharmacy_price_agent', required_fields: ['medication'], necessary: true };
  const unnecessary = { hop: 'wellness_marketing_vendor', required_fields: [], necessary: false };
  const payload = {
    medication: 'lisinopril 10mg',
    reading: { systolic: 158, diastolic: 96 },
    health_context: { condition_hint: 'possible_hypertension' },
  };

  test('without C4, every hop receives the full payload', () => {
    const r1 = gate.transferAlongChain(necessary, payload, outputs, new Set());
    const r2 = gate.transferAlongChain(unnecessary, payload, outputs, new Set());
    expect(r1.status).toBe('transferred_full');
    expect(r2.status).toBe('transferred_full');
    expect(r2.fields_sent).toEqual(['medication', 'reading', 'health_context']);
    expect(outputs.chain_transfers.snapshot().entry_count).toBe(2);
  });

  test('with C4, a necessary hop is minimized to its required fields', () => {
    const result = gate.transferAlongChain(necessary, payload, outputs, new Set(['c4']));
    expect(result.status).toBe('transferred_minimized');
    expect(result.fields_sent).toEqual(['medication']);
    const entry = outputs.chain_transfers.snapshot().entries[0];
    expect(entry.minimized).toBe(true);
    expect(Object.keys(entry.payload)).toEqual(['medication']);
  });

  test('with C4, an unnecessary hop is refused outright', () => {
    const result = gate.transferAlongChain(unnecessary, payload, outputs, new Set(['c4']));
    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('c4_sharing_restriction');
    expect(result.would_have_received.health_context).toBeDefined();
    expect(outputs.chain_transfers.isEmpty()).toBe(true);
    expect(outputs.chain_transfers.snapshot().blocked_count).toBe(1);
  });
});
