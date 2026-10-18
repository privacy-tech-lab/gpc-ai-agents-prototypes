'use strict';

/**
 * orchestrator.js
 *
 * One scripted ComposeMate session, run through the three collection
 * checkpoints in pipeline order:
 *
 *  1. Input: the submission arrives at the platform boundary.
 *  2. Behavior: composition telemetry is observed, one event at a time.
 *  3. The task itself completes (the polished email), in every mode.
 *  4. Derived: the classifier derives attributes from the input and behavior material and
 *     the gate decides whether they reach the profile.
 *
 * run({ gpc, scope }) resolves the active preferences once and threads them
 * through every checkpoint.
 */

const gate = require('./collection_gate');
const classifier = require('./mcp_client');
const fixture = require('./session_fixture');
const { createStores } = require('./stores');

async function run({ gpc = false, scope = [] } = {}) {
  const optouts = gate.resolveOptouts({ gpc, scope });
  const stores = createStores();
  const session = fixture.getSession();
  const stages = [];

  // Input: the submission hits the platform boundary.
  stages.push(gate.collectInput(session, stores, optouts));

  // Behavior: telemetry observed while the user composed the draft.
  for (const event of session.telemetry) {
    stages.push(gate.collectBehavior(event, stores, optouts));
  }

  // The task always completes; the collection gate never gates the answer.
  const classified = await classifier.classify(session.draft_id);
  const taskOutput = classified.polished_email;

  // Derived: inference over the collected material.
  stages.push(gate.deriveProfile(session.draft_id, classified, stores, optouts));

  return {
    optouts: gate.VALID_SCOPES.filter(s => optouts.has(s)),
    task_output: taskOutput,
    stages,
    stores_snapshot: {
      input_log: stores.inputLog.snapshot(),
      behavior_log: stores.behaviorLog.snapshot(),
      derived_profile: stores.derivedProfile.snapshot(),
    },
  };
}

module.exports = { run };
