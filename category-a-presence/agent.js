'use strict';

/**
 * agent.js
 *
 * The LLM-driven version of the Category A prototype. Instead of the scripted
 * FEATURE_SEQUENCE (orchestrator.js), a real model is given the user-facing
 * features and decides which to call to satisfy a request.
 *
 * Enforcement is NOT in the prompt. Every feature the model calls runs
 * through presence_gate.invokeFeature(). The model proposes; the gate
 * disposes. A blocked feature comes back to the model as that call's result,
 * which it can read and work around in conversation, but it cannot skip the
 * gate.
 *
 * ai_ambient_copilot is deliberately NOT an agent tool. It is passive AI the
 * platform fires around a session; a user-task agent would never choose to
 * invoke its own ambient assistant. It is fired here as a platform call
 * (firePlatformCopilot) with initiatedBy 'platform', which is exactly the A2
 * (activation) case: passive AI that must not run without an explicit
 * ambient opt-in.
 *
 * The deterministic orchestrator.js / run_v1.js / run_v2.js remain the
 * testable core; this module is the live-agent demo path (requires Ollama).
 */

const { runAgentLoop } = require('./agent_loop');
const gate = require('./presence_gate');
const manifest = require('./presence_manifest');
const prompt = require('./optin_prompt');

const PLATFORM_VERSION = 'v2.0';

// User-facing features the agent may call. ai_ambient_copilot is intentionally absent.
const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'note_read',
      description: "Read a note from the user's notebook.",
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
      name: 'note_save',
      description: "Save or update a note in the user's notebook.",
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['filename', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ai_summarize',
      description: 'Summarize a note with the built-in AI model.',
      parameters: {
        type: 'object',
        properties: { filename: { type: 'string' } },
        required: ['filename'],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are a note-taking assistant. To handle a request: \
read the relevant note, summarize it with the AI summarizer, then save the \
summary as a new note. Use the tools directly; do not ask the user for \
confirmation.`;

// The agent's tool surface is exactly what TOOL_DEFINITIONS lists. If the
// model fabricates a tool name (e.g. ai_ambient_copilot, which is
// platform-fired and intentionally absent from the agent's view), the
// executor refuses it. Without this guard, the model could call any feature
// registered in the gate and bypass the intended surface.
const AGENT_TOOLS = new Set(TOOL_DEFINITIONS.map(t => t.function.name));

function makeExecutor(mode, gpc) {
  return async (name, input) => {
    if (!AGENT_TOOLS.has(name)) {
      return { status: 'blocked', reason: 'tool_not_in_agent_surface', feature: name };
    }
    return gate.invokeFeature(name, input, { mode, gpc, initiatedBy: 'user' });
  };
}

/**
 * firePlatformCopilot: passive AI fired by the platform around a session,
 * not chosen by the agent. Gated by the same presence check (the A2 case).
 */
function firePlatformCopilot(mode, gpc) {
  return gate.invokeFeature(
    'ai_ambient_copilot',
    { event: 'session_activity', chars: 512 },
    { mode, gpc, initiatedBy: 'platform' }
  );
}

/**
 * ask: one agent run over a single user request.
 */
async function ask({ userMessage, mode, gpc = false }) {
  return runAgentLoop({
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
    toolDefinitions: TOOL_DEFINITIONS,
    requiredTools: ['ai_summarize'], // ensure the A1-gated v2.0 feature is attempted
    executeToolFn: makeExecutor(mode, gpc),
  });
}

/**
 * runSession: reset the manifest to the v1.0 install state, optionally apply
 * the user's explicit ambient opt-in, register the opt-in responder, run the
 * agent, fire the platform copilot, then bump the manifest version.
 */
async function runSession({ userMessage, mode = 'approve', gpc = false, ambient = false }) {
  manifest.reset();
  if (ambient) manifest.setAmbient(true);
  if (mode !== 'silent') {
    prompt.register(mode === 'interactive' ? null : mode);
  }

  const agentResult = await ask({ userMessage, mode, gpc });
  const copilotResult = await firePlatformCopilot(mode, gpc);

  // Deferred version bump, after every presence decision for this version is made.
  if (mode !== 'silent') {
    const mf = manifest.load();
    mf.manifest_version = PLATFORM_VERSION;
    manifest.save(mf);
  }

  return { agentResult, copilotResult, manifest_final: manifest.load() };
}

module.exports = {
  TOOL_DEFINITIONS,
  SYSTEM_PROMPT,
  makeExecutor,
  firePlatformCopilot,
  ask,
  runSession,
};
