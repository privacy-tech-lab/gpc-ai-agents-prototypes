'use strict';

/**
 * use_gate.js: the Category C enforcement seam.
 *
 * Category C assumes collection happened and governs what the data may be
 * used for. The primary task (answering the health question) is never gated;
 * the boundary between permitted and restricted use is context, following
 * contextual integrity: a patient asking about a reading has not consented
 * to insurance processing, ad targeting, model training, or onward sharing.
 *
 * Subtype checks:
 *  C1  checkUse: any application beyond the task the user invoked, even by
 *      the same platform.
 *  C1a checkUse: tailoring responses or recommendations from inferred
 *      preferences. Sub-subtype of C1: asserting C1 asserts C1a too.
 *  C2  checkUse: analytics unrelated to the task.
 *  C2a checkUse: deciding what content or offers the user is shown.
 *      Sub-subtype of C2: asserting C2 asserts C2a too.
 *  C3  checkUse: appending the exchange to training material.
 *  C4  transferAlongChain: data may not travel further along the sub-agent
 *      chain than the task strictly needs. A necessary hop is minimized to
 *      its declared required fields; an unnecessary hop is refused.
 */

const VALID_SUBTYPES = ['c1', 'c1a', 'c2', 'c2a', 'c3', 'c4'];

const IMPLIES = {
  c1: ['c1a'],
  c2: ['c2a'],
};

const REASONS = {
  c1: 'c1_primary_use_restriction',
  c1a: 'c1a_personalization_restriction',
  c2: 'c2_secondary_use_restriction',
  c2a: 'c2a_targeting_restriction',
  c3: 'c3_repurposing_restriction',
  c4: 'c4_sharing_restriction',
};

/**
 * resolveOptouts({ gpc, scope })
 *
 * Bare GPC asserts the whole category. A scope list asserts that subset.
 * Parent subtypes expand to their sub-subtypes: c1 implies c1a, c2 implies
 * c2a.
 */
function resolveOptouts({ gpc = false, scope = [] } = {}) {
  const cleaned = scope.filter(s => VALID_SUBTYPES.includes(s));
  let active;
  if (cleaned.length > 0) active = new Set(cleaned);
  else if (gpc) active = new Set(VALID_SUBTYPES);
  else active = new Set();

  for (const parent of Object.keys(IMPLIES)) {
    if (active.has(parent)) IMPLIES[parent].forEach(child => active.add(child));
  }
  return active;
}

/**
 * checkUse(request, payload, outputs, optouts)
 *
 * request: { use, subtype, store } where subtype is null for the primary
 * task (never gated) or one of c1, c1a, c2, c2a, c3.
 */
function checkUse(request, payload, outputs, optouts) {
  if (request.subtype === null) {
    return { use: request.use, subtype: null, status: 'allowed', in_task_scope: true };
  }

  const store = outputs[request.store];
  if (optouts.has(request.subtype)) {
    store.incrementBlocked();
    return {
      use: request.use,
      subtype: request.subtype.toUpperCase(),
      status: 'blocked',
      reason: REASONS[request.subtype],
      would_have_written: JSON.parse(JSON.stringify(payload)),
    };
  }

  store.store({ use: request.use, payload });
  return { use: request.use, subtype: request.subtype.toUpperCase(), status: 'allowed' };
}

function pick(obj, fields) {
  const out = {};
  for (const f of fields) {
    if (f in obj) out[f] = JSON.parse(JSON.stringify(obj[f]));
  }
  return out;
}

/**
 * transferAlongChain(hop, sessionPayload, outputs, optouts)
 *
 * hop: { hop, required_fields, necessary }. Without C4, every hop receives
 * the full session payload. With C4 asserted, a necessary hop receives only
 * its declared required fields and an unnecessary hop is refused outright.
 */
function transferAlongChain(hop, sessionPayload, outputs, optouts) {
  const store = outputs.chain_transfers;

  if (optouts.has('c4')) {
    if (!hop.necessary) {
      store.incrementBlocked();
      return {
        hop: hop.hop,
        subtype: 'C4',
        status: 'blocked',
        reason: REASONS.c4,
        would_have_received: JSON.parse(JSON.stringify(sessionPayload)),
      };
    }
    const minimized = pick(sessionPayload, hop.required_fields);
    store.store({ hop: hop.hop, payload: minimized, minimized: true });
    return {
      hop: hop.hop,
      subtype: 'C4',
      status: 'transferred_minimized',
      fields_sent: Object.keys(minimized),
    };
  }

  store.store({ hop: hop.hop, payload: sessionPayload, minimized: false });
  return {
    hop: hop.hop,
    subtype: 'C4',
    status: 'transferred_full',
    fields_sent: Object.keys(sessionPayload),
  };
}

module.exports = { resolveOptouts, checkUse, transferAlongChain, VALID_SUBTYPES, REASONS };
