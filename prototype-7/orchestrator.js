'use strict';

/**
 * orchestrator.js
 *
 * The scripted two-session run, walking every Category D checkpoint in
 * time order:
 *
 *  1. Session 1: the user discloses facts, and Aria answers turn 2 using
 *     turn 1 context from the SAME session. Never gated; identical in every
 *     mode.
 *  2. Session 1 ends: the D1 boundary (archive or discard).
 *  3. Session 2 starts: the D2 boundary (recall the archive or start
 *     fresh). The recall outcome decides whether the restaurant answer is
 *     tailored or generic.
 *  4. Session 2 ends: the D1 boundary again.
 *  5. Profile synthesis: the D3 boundary.
 */

const gate = require('./persistence_gate');
const fixture = require('./session_fixture');
const { createMemory } = require('./memory_store');

async function run({ gpc = false, scope = [] } = {}) {
  const optouts = gate.resolveScope({ gpc, scope });
  const memory = createMemory();
  const [s1, s2] = fixture.getSessions();
  const checkpoints = [];

  // Session 1, turn 1: facts land in the transient session context.
  memory.setContext('facts', s1.facts_disclosed);

  // Session 1, turn 2: Aria uses same-session context. Never gated.
  const contextAvailable = Object.keys(memory.getContext()).length > 0;
  const session1Turn2Answer = s1.turns[1].assistant;
  checkpoints.push({
    checkpoint: 'in_session_context',
    subtype: null,
    status: 'allowed',
    context_available: contextAvailable,
    note: 'Same-session coherence is permitted in every mode, including D1.',
  });

  // Session 1 ends: D1.
  checkpoints.push(gate.endSession(s1, memory, optouts));

  // Session 2 starts: D2.
  const recall = gate.recallForSession(memory, optouts);
  checkpoints.push(recall);
  const session2Answer =
    recall.status === 'recalled' ? s2.tailored_answer : s2.generic_answer;

  // Session 2 ends: D1.
  memory.setContext('facts', s2.facts_disclosed);
  checkpoints.push(gate.endSession(s2, memory, optouts));

  // Profile synthesis: D3.
  checkpoints.push(gate.synthesizeProfile(fixture.getProfileSynthesis(), memory, optouts));

  return {
    optouts: [...optouts].sort(),
    session1_turn2_answer: session1Turn2Answer,
    session2_answer: session2Answer,
    checkpoints,
    memory_snapshot: {
      archive: memory.archive.snapshot(),
      profile: memory.profile.snapshot(),
    },
  };
}

module.exports = { run };
