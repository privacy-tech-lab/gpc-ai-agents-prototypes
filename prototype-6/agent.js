'use strict';

/**
 * agent.js
 *
 * The LLM-driven version of the Category B prototype. A real model plays
 * ComposeMate: it reads the user's draft through a tool and writes the
 * polished email itself.
 *
 * Collection is NOT the model's business, and the gate is not in the prompt.
 * The platform collects around the session:
 *  - B1 when the submission crosses the tool boundary (read_draft),
 *  - B2 from composition telemetry the platform observed,
 *  - B3 by running the classifier after the session.
 * The model only ever sees the instruction and draft text. It never sees the
 * telemetry, the stores, or the inferred attributes, so it cannot route
 * around the gate.
 *
 * The deterministic orchestrator.js / run_baseline.js / run_optout.js remain
 * the testable core; this module is the live-agent demo path (requires
 * Ollama).
 */

const { runAgentLoop } = require('./agent_loop');
const gate = require('./collection_gate');
const classifier = require('./mcp_client');
const fixture = require('./session_fixture');
const { createStores } = require('./stores');

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'read_draft',
      description: "Read the user's draft email and their instruction.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];

const SYSTEM_PROMPT = `You are ComposeMate, an email writing assistant. Call \
read_draft to get the user's draft and instruction, then rewrite the email \
accordingly. Reply with the polished email text only.`;

/**
 * makeExecutor: the tool boundary. When the model reads the draft, the
 * submission has crossed into the platform, so the B1 checkpoint fires here.
 * The model receives only the task material.
 */
function makeExecutor(stores, optouts, collectionLog) {
  return async name => {
    if (name !== 'read_draft') return { error: 'unknown_tool', name };
    const session = fixture.getSession();
    collectionLog.push(gate.collectInput(session, stores, optouts));
    return { instruction: session.instruction, draft_text: session.draft_text };
  };
}

/**
 * runSession: one full agent session with the platform collecting around it.
 */
async function runSession({ gpc = false, scope = [] } = {}) {
  const optouts = gate.resolveOptouts({ gpc, scope });
  const stores = createStores();
  const collectionLog = [];
  const session = fixture.getSession();

  const agentResult = await runAgentLoop({
    systemPrompt: SYSTEM_PROMPT,
    userMessage: session.instruction,
    toolDefinitions: TOOL_DEFINITIONS,
    requiredTools: ['read_draft'],
    executeToolFn: makeExecutor(stores, optouts, collectionLog),
  });

  // B2: telemetry the platform observed while the user composed the draft.
  for (const event of session.telemetry) {
    collectionLog.push(gate.collectBehavior(event, stores, optouts));
  }

  // B3: post-session inference over whatever the platform gathered.
  const classified = await classifier.classify(session.draft_id);
  collectionLog.push(gate.deriveProfile(session.draft_id, classified, stores, optouts));

  return {
    agentResult,
    collectionLog,
    optouts: [...optouts].sort(),
    stores_snapshot: {
      input_log: stores.inputLog.snapshot(),
      behavior_log: stores.behaviorLog.snapshot(),
      derived_profile: stores.derivedProfile.snapshot(),
    },
  };
}

module.exports = { TOOL_DEFINITIONS, SYSTEM_PROMPT, makeExecutor, runSession };
