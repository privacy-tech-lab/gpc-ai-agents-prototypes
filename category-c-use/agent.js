'use strict';

/**
 * agent.js
 *
 * The LLM-driven version of the Category C prototype. A real model plays
 * HealthAssist: it reads the patient's reading through a tool and writes the
 * answer itself.
 *
 * Use enforcement is NOT the model's business, and the gate is not in the
 * prompt. After the session, the platform attempts its downstream uses and
 * the task chain runs its hops; every attempt goes through the use gate. The
 * model only ever sees the task material and never the outputs stores, so it
 * cannot route around the gate.
 *
 * The deterministic orchestrator.js / run_baseline.js / run_optout.js remain
 * the testable core; this module is the live-agent demo path (requires
 * Ollama).
 */

const { runAgentLoop } = require('./agent_loop');
const gate = require('./use_gate');
const fixture = require('./session_fixture');
const orchestrator = require('./orchestrator');
const { createOutputs, snapshotAll } = require('./stores');

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'read_reading',
      description: "Read the patient's blood pressure reading and context.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];

const SYSTEM_PROMPT = `You are HealthAssist, a careful health information \
assistant. Call read_reading to get the patient's blood pressure reading, then \
explain briefly what it means, remind them one reading is not a diagnosis, and \
say when to contact a doctor. Do not give a diagnosis.`;

function makeExecutor() {
  return async name => {
    if (name !== 'read_reading') return { error: 'unknown_tool', name };
    const session = fixture.getSession();
    return { reading: session.reading, question: session.user_question };
  };
}

/**
 * runSession: the model answers, then the platform attempts every downstream
 * use and the chain hops, all through the use gate.
 */
async function runSession({ gpc = false, scope = [] } = {}) {
  const optouts = gate.resolveOptouts({ gpc, scope });
  const outputs = createOutputs();
  const session = fixture.getSession();

  const agentResult = await runAgentLoop({
    systemPrompt: SYSTEM_PROMPT,
    userMessage: session.user_question,
    toolDefinitions: TOOL_DEFINITIONS,
    requiredTools: ['read_reading'],
    executeToolFn: makeExecutor(),
  });

  const useResults = orchestrator.USE_SEQUENCE.map(request =>
    gate.checkUse(
      request,
      request.subtype === null ? {} : { source: 'agent_session', use: request.use },
      outputs,
      optouts
    )
  );

  const chainPayload = {
    medication: session.health_context.medication,
    reading: session.reading,
    health_context: session.health_context,
    user_question: session.user_question,
  };
  const chainResults = orchestrator.CHAIN.map(hop =>
    gate.transferAlongChain(hop, chainPayload, outputs, optouts)
  );

  return {
    agentResult,
    useResults,
    chainResults,
    optouts: [...optouts].sort(),
    outputs_snapshot: snapshotAll(outputs),
  };
}

module.exports = { TOOL_DEFINITIONS, SYSTEM_PROMPT, makeExecutor, runSession };
