'use strict';

/**
 * inference_firewall.js
 *
 * Implements the GPC B3 control: "derived-collection opt-out."
 *
 * When the B3 signal is active, the firewall intercepts every call that would
 * have written inferred attributes to the profile store.  Instead of writing
 * the attributes it:
 *   1. Records what *would have been* written (for transparency / audit output)
 *   2. Increments the store's blocked_count
 *   3. Returns a 'blocked' result — the profile stays empty
 *
 * When B3 is off, block() is never called; derive() runs directly.
 *
 * This mirrors Prototype 3's withConsentCheck() pattern:
 *   - no LLM involved — the firewall is pure logic
 *   - deterministic and fully testable
 *   - the user's answer (canned) is still returned regardless of firewall state
 *
 * block(query, classifiedAttrs, store)
 *
 *   Intercepts an inference attempt and records it without writing to the store.
 *
 * Returns:
 *   {
 *     status:              'blocked',
 *     reason:              'b3_inference_firewall',
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
    reason: 'b3_inference_firewall',
    query,
    would_have_written: JSON.parse(JSON.stringify(inferred_attributes)),
  };
  curtain.call('inference', `"${query}"`, undefined);
  curtain.verdict(outcome, 'firewall at the classify-to-store boundary');
  return outcome;
}

module.exports = { block };
