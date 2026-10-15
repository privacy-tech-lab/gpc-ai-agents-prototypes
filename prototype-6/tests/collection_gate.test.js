/**
 * Unit tests for collection_gate.js, the collection enforcement seam.
 *
 * Covers:
 *  - resolveOptouts: bare GPC asserts all three scopes; a scope list
 *    asserts exactly that subset; invalid names are dropped
 *  - Input: submissions are stored by default and discarded under the opt-out
 *  - Behavior: telemetry is recorded by default and suppressed under the opt-out
 *  - Derived: inference is written by default and blocked by the firewall,
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

  test('bare GPC asserts all three scopes', () => {
    expect(gate.resolveOptouts({ gpc: true })).toEqual(new Set(['input', 'behavior', 'derived']));
  });

  test('a scope list asserts exactly that subset', () => {
    expect(gate.resolveOptouts({ scope: ['behavior', 'derived'] })).toEqual(new Set(['behavior', 'derived']));
  });

  test('scope narrows GPC when both are present', () => {
    expect(gate.resolveOptouts({ gpc: true, scope: ['derived'] })).toEqual(new Set(['derived']));
  });

  test('invalid scope names are dropped', () => {
    expect(gate.resolveOptouts({ scope: ['derived', 'bogus', 'x'] })).toEqual(new Set(['derived']));
  });
});

describe('input collection', () => {
  test('submission is stored when the input opt-out is not asserted', () => {
    const result = gate.collectInput(session, stores, new Set());
    expect(result.status).toBe('stored');
    expect(stores.inputLog.snapshot().entry_count).toBe(1);
    expect(stores.inputLog.snapshot().entries[0].draft_text).toBe(session.draft_text);
  });

  test('submission is discarded when the input opt-out is asserted', () => {
    const result = gate.collectInput(session, stores, new Set(['input']));
    expect(result.status).toBe('discarded');
    expect(result.reason).toBe('input_optout');
    expect(stores.inputLog.isEmpty()).toBe(true);
    expect(stores.inputLog.snapshot().blocked_count).toBe(1);
  });

  test('the discarded record shows what would have been stored', () => {
    const result = gate.collectInput(session, stores, new Set(['input']));
    expect(result.would_have_stored.draft_text).toBe(session.draft_text);
    expect(result.would_have_stored.instruction).toBe(session.instruction);
  });
});

describe('behavioral collection', () => {
  test('telemetry is recorded when the behavior opt-out is not asserted', () => {
    const result = gate.collectBehavior(session.telemetry[0], stores, new Set());
    expect(result.status).toBe('recorded');
    expect(stores.behaviorLog.snapshot().entry_count).toBe(1);
  });

  test('telemetry is suppressed when the behavior opt-out is asserted', () => {
    const result = gate.collectBehavior(session.telemetry[0], stores, new Set(['behavior']));
    expect(result.status).toBe('suppressed');
    expect(result.reason).toBe('behavioral_optout');
    expect(stores.behaviorLog.isEmpty()).toBe(true);
    expect(stores.behaviorLog.snapshot().blocked_count).toBe(1);
  });

  test('the suppressed record shows what would have been recorded', () => {
    const result = gate.collectBehavior(session.telemetry[0], stores, new Set(['behavior']));
    expect(result.would_have_recorded.event).toBe('sentence_deleted');
  });
});

describe('derived collection', () => {
  test('attributes are written when the derived opt-out is not asserted', () => {
    const result = gate.deriveProfile(session.draft_id, classified, stores, new Set());
    expect(result.status).toBe('derived');
    const snap = stores.derivedProfile.snapshot();
    expect(snap.attribute_count).toBe(4);
    expect(snap.attributes.health_flags).toContain('ongoing_medical_treatment');
  });

  test('the firewall blocks the write when the derived opt-out is asserted', () => {
    const result = gate.deriveProfile(session.draft_id, classified, stores, new Set(['derived']));
    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('inference_firewall');
    expect(stores.derivedProfile.isEmpty()).toBe(true);
    expect(stores.derivedProfile.snapshot().blocked_count).toBe(1);
  });

  test('the blocked record shows what would have been written and its sources', () => {
    const result = gate.deriveProfile(session.draft_id, classified, stores, new Set(['derived']));
    expect(result.would_have_written.undisclosed_health_severity).toBe(true);
    expect(result.attribute_sources.undisclosed_health_severity).toBe('behavior');
    expect(result.attribute_sources.health_flags).toBe('input');
  });
});

describe('scope independence', () => {
  test('asserting input alone leaves behavior and derived collecting', () => {
    const optouts = new Set(['input']);
    gate.collectInput(session, stores, optouts);
    gate.collectBehavior(session.telemetry[0], stores, optouts);
    gate.deriveProfile(session.draft_id, classified, stores, optouts);
    expect(stores.inputLog.isEmpty()).toBe(true);
    expect(stores.behaviorLog.isEmpty()).toBe(false);
    expect(stores.derivedProfile.isEmpty()).toBe(false);
  });

  test('asserting derived alone leaves input and behavior collecting', () => {
    const optouts = new Set(['derived']);
    gate.collectInput(session, stores, optouts);
    gate.collectBehavior(session.telemetry[0], stores, optouts);
    gate.deriveProfile(session.draft_id, classified, stores, optouts);
    expect(stores.inputLog.isEmpty()).toBe(false);
    expect(stores.behaviorLog.isEmpty()).toBe(false);
    expect(stores.derivedProfile.isEmpty()).toBe(true);
  });

  test('asserting input and behavior does not block inference from transient task data', () => {
    const optouts = new Set(['input', 'behavior']);
    gate.collectInput(session, stores, optouts);
    gate.collectBehavior(session.telemetry[0], stores, optouts);
    const result = gate.deriveProfile(session.draft_id, classified, stores, optouts);
    expect(result.status).toBe('derived');
    expect(stores.derivedProfile.isEmpty()).toBe(false);
  });
});
