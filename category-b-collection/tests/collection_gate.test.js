/**
 * Unit tests for collection_gate.js, the Category B enforcement seam.
 *
 * Covers:
 *  - resolveOptouts: bare GPC asserts all three subtypes; a scope list
 *    asserts exactly that subset; invalid names are dropped
 *  - B1: submissions are stored by default and discarded under the opt-out
 *  - B2: telemetry is recorded by default and suppressed under the opt-out
 *  - B3: inference is written by default and blocked by the firewall,
 *    recording what would have been written and its sources
 *  - Subtype independence: asserting one leaves the other two collecting
 */

const gate = require('../collection_gate');
const fixture = require('../session_fixture');
const classifier = require('../inference_classifier');
const { createStores } = require('../stores');

let stores;
let session;
let classified;

beforeEach(() => {
  stores = createStores();
  session = fixture.getSession();
  classified = classifier.classify(session.draft_id);
});

describe('resolveOptouts', () => {
  test('no signal means no opt-outs', () => {
    expect(gate.resolveOptouts({})).toEqual(new Set());
  });

  test('bare GPC asserts the whole category', () => {
    expect(gate.resolveOptouts({ gpc: true })).toEqual(new Set(['b1', 'b2', 'b3']));
  });

  test('a scope list asserts exactly that subset', () => {
    expect(gate.resolveOptouts({ scope: ['b2', 'b3'] })).toEqual(new Set(['b2', 'b3']));
  });

  test('scope narrows GPC when both are present', () => {
    expect(gate.resolveOptouts({ gpc: true, scope: ['b3'] })).toEqual(new Set(['b3']));
  });

  test('invalid subtype names are dropped', () => {
    expect(gate.resolveOptouts({ scope: ['b3', 'b9', 'x'] })).toEqual(new Set(['b3']));
  });
});

describe('B1: input collection', () => {
  test('submission is stored when B1 is not asserted', () => {
    const result = gate.collectInput(session, stores, new Set());
    expect(result.status).toBe('stored');
    expect(stores.inputLog.snapshot().entry_count).toBe(1);
    expect(stores.inputLog.snapshot().entries[0].draft_text).toBe(session.draft_text);
  });

  test('submission is discarded when B1 is asserted', () => {
    const result = gate.collectInput(session, stores, new Set(['b1']));
    expect(result.status).toBe('discarded');
    expect(result.reason).toBe('b1_input_optout');
    expect(stores.inputLog.isEmpty()).toBe(true);
    expect(stores.inputLog.snapshot().blocked_count).toBe(1);
  });

  test('the discarded record shows what would have been stored', () => {
    const result = gate.collectInput(session, stores, new Set(['b1']));
    expect(result.would_have_stored.draft_text).toBe(session.draft_text);
    expect(result.would_have_stored.instruction).toBe(session.instruction);
  });
});

describe('B2: behavioral collection', () => {
  test('telemetry is recorded when B2 is not asserted', () => {
    const result = gate.collectBehavior(session.telemetry[0], stores, new Set());
    expect(result.status).toBe('recorded');
    expect(stores.behaviorLog.snapshot().entry_count).toBe(1);
  });

  test('telemetry is suppressed when B2 is asserted', () => {
    const result = gate.collectBehavior(session.telemetry[0], stores, new Set(['b2']));
    expect(result.status).toBe('suppressed');
    expect(result.reason).toBe('b2_behavioral_optout');
    expect(stores.behaviorLog.isEmpty()).toBe(true);
    expect(stores.behaviorLog.snapshot().blocked_count).toBe(1);
  });

  test('the suppressed record shows what would have been recorded', () => {
    const result = gate.collectBehavior(session.telemetry[0], stores, new Set(['b2']));
    expect(result.would_have_recorded.event).toBe('sentence_deleted');
  });
});

describe('B3: derived collection', () => {
  test('attributes are written when B3 is not asserted', () => {
    const result = gate.deriveProfile(session.draft_id, classified, stores, new Set());
    expect(result.status).toBe('derived');
    const snap = stores.derivedProfile.snapshot();
    expect(snap.attribute_count).toBe(4);
    expect(snap.attributes.health_flags).toContain('ongoing_medical_treatment');
  });

  test('the firewall blocks the write when B3 is asserted', () => {
    const result = gate.deriveProfile(session.draft_id, classified, stores, new Set(['b3']));
    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('b3_inference_firewall');
    expect(stores.derivedProfile.isEmpty()).toBe(true);
    expect(stores.derivedProfile.snapshot().blocked_count).toBe(1);
  });

  test('the blocked record shows what would have been written and its sources', () => {
    const result = gate.deriveProfile(session.draft_id, classified, stores, new Set(['b3']));
    expect(result.would_have_written.undisclosed_health_severity).toBe(true);
    expect(result.attribute_sources.undisclosed_health_severity).toBe('behavior');
    expect(result.attribute_sources.health_flags).toBe('input');
  });
});

describe('subtype independence', () => {
  test('asserting B1 alone leaves B2 and B3 collecting', () => {
    const optouts = new Set(['b1']);
    gate.collectInput(session, stores, optouts);
    gate.collectBehavior(session.telemetry[0], stores, optouts);
    gate.deriveProfile(session.draft_id, classified, stores, optouts);
    expect(stores.inputLog.isEmpty()).toBe(true);
    expect(stores.behaviorLog.isEmpty()).toBe(false);
    expect(stores.derivedProfile.isEmpty()).toBe(false);
  });

  test('asserting B3 alone leaves B1 and B2 collecting', () => {
    const optouts = new Set(['b3']);
    gate.collectInput(session, stores, optouts);
    gate.collectBehavior(session.telemetry[0], stores, optouts);
    gate.deriveProfile(session.draft_id, classified, stores, optouts);
    expect(stores.inputLog.isEmpty()).toBe(false);
    expect(stores.behaviorLog.isEmpty()).toBe(false);
    expect(stores.derivedProfile.isEmpty()).toBe(true);
  });

  test('asserting B1 and B2 does not block B3 derivation from transient task data', () => {
    const optouts = new Set(['b1', 'b2']);
    gate.collectInput(session, stores, optouts);
    gate.collectBehavior(session.telemetry[0], stores, optouts);
    const result = gate.deriveProfile(session.draft_id, classified, stores, optouts);
    expect(result.status).toBe('derived');
    expect(stores.derivedProfile.isEmpty()).toBe(false);
  });
});
