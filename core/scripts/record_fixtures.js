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
 *   - architecture-a/keys/private.pem present (run arch-A keygen if not).
 *
 * What it writes:
 *
 *   core/fixtures/tavily/
 *     full_results.json     real Tavily payload with results (generic query)
 *     empty_results.json    derived from full_results with results: []
 *     partial_results.json  derived from full_results with results[0].content stripped
 *     <publisher>.json      one per arch-D publisher (the-verge, cnet, etc.)
 *
 *   core/fixtures/ollama/
 *     arch-a.json           real arch-A search agent run (Japan trip)
 *     arch-b.json           real arch-B medical agent run
 *     arch-c.json           real arch-C agent runSession
 *     arch-d.json           real arch-D research agent run (iPhone 17)
 *     arch-e.json           real arch-E inference query
 */

const fs   = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const REPO_ROOT = path.join(__dirname, '..', '..');

const TAVILY_DIR = path.join(__dirname, '..', 'fixtures', 'tavily');
const OLLAMA_DIR = path.join(__dirname, '..', 'fixtures', 'ollama');

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1';

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function writeJson(file, payload) {
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n');
  const size = fs.statSync(file).size;
  const rel  = path.relative(REPO_ROOT, file);
  console.log(`  wrote ${rel} (${size} bytes)`);
}

// ── Tavily ──────────────────────────────────────────────────────────────────

async function callTavily(query, opts = {}) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY is not set. Add it to the root .env or export it inline.');
  }
  const body = {
    api_key:      apiKey,
    query,
    search_depth: 'basic',
    max_results:  5,
  };
  if (opts.domain) body.include_domains = [opts.domain];

  const res  = await fetch('https://api.tavily.com/search', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Tavily call failed (${res.status}): ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

async function recordTavily() {
  console.log('\n[1/2] Capturing Tavily fixtures');
  ensureDir(TAVILY_DIR);

  console.log('  generic query for full_results');
  const full = await callTavily('iPhone 17 review');
  writeJson(path.join(TAVILY_DIR, 'full_results.json'), full);

  // Tavily returns broadly-matched results even for nonsense queries, so an
  // honest empty-results capture is unreliable. Derive it from the real shape.
  const empty = structuredClone(full);
  empty.results = [];
  empty._derived_note = 'Derived from full_results.json with results emptied. Tavily returns broadly-matched results even for nonsense queries, so a direct capture of an empty payload is not reliable.';
  writeJson(path.join(TAVILY_DIR, 'empty_results.json'), empty);

  const partial = structuredClone(full);
  if (partial.results?.[0]) delete partial.results[0].content;
  partial._derived_note = 'Derived from full_results.json with results[0].content removed. Tests the missing-field branch in callers.';
  writeJson(path.join(TAVILY_DIR, 'partial_results.json'), partial);

  console.log('  per-publisher captures for arch-D');
  const { PUBLISHERS } = require(path.join(REPO_ROOT, 'architecture-d', 'services', 'tool_registry'));
  for (const pub of PUBLISHERS) {
    process.stdout.write(`    ${pub.id.padEnd(20)} `);
    const payload = await callTavily('iPhone 17 review', { domain: pub.domain });
    fs.writeFileSync(path.join(TAVILY_DIR, `${pub.id}.json`), JSON.stringify(payload, null, 2) + '\n');
    console.log(`OK (${(payload.results ?? []).length} results)`);
  }
}

// ── Ollama capture helper ──────────────────────────────────────────────────

async function captureOllamaRun(label, runFn) {
  const captured  = [];
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const res = await realFetch(url, opts);
    if (typeof url === 'string' && url.startsWith(OLLAMA_BASE)) {
      const cloned = res.clone();
      try {
        const parsed = await cloned.json();
        captured.push(parsed);
      } catch { /* non-JSON response, skip */ }
    }
    return res;
  };
  try {
    await runFn();
  } finally {
    global.fetch = realFetch;
  }
  if (!captured.length) throw new Error(`No Ollama turns captured for ${label}. Is ollama serve running?`);
  return captured;
}

// ── Per-arch captures ──────────────────────────────────────────────────────

async function recordPerArch() {
  console.log('\n[2/2] Capturing per-arch Ollama runs');
  ensureDir(OLLAMA_DIR);

  console.log('  arch-A (search agent: Japan trip)');
  const archA = await captureOllamaRun('arch-a', async () => {
    const orch = require(path.join(REPO_ROOT, 'architecture-a', 'orchestrator', 'orchestrator'));
    await orch.handleRequest({
      query:         'Plan a 5-day trip to Japan covering Tokyo, Kyoto, and Osaka.',
      user_id:       'recorder',
      baggageHeader: 'gpc=0',
    });
  });
  writeJson(path.join(OLLAMA_DIR, 'arch-a.json'), archA);

  console.log('  arch-B (medical agent)');
  const archB = await captureOllamaRun('arch-b', async () => {
    const medical = require(path.join(REPO_ROOT, 'architecture-b', 'agents', 'medical_agent'));
    await medical.run({
      query:           'What does my blood pressure reading mean, and should I adjust my medication?',
      patient_id:      'patient-001',
      privacyContext:  { gpc: 0 },
    });
  });
  writeJson(path.join(OLLAMA_DIR, 'arch-b.json'), archB);

  console.log('  arch-C (productivity agent: file_read then summary)');
  const archC = await captureOllamaRun('arch-c', async () => {
    const agent = require(path.join(REPO_ROOT, 'architecture-c', 'agent'));
    await agent.runSession({
      userMessage: 'Summarize notes.txt for me.',
      mode:        'silent',
      gpc:         false,
    });
  });
  writeJson(path.join(OLLAMA_DIR, 'arch-c.json'), archC);

  console.log('  arch-D (research agent: iPhone 17 fanout)');
  const archD = await captureOllamaRun('arch-d', async () => {
    const orch = require(path.join(REPO_ROOT, 'architecture-d', 'orchestrator', 'orchestrator'));
    await orch.handleAgentRequest({
      user_id:       'recorder',
      query:         'Research the iPhone 17 across tech publishers and summarize the key consensus points.',
      baggageHeader: 'gpc=1',
    });
  });
  writeJson(path.join(OLLAMA_DIR, 'arch-d.json'), archD);

  console.log('  arch-E (inference firewall agent)');
  const archE = await captureOllamaRun('arch-e', async () => {
    const agent = require(path.join(REPO_ROOT, 'architecture-e', 'agent'));
    const { createProfileStore } = require(path.join(REPO_ROOT, 'architecture-e', 'profile_store'));
    const store = createProfileStore();
    await agent.ask({
      question: 'where can I find affordable diabetes medication near me?',
      store,
      b3:       false,
    });
  });
  writeJson(path.join(OLLAMA_DIR, 'arch-e.json'), archE);
}

// ── Entry ──────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.TAVILY_API_KEY) {
    console.error('TAVILY_API_KEY is not set. Add it to the root .env or run as:');
    console.error('  TAVILY_API_KEY=tvly-... node core/scripts/record_fixtures.js');
    process.exit(1);
  }

  await recordTavily();
  await recordPerArch();

  console.log('\nDone. Run `cd core && npm test` to confirm the captures parse cleanly.');
}

main().catch((err) => {
  console.error('\nrecord_fixtures failed:', err.message);
  process.exit(1);
});
