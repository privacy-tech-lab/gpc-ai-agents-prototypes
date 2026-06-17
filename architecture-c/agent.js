'use strict';

/**
 * agent.js
 *
 * The LLM-driven version of Architecture C. Instead of a scripted TOOL_SEQUENCE
 * (orchestrator.js), a real model is given the user-facing tools and decides which
 * to call to satisfy a request.
 *
 * Enforcement is NOT in the prompt. Every tool the model calls runs through
 * server.invokeTool(...) → withConsentCheck(). The model proposes; the consent gate
 * disposes. A blocked or quarantined tool simply comes back to the model as that
 * tool's result, which it can read and work around in conversation — but it cannot
 * skip the gate.
 *
 * behavior_tracker is deliberately NOT an agent tool. It is ambient analytics that
 * a platform fires around a session — a user-task agent would never choose to call
 * its own surveillance. It is invoked here as a platform call (firePlatformTracker)
 * and gated by the same withConsentCheck(), which is exactly the A2 (activation)
 * case: background AI that should not run without affirmative consent.
 *
 * The deterministic orchestrator.js / run_v1.js / run_v2.js are retained as the
 * testable core; this module is the live-agent demo path (requires Ollama).
 */

const { runAgentLoop } = require('./agent_loop');
const server   = require('./mcp_server');
const manifest = require('./consent_manifest');
const prompt   = require('./consent_prompt');

const PLATFORM_VERSION = 'v2.0';

// User-facing tools the agent may call. behavior_tracker is intentionally absent.
const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'file_read',
      description: "Read a file from the user's document store.",
      parameters: {
        type: 'object',
        properties: { filename: { type: 'string' } },
        required: ['filename'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Run a web search query against an external search provider.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'email_sender',
      description: "Send an email on the user's behalf to a recipient.",
      parameters: {
        type: 'object',
        properties: {
          to:      { type: 'string' },
          subject: { type: 'string' },
          body:    { type: 'string' },
        },
        required: ['to', 'subject'],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are a productivity assistant with access to the user's \
files, web search, and email. To handle a request: read any relevant files, look \
things up if needed, then send a short summary email to the user's team at \
team@example.com. Use the tools directly; do not ask the user for confirmation.`;

/**
 * makeExecutor — the tool-execution seam. Every call the model makes is routed
 * through withConsentCheck via server.invokeTool, carrying the run's mode and gpc.
 *
 * @param {string} mode   silent | approve | decline | interactive
 * @param {boolean} gpc
 * @returns {(name: string, input: object) => Promise<object>}
 */
function makeExecutor(mode, gpc) {
  return (name, input) => server.invokeTool(name, input, mode, gpc);
}

/**
 * firePlatformTracker — ambient analytics fired by the platform around a session,
 * not chosen by the agent. Gated by the same consent check (the A2 case).
 */
function firePlatformTracker(mode, gpc) {
  return server.invokeTool(
    'behavior_tracker',
    { event_type: 'session_summary', metadata: { source: 'platform', surface: 'agent_session' } },
    mode,
    gpc,
  );
}

/**
 * ask — one agent run over a single user request.
 *
 * @param {object} opts
 * @param {string} opts.userMessage
 * @param {string} opts.mode
 * @param {boolean} [opts.gpc=false]
 * @returns {Promise<{ finalResponse: string, toolCalls: Array }>}
 */
async function ask({ userMessage, mode, gpc = false }) {
  return runAgentLoop({
    systemPrompt:    SYSTEM_PROMPT,
    userMessage,
    toolDefinitions: TOOL_DEFINITIONS,
    requiredTools:   ['email_sender'],   // ensure the gated v2.0 tool is attempted
    executeToolFn:   makeExecutor(mode, gpc),
  });
}

/**
 * runSession — wires up the run the way run_v2.js does: reset the manifest to v1.0,
 * register the consent responder, run the agent, fire the platform tracker, then
 * bump the manifest version (after all consent decisions are recorded).
 *
 * @param {object} opts
 * @param {string} opts.userMessage
 * @param {string} [opts.mode='approve']
 * @param {boolean} [opts.gpc=false]
 */
async function runSession({ userMessage, mode = 'approve', gpc = false }) {
  manifest.reset();
  if (mode !== 'silent') {
    prompt.register(mode === 'interactive' ? null : mode);
  }

  const agentResult   = await ask({ userMessage, mode, gpc });
  const trackerResult = await firePlatformTracker(mode, gpc);

  // Deferred version bump — after every consent decision for this version is made.
  if (mode !== 'silent') {
    const mf = manifest.load();
    mf.manifest_version = PLATFORM_VERSION;
    manifest.save(mf);
  }

  return { agentResult, trackerResult, manifest_final: manifest.load() };
}

module.exports = {
  TOOL_DEFINITIONS,
  SYSTEM_PROMPT,
  makeExecutor,
  firePlatformTracker,
  ask,
  runSession,
};
