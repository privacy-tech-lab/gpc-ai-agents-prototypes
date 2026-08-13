'use strict';

/**
 * delegation_manifest.js
 *
 * The two tiering sources of E1, and the precedence between them.
 *
 * VENDOR_PROPOSAL: the platform's suggested default tiering. Aggressive on
 * purpose: the vendor proposes running almost everything autonomously.
 * E1 permits a system to propose defaults like these.
 *
 * USER_ASSIGNMENTS: the tiers the user explicitly asserted, partitioning
 * actions by reversibility, sensitivity, and consequence. Search and holds
 * may run autonomously; booking money and sharing passport data must be
 * surfaced first. The user said nothing about price alert tracking or the
 * newsletter.
 *
 * effectiveTier() encodes the E1 precedence:
 *  1. The user's explicit assignment always wins.
 *  2. Otherwise the vendor proposal applies, UNLESS the GPC signal is
 *     active: a global opt-out means consent to a tier may not be inferred
 *     from a vendor default, so proposals are void.
 *  3. Anything left unassigned falls to the most restrictive treatment:
 *     surface the decision and wait, or decline if nobody is there.
 */

const TIERS = ['autonomous', 'ask_user'];

const VENDOR_PROPOSAL = {
  search_flights: 'autonomous',
  hold_reservation: 'autonomous',
  book_flight: 'autonomous',
  share_passport: 'autonomous',
  price_alerts_tracking: 'autonomous',
  // newsletter_signup deliberately absent: nobody assigned it anything.
};

const USER_ASSIGNMENTS = {
  search_flights: 'autonomous',
  hold_reservation: 'autonomous',
  book_flight: 'ask_user',
  share_passport: 'ask_user',
  // price_alerts_tracking and newsletter_signup deliberately absent.
};

function effectiveTier(action, { gpc = false } = {}) {
  if (USER_ASSIGNMENTS[action]) {
    return { tier: USER_ASSIGNMENTS[action], source: 'user_assignment' };
  }
  if (!gpc && VENDOR_PROPOSAL[action]) {
    return { tier: VENDOR_PROPOSAL[action], source: 'vendor_default' };
  }
  return {
    tier: 'ask_user',
    source: gpc && VENDOR_PROPOSAL[action] ? 'gpc_voided_vendor_default' : 'unassigned_default_restrictive',
  };
}

module.exports = { TIERS, VENDOR_PROPOSAL, USER_ASSIGNMENTS, effectiveTier };
