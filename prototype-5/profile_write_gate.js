'use strict';

/**
 * profile_write_gate.js
 *
 * Implements the GPC privacy preference against derived collection.
 *
 * When the GPC signal is active, the gate intercepts every call that would
 * have written inferred attributes to the profile store.  Instead of writing
 * the attributes it:
 *   1. Records what *would have been* written (for transparency / audit output)
 *   2. Increments the store's blocked_count
 *   3. Returns a 'blocked' result — the profile stays empty
 *
 * When the gate is off, block() is never called; derive() runs directly.
 *
 * This mirrors Prototype 3's withConsentCheck() pattern:
 *   - no LLM involved — the gate is pure logic
 *   - deterministic and fully testable
 *   - the user's answer (canned) is still returned regardless of gate state
 *
 * block(query, classifiedAttrs, store)
 *
 *   Intercepts an inference attempt and records it without writing to the store.
 *
 * Returns:
 *   {
 *     status:              'blocked',
 *     reason:              'profile_write_gate',
 *     query:               string,
 *     would_have_written:  object   // the attributes that were suppressed
 *   }
 */

const curtain = require('../core/curtain.js');

function block(query, classifiedAttrs, store) {
  const { inferred_attributes } = classifiedAttrs;
  store.incrementBlocked();
  const outcome = {
    status: 'blocked',
    reason: 'profile_write_gate',
    query,
    would_have_written: JSON.parse(JSON.stringify(inferred_attributes)),
  };
  curtain.call('inference', `"${query}"`, undefined);
  curtain.verdict(outcome, 'gate at the classify-to-store boundary');
  return outcome;
}

module.exports = { block };
