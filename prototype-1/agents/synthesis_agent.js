/**
 * Synthesis Agent — pure reasoning, no tools.
 *
 * Receives raw search results from the search agent and synthesises them into
 * a structured itinerary. Calling no tools means there is nothing to block at
 * Layer 4 — demonstrating that GPC opt-out does not degrade answer quality,
 * only storage behaviour.
 *
 * The _meta envelope is passed in for traceability but is not used here since
 * no tool calls cross the agent boundary.
 */

const { runAgentLoop } = require('../orchestrator/agent_loop.js');

const SYSTEM_PROMPT = `You are a travel planning agent. You receive raw search results gathered by a search agent and synthesise them into a detailed itinerary.

Base your answer strictly on the provided results. Structure it clearly by day. Include sights, food, and practical tips. Do not add information from outside the provided results.`;

/**
 * @param {object}  task
 * @param {string}  task.query
 * @param {Array}   task.rawResults  — all raw search results from the search agent
 * @param {object}  [task._meta]
 * @param {Array}   [task.timing]
 * @returns {{ answer: string }}
 */
async function run({ query, rawResults, _meta = {}, timing = null }) {
  const { finalResponse } = await runAgentLoop({
    systemPrompt:    SYSTEM_PROMPT,
    userMessage:     `Query: ${query}\n\nRaw search results:\n${JSON.stringify(rawResults, null, 2)}`,
    toolDefinitions: [],
    requiredTools:   [],
    maxTurns:        3,
    executeToolFn:   async () => ({ status: 'ok' }),
  });

  return { answer: finalResponse };
}

module.exports = { run };
