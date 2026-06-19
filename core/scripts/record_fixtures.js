'use strict';

/**
 * record_fixtures.js
 *
 * Captures real Tavily and Ollama responses into core/fixtures/.
 *
 * Run from the repo root:
 *
 *     TAVILY_API_KEY=tvly-... node core/scripts/record_fixtures.js
 *
 * Requirements:
 *   - TAVILY_API_KEY in the environment (load via root .env).
 *   - Ollama server reachable at OLLAMA_BASE_URL (default localhost:11434).
 *   - OLLAMA_MODEL pulled locally (default qwen2.5:14b).
 *
 * What it writes:
 *   - core/fixtures/tavily/full_results.json    real Tavily payload with results
 *   - core/fixtures/tavily/empty_results.json   real empty-results payload (nonsense query)
 *   - core/fixtures/tavily/partial_results.json derived from full_results with `content` stripped
 *   - core/fixtures/ollama/tool_call.json       one captured agent run (tool calls then summary)
 *   - core/fixtures/ollama/tool_then_text.json  capture where the model emits multiple tool calls
 *                                               in one turn then a text reply on the next turn
 *   - core/fixtures/ollama/direct_answer.json   capture where the model replies with text only
 */

const fs   = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const TAVILY_DIR = path.join(__dirname, '..', 'fixtures', 'tavily');
const OLLAMA_DIR = path.join(__dirname, '..', 'fixtures', 'ollama');

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1';

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function writeJson(file, payload) {
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n');
  const size = fs.statSync(file).size;
  const rel  = path.relative(path.join(__dirname, '..', '..'), file);
  console.log(`  wrote ${rel} (${size} bytes)`);
}

// ── Tavily ──────────────────────────────────────────────────────────────────

async function callTavily(query) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY is not set. Add it to the root .env or export it inline.');
  }
  const res = await fetch('https://api.tavily.com/search', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      api_key:      apiKey,
      query,
      search_depth: 'basic',
      max_results:  5,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Tavily call failed (${res.status}): ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

async function recordTavily() {
  console.log('\n[1/2] Capturing Tavily fixtures');
  ensureDir(TAVILY_DIR);

  const full = await callTavily('iPhone 17 review');
  writeJson(path.join(TAVILY_DIR, 'full_results.json'), full);

  // Tavily returns broadly-matched results even for nonsense queries, so an
  // honest empty-results capture is unreliable. Derive it from the real shape
  // by emptying the results array.
  const empty = structuredClone(full);
  empty.results = [];
  empty._derived_note = 'Derived from full_results.json with results emptied. Tavily returns broadly-matched results even for nonsense queries, so a direct capture of an empty payload is not reliable.';
  writeJson(path.join(TAVILY_DIR, 'empty_results.json'), empty);

  const partial = structuredClone(full);
  if (partial.results?.[0]) delete partial.results[0].content;
  partial._derived_note = 'Derived from full_results.json with results[0].content removed. Tests the missing-field branch in callers.';
  writeJson(path.join(TAVILY_DIR, 'partial_results.json'), partial);
}

// ── Ollama ──────────────────────────────────────────────────────────────────

/**
 * Run a self-contained agent loop against the live Ollama and capture every
 * chat-completion turn. Wraps global.fetch to intercept the model responses
 * without changing the loop itself.
 *
 * @param {string} variant      label for the run, used in the system prompt to bias the model
 * @param {object} promptOpts   { systemPrompt, userMessage, requiredTools, toolDefinitions }
 * @returns {Promise<Array>}    captured chat-completion responses, in order
 */
async function captureOllamaRun(variant, promptOpts) {
  const captured = [];
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const res = await realFetch(url, opts);
    if (typeof url === 'string' && url.startsWith(OLLAMA_BASE)) {
      const cloned = res.clone();
      try {
        const parsed = await cloned.json();
        captured.push(parsed);
      } catch { /* non-JSON, skip */ }
    }
    return res;
  };

  try {
    const { runAgentLoop } = require('../agent_loop');
    await runAgentLoop({
      ...promptOpts,
      executeToolFn: async () => ({ status: 'ok', mock: variant }),
    });
  } finally {
    global.fetch = realFetch;
  }
  return captured;
}

const RESEARCH_TOOL = [{
  type: 'function',
  function: {
    name: 'research_topic',
    description: 'Look up a topic and return a one-sentence summary.',
    parameters: {
      type: 'object',
      properties: { topic: { type: 'string' } },
      required: ['topic'],
    },
  },
}];

async function recordOllama() {
  console.log('\n[2/2] Capturing Ollama fixtures');
  ensureDir(OLLAMA_DIR);

  console.log('  capturing tool_call (one tool call per turn, then summary)');
  const toolCall = await captureOllamaRun('tool_call', {
    systemPrompt:    'You are a research assistant. You MUST call the research_topic tool before saying anything to the user. Call the tool now with the first topic. Do not write any text response until you have called the tool.',
    userMessage:     'Research one topic: smartphones.',
    requiredTools:   ['research_topic'],
    toolDefinitions: RESEARCH_TOOL,
  });
  if (!toolCall.length) throw new Error('No Ollama responses captured for tool_call. Is ollama serve running?');
  writeJson(path.join(OLLAMA_DIR, 'tool_call.json'), toolCall);

  console.log('  capturing tool_then_text (multi-call turn, then summary)');
  const toolThenText = await captureOllamaRun('tool_then_text', {
    systemPrompt:    'You are a research assistant. In your first response, make 3 tool calls at once. Then on your next turn, write a summary.',
    userMessage:     'Research smartphones, laptops, and audio gear, all at once.',
    requiredTools:   ['research_topic'],
    toolDefinitions: RESEARCH_TOOL,
  });
  if (!toolThenText.length) throw new Error('No Ollama responses captured for tool_then_text.');
  writeJson(path.join(OLLAMA_DIR, 'tool_then_text.json'), toolThenText);

  console.log('  capturing direct_answer (text only, no tool calls)');
  const direct = await captureOllamaRun('direct_answer', {
    systemPrompt:    'You are a friendly assistant. Reply with a short text answer.',
    userMessage:     'Say hello.',
    requiredTools:   [],
    toolDefinitions: [],
  });
  if (!direct.length) throw new Error('No Ollama responses captured for direct_answer.');
  writeJson(path.join(OLLAMA_DIR, 'direct_answer.json'), direct);
}

// ── Entry ──────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.TAVILY_API_KEY) {
    console.error('TAVILY_API_KEY is not set. Add it to the root .env or run as:');
    console.error('  TAVILY_API_KEY=tvly-... node core/scripts/record_fixtures.js');
    process.exit(1);
  }

  await recordTavily();
  await recordOllama();

  console.log('\nDone. Run `cd core && npm test` to confirm the captures parse cleanly.');
}

main().catch((err) => {
  console.error('\nrecord_fixtures failed:', err.message);
  process.exit(1);
});
