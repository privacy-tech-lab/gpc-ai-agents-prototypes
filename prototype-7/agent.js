'use strict';

/**
 * agent.js
 *
 * The LLM-driven version of the Category D prototype. A real model plays
 * Aria in session 2: session 1 has already ended (through the D1 gate), and
 * the model may call recall_memory to ask for cross-session context.
 *
 * The gate is not in the prompt. recall_memory is routed through
 * recallForSession(), so what the model can remember is decided by the
 * persistence gate, not by the model. With D2 asserted the tool returns no
 * facts and the model has to treat the user as new. After the session, the
 * platform runs the D1 boundary for session 2 and the D3 synthesis attempt.
 *
 * The deterministic orchestrator.js / run_baseline.js / run_optout.js remain
 * the testable core; this module is the live-agent demo path (requires
 * Ollama).
 */

const { runAgentLoop } = require('./agent_loop');
const gate = require('./persistence_gate');
const fixture = require('./session_fixture');
const { createMemory } = require('./memory_store');

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'recall_memory',
      description: 'Recall what is known about this user from previous sessions.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];

const SYSTEM_PROMPT = `You are Aria, a personal assistant. The user is asking \
for a restaurant suggestion. First call recall_memory to see what you know \
about them from previous sessions. If you get dietary or budget facts, tailor \
your suggestion to them and say why. If you get nothing, do not guess: ask \
what kind of food and price range they want. Keep it to a few sentences.`;

function makeExecutor(memory, optouts, checkpoints) {
  return async name => {
    if (name !== 'recall_memory') return { error: 'unknown_tool', name };
    const recall = gate.recallForSession(memory, optouts);
    checkpoints.push(recall);
    // The model sees only what the gate released, never the archive itself.
    return { known_facts: recall.recalled_facts };
  };
}

/**
 * runSession: session 1 ends through the D1 gate first, then the model runs
 * session 2 live, then the platform closes session 2 and attempts synthesis.
 */
async function runSession({ gpc = false, scope = [] } = {}) {
  const optouts = gate.resolveScope({ gpc, scope });
  const memory = createMemory();
  const [s1, s2] = fixture.getSessions();
  const checkpoints = [];

  // Session 1 already happened; close it through the D1 boundary.
  memory.setContext('facts', s1.facts_disclosed);
  checkpoints.push(gate.endSession(s1, memory, optouts));

  const agentResult = await runAgentLoop({
    systemPrompt: SYSTEM_PROMPT,
    userMessage: s2.turns[0].user,
    toolDefinitions: TOOL_DEFINITIONS,
    requiredTools: ['recall_memory'],
    executeToolFn: makeExecutor(memory, optouts, checkpoints),
  });

  // Session 2 ends: D1. Then the D3 synthesis attempt.
  memory.setContext('facts', s2.facts_disclosed);
  checkpoints.push(gate.endSession(s2, memory, optouts));
  checkpoints.push(gate.synthesizeProfile(fixture.getProfileSynthesis(), memory, optouts));

  return {
    agentResult,
    checkpoints,
    optouts: [...optouts].sort(),
    memory_snapshot: {
      archive: memory.archive.snapshot(),
      profile: memory.profile.snapshot(),
    },
  };
}

module.exports = { TOOL_DEFINITIONS, SYSTEM_PROMPT, makeExecutor, runSession };
