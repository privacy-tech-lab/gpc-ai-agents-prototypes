'use strict';

/**
 * orchestrator.js
 *
 * One scripted ComposeMate session, run through the three Category B
 * checkpoints in pipeline order:
 *
 *  1. B1: the submission arrives at the platform boundary.
 *  2. B2: composition telemetry is observed, one event at a time.
 *  3. The task itself completes (the polished email), in every mode.
 *  4. B3: the classifier derives attributes from the B1 and B2 material and
 *     the gate decides whether they reach the profile.
 *
 * run({ gpc, scope }) resolves the active opt-outs once and threads them
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

  // B1: the submission hits the platform boundary.
  stages.push(gate.collectInput(session, stores, optouts));

  // B2: telemetry observed while the user composed the draft.
  for (const event of session.telemetry) {
    stages.push(gate.collectBehavior(event, stores, optouts));
  }

  // The task always completes; Category B never gates the answer.
  const classified = await classifier.classify(session.draft_id);
  const taskOutput = classified.polished_email;

  // B3: inference over the collected material.
  stages.push(gate.deriveProfile(session.draft_id, classified, stores, optouts));

  return {
    optouts: [...optouts].sort(),
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
