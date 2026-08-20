'use strict';

/**
 * agent.js
 *
 * The LLM-driven version of the Category E prototype. A real model plays
 * TripPilot: it plans the trip and calls the task tools it thinks the job
 * needs. Every call runs through the delegation gate; the model proposes,
 * the manifest disposes. A declined action comes back as that call's
 * result, which the model can read and work around, but it cannot skip the
 * gate or reassign a tier.
 *
 * price_alerts_tracking and newsletter_signup are deliberately NOT agent
 * tools. They are platform actions fired around the session; a user-task
 * agent would not choose them. They pass through the same gate, which is
 * where the vendor-default and unassigned paths of E1 show up.
 *
 * The deterministic orchestrator.js / run_baseline.js / run_optout.js
 * remain the testable core; this module is the live-agent demo path
 * (requires Ollama).
 */

const { runAgentLoop } = require('./agent_loop');
const gate = require('./delegation_gate');
const fixture = require('./trip_fixture');

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'search_flights',
      description: 'Search flights for a route and dates.',
      parameters: {
        type: 'object',
        properties: { route: { type: 'string' }, dates: { type: 'string' } },
        required: ['route', 'dates'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hold_reservation',
      description: 'Hold a hotel room with free cancellation.',
      parameters: {
        type: 'object',
        properties: { hotel: { type: 'string' }, cancellation: { type: 'string' } },
        required: ['hotel'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'book_flight',
      description: 'Book a flight and charge the card on file. Non-refundable.',
      parameters: {
        type: 'object',
        properties: { flight: { type: 'string' }, fare: { type: 'number' } },
        required: ['flight', 'fare'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'share_passport',
      description: "Send the traveler's passport details to the airline for check-in.",
      parameters: {
        type: 'object',
        properties: { recipient: { type: 'string' } },
        required: ['recipient'],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are TripPilot, a travel booking agent. Plan the \
requested trip: search flights, hold a hotel, book the best flight, and send \
the passport details for check-in. Use the tools directly. If a tool reports \
that an action was declined or needs the user, note that in your summary and \
move on; do not retry it.`;

const AGENT_TOOLS = new Set(TOOL_DEFINITIONS.map(t => t.function.name));

function makeExecutor(ctx, log) {
  const defs = new Map(fixture.getActions().map(a => [a.action, a]));
  return async (name, input) => {
    if (!AGENT_TOOLS.has(name)) {
      return { status: 'blocked', reason: 'tool_not_in_agent_surface', action: name };
    }
    const def = defs.get(name);
    const result = await gate.requestAction({ ...def, args: { ...def.args, ...input } }, ctx);
    log.push(result);
    return result;
  };
}

/**
 * runSession: the model runs the task; afterward the platform fires its two
 * ambient actions through the same gate.
 */
async function runSession({ gpc = false, userPresent = true, respond = 'approve' } = {}) {
  const ctx = { mode: 'enforced', gpc, userPresent, respond };
  const log = [];
  const task = fixture.getTask();

  const agentResult = await runAgentLoop({
    systemPrompt: SYSTEM_PROMPT,
    userMessage: task.request,
    toolDefinitions: TOOL_DEFINITIONS,
    requiredTools: ['search_flights', 'book_flight'],
    executeToolFn: makeExecutor(ctx, log),
  });

  const defs = new Map(fixture.getActions().map(a => [a.action, a]));
  const platformResults = [];
  for (const name of ['price_alerts_tracking', 'newsletter_signup']) {
    const result = await gate.requestAction(defs.get(name), ctx);
    log.push(result);
    platformResults.push(result);
  }

  return { agentResult, platformResults, delegationLog: log };
}

module.exports = { TOOL_DEFINITIONS, SYSTEM_PROMPT, makeExecutor, runSession };
