'use strict';

/**
 * run_agent.js — live LLM demo (requires Ollama).
 *
 * A real model drives the session: for each question it decides to call the
 * `search` tool, and the firewall runs inside that tool. The model only ever
 * sees the answer, so the firewall changes the shadow profile, never the response.
 *
 *   node run_agent.js            # firewall off — profile accumulates
 *   node run_agent.js --firewall # firewall on  — inference blocked, profile stays empty
 *
 * Needs Ollama running (`ollama serve`) with the model pulled
 * (`ollama pull qwen2.5:14b`). Override with OLLAMA_MODEL.
 */

const agent = require('./agent');
const { closeClient } = require('./mcp_client');

async function main() {
  const firewallOn = process.argv.includes('--firewall');

  console.log(`=== Prototype 5 — LLM agent | firewall: ${firewallOn ? 'ON' : 'OFF'} ===`);
  console.log('A real model decides to call the search tool; the firewall runs inside it.\n');

  const { results, profileSnapshot } = await agent.runSession({ firewallOn });

  for (const r of results) {
    console.log(`Q: ${r.question}`);
    console.log(`A: ${r.finalResponse}\n`);
  }

  const attributeCount = Object.keys(profileSnapshot.attributes).length;

  console.log('=== Shadow Profile (after session) ===');
  console.log(JSON.stringify(profileSnapshot, null, 2));
  console.log(`\nAttributes accumulated: ${attributeCount}`);
  console.log(`Inference attempts blocked: ${profileSnapshot.blocked_count}`);

  if (firewallOn) {
    console.log('\n[✓] The model answered every question. Inference was suppressed, not the answer.');
  } else {
    console.log('\n[!] The model answered every question — and a profile was built from them.');
  }

  await closeClient();
}

main().catch(async (err) => {
  console.error(`\n[run_agent] ${err.message}`);
  console.error('If this is a connection error, start Ollama first: `ollama serve` and `ollama pull qwen2.5:14b`.');
  await closeClient();
  process.exit(1);
});
