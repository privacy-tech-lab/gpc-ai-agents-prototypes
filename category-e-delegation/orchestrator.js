'use strict';

/**
 * orchestrator.js
 *
 * One scripted TripPilot run: all six action types the trip task
 * encounters, each resolved through the delegation gate with the run's
 * context (silent baseline, GPC, user present or away, and how the user
 * answers surfaced decisions).
 */

const gate = require('./delegation_gate');
const fixture = require('./trip_fixture');

async function run({ silent = false, gpc = false, userPresent = true, respond = 'approve' } = {}) {
  const ctx = { mode: silent ? 'silent' : 'enforced', gpc, userPresent, respond };
  const actions = fixture.getActions();

  // Sequential rather than parallel: the actions share one MCP connection
  // and the run reads as a timeline, so order has to stay deterministic.
  const results = [];
  for (const a of actions) {
    results.push(await gate.requestAction(a, ctx));
  }

  const tally = {};
  for (const r of results) {
    tally[r.status] = (tally[r.status] ?? 0) + 1;
  }

  return {
    context: { silent, gpc, user_present: userPresent, respond },
    results,
    tally,
    violations: results.filter(r => r.violations?.length).map(r => r.action),
  };
}

module.exports = { run };
