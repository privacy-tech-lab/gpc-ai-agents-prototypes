/**
 * Shared Ollama chat-completion caller.
 *
 * Owned by every architecture that drives an agent loop (A, B, C, D, E).
 * Each arch keeps its own runAgentLoop because the loop semantics differ
 * (`requiredTools` vs `minToolCalls`, per-turn message shape, truncation
 * handling). This module owns the network call and the fixture-gate.
 *
 * The fixture-gate (OLLAMA_FIXTURE env var) short-circuits the live fetch
 * to a checked-in array of chat-completion turns. Callers pass `opts.turn`
 * so each successive call returns the next entry. A future recorder
 * script (#50) overwrites the placeholder fixtures with real captures.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const OLLAMA_BASE   = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL    ?? 'qwen2.5:14b';

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'ollama');

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

/**
 * Issue one chat-completion call.
 *
 * @param {Array}  messages
 * @param {Array}  [tools]
 * @param {string} [toolChoice]   'required' or 'auto'
 * @param {object} [opts]
 * @param {string} [opts.model]   default DEFAULT_MODEL
 * @param {string} [opts.fixture] hint for the fixture-gate; ignored when OLLAMA_FIXTURE is unset
 * @param {number} [opts.turn]    index into the fixture array; defaults to 0
 * @returns {Promise<object>} the chat-completion response shape
 */
async function callModel(messages, tools, toolChoice, opts = {}) {
  const fixtureName = resolveFixtureName(process.env.OLLAMA_FIXTURE, opts.fixture);
  if (fixtureName) {
    const fx   = loadFixture(fixtureName);
    const turn = opts.turn ?? 0;
    return fx[turn] ?? fx[fx.length - 1];
  }

  const model = opts.model ?? DEFAULT_MODEL;
  const body  = { model, messages, stream: false };
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = toolChoice;
  }

  const res = await fetch(`${OLLAMA_BASE}/chat/completions`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Model API error ${res.status}: ${await res.text()}`);
  return res.json();
}

module.exports = { callModel, DEFAULT_MODEL, OLLAMA_BASE };
