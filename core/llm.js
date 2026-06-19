/**
 * Shared LLM chat-completion caller, provider-agnostic.
 *
 * Owned by every architecture that drives an agent loop (A, B, C, D, E).
 * Each arch keeps its own runAgentLoop; this module owns the network call,
 * the per-provider request shape, and the OLLAMA_FIXTURE gate.
 *
 * Providers:
 *
 *   - 'ollama' (default), base URL http://localhost:11434/v1, no auth header.
 *     Response shape is OpenAI-compatible: { choices: [{ message: {...} }] }.
 *
 *   - 'openai', base URL https://api.openai.com/v1, Authorization: Bearer
 *     $OPENAI_API_KEY. Same body shape and response shape as Ollama.
 *
 *   - 'anthropic', base URL https://api.anthropic.com/v1, x-api-key:
 *     $ANTHROPIC_API_KEY, anthropic-version header. Their /v1/messages API
 *     uses a different shape: `system` is a top-level field, `max_tokens` is
 *     required, and tools use `input_schema` rather than `parameters`. The
 *     adapter translates between the OpenAI shape callers use and the
 *     Anthropic wire format on the way in and out.
 *
 * The provider can be chosen per call (opts.provider) or globally via the
 * LLM_PROVIDER env var. Default is 'ollama'.
 *
 * The fixture-gate (OLLAMA_FIXTURE) short-circuits any provider to the
 * checked-in JSON in core/fixtures/ollama/. The fixture name remains
 * OLLAMA_FIXTURE for backward compatibility; the captured response shape is
 * OpenAI-compatible regardless of which provider you record from.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'ollama');

const DEFAULTS = {
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1',
    model:   process.env.OLLAMA_MODEL    ?? 'qwen2.5:14b',
  },
  openai: {
    baseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    model:   process.env.OPENAI_MODEL    ?? 'gpt-4o-mini',
  },
  anthropic: {
    baseUrl: process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com/v1',
    model:   process.env.ANTHROPIC_MODEL    ?? 'claude-haiku-4-5-20251001',
  },
};

const DEFAULT_PROVIDER = (process.env.LLM_PROVIDER ?? 'ollama').toLowerCase();

// Backward-compat shims so callers that import the pre-#60 module keep working.
const DEFAULT_MODEL = DEFAULTS.ollama.model;
const OLLAMA_BASE   = DEFAULTS.ollama.baseUrl;

// ── Fixture-gate ────────────────────────────────────────────────────────────

function resolveFixtureName(envFixture, optsFixture) {
  if (!envFixture) return null;
  if (envFixture === '1') return optsFixture || 'tool_call';
  return envFixture;
}

function loadFixture(name) {
  const file = path.join(FIXTURE_DIR, `${name}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`OLLAMA_FIXTURE='${name}' but core/fixtures/ollama/${name}.json could not be loaded`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// ── Ollama / OpenAI ────────────────────────────────────────────────────────

async function callOpenAICompatible({ baseUrl, model, apiKey, messages, tools, toolChoice }) {
  const body = { model, messages, stream: false };
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = toolChoice;
  }
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body:   JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Model API error ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Anthropic adapter ───────────────────────────────────────────────────────

const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Translate OpenAI-format messages and tools into the Anthropic /v1/messages
 * body shape. Returns { systemPrompt, messages, tools }.
 */
function toAnthropic(messages, tools) {
  let systemPrompt = '';
  const out = [];
  for (const m of messages) {
    if (m.role === 'system') {
      systemPrompt += (systemPrompt ? '\n\n' : '') + (m.content ?? '');
      continue;
    }
    if (m.role === 'tool') {
      out.push({
        role:    'user',
        content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content }],
      });
      continue;
    }
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      const blocks = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const tc of m.tool_calls) {
        let input = {};
        try { input = JSON.parse(tc.function.arguments); } catch { /* leave empty */ }
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
      }
      out.push({ role: 'assistant', content: blocks });
      continue;
    }
    out.push({ role: m.role, content: m.content ?? '' });
  }

  const aTools = (tools ?? []).map((t) => ({
    name:         t.function.name,
    description:  t.function.description,
    input_schema: t.function.parameters,
  }));

  return { systemPrompt, messages: out, tools: aTools };
}

/**
 * Translate an Anthropic /v1/messages response back to the OpenAI shape that
 * callers consume.
 */
function fromAnthropic(resp) {
  const blocks    = resp.content ?? [];
  const textParts = blocks.filter((b) => b.type === 'text').map((b) => b.text);
  const toolUses  = blocks.filter((b) => b.type === 'tool_use');

  const message = { role: 'assistant', content: textParts.join('\n') || null };
  if (toolUses.length > 0) {
    message.tool_calls = toolUses.map((b) => ({
      id:       b.id,
      type:     'function',
      function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
    }));
  }
  return { choices: [{ message }] };
}

async function callAnthropic({ baseUrl, model, apiKey, messages, tools, toolChoice, maxTokens }) {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  const { systemPrompt, messages: aMessages, tools: aTools } = toAnthropic(messages, tools);
  const body = {
    model,
    max_tokens: maxTokens ?? 4096,
    messages:   aMessages,
  };
  if (systemPrompt) body.system = systemPrompt;
  if (aTools.length > 0) {
    body.tools = aTools;
    if (toolChoice === 'required') body.tool_choice = { type: 'any' };
    else if (toolChoice === 'auto') body.tool_choice = { type: 'auto' };
  }

  const res = await fetch(`${baseUrl}/messages`, {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Model API error ${res.status}: ${await res.text()}`);
  return fromAnthropic(await res.json());
}

// ── Entry ──────────────────────────────────────────────────────────────────

/**
 * Issue one chat-completion call against the chosen provider.
 *
 * @param {Array}  messages       OpenAI-format messages
 * @param {Array}  [tools]        OpenAI-format function tools
 * @param {string} [toolChoice]   'required' or 'auto'
 * @param {object} [opts]
 * @param {string} [opts.provider]  'ollama' | 'openai' | 'anthropic'; default LLM_PROVIDER env or 'ollama'
 * @param {string} [opts.model]
 * @param {string} [opts.apiKey]
 * @param {number} [opts.maxTokens] only used by Anthropic
 * @param {string} [opts.fixture]   hint for the fixture-gate
 * @param {number} [opts.turn]      index into the fixture array
 * @returns {Promise<object>} OpenAI-shape chat-completion response
 */
async function callModel(messages, tools, toolChoice, opts = {}) {
  const fixtureName = resolveFixtureName(process.env.OLLAMA_FIXTURE, opts.fixture);
  if (fixtureName) {
    const fx   = loadFixture(fixtureName);
    const turn = opts.turn ?? 0;
    return fx[turn] ?? fx[fx.length - 1];
  }

  const provider = (opts.provider ?? DEFAULT_PROVIDER).toLowerCase();
  const def      = DEFAULTS[provider];
  if (!def) throw new Error(`Unknown LLM_PROVIDER '${provider}'. Use 'ollama', 'openai', or 'anthropic'.`);

  const model = opts.model ?? def.model;

  if (provider === 'ollama') {
    return callOpenAICompatible({
      baseUrl: def.baseUrl,
      model,
      apiKey:  null,
      messages,
      tools,
      toolChoice,
    });
  }
  if (provider === 'openai') {
    return callOpenAICompatible({
      baseUrl: def.baseUrl,
      model,
      apiKey:  opts.apiKey ?? process.env.OPENAI_API_KEY,
      messages,
      tools,
      toolChoice,
    });
  }
  if (provider === 'anthropic') {
    return callAnthropic({
      baseUrl:    def.baseUrl,
      model,
      apiKey:     opts.apiKey ?? process.env.ANTHROPIC_API_KEY,
      messages,
      tools,
      toolChoice,
      maxTokens:  opts.maxTokens,
    });
  }
  throw new Error(`Unreachable provider branch: '${provider}'`);
}

module.exports = {
  callModel,
  DEFAULT_PROVIDER,
  DEFAULT_MODEL,
  OLLAMA_BASE,
  // Exported for tests:
  toAnthropic,
  fromAnthropic,
};
