'use strict';

/**
 * run_agent.js — live LLM demo (requires Ollama).
 *
 * A real model is given file_read, web_search, and email_sender and decides which
 * to call for the request. Every call is gated by withConsentCheck(); the platform
 * fires behavior_tracker around the session. The mode and --gpc flag set the
 * enforcement config — the model never controls them.
 *
 *   node run_agent.js --mode=approve          # new tools prompt, then run
 *   node run_agent.js --mode=decline          # new tools prompt, then block
 *   node run_agent.js --mode=approve --gpc     # non-primary categories auto-declined
 *   node run_agent.js --mode=silent           # no enforcement (failure case)
 *
 * Needs Ollama running (`ollama serve`) with the model pulled
 * (`ollama pull qwen2.5:14b`). Override with OLLAMA_MODEL.
 */

const agent = require('./agent');
const { closeClient } = require('./mcp_client');

const VALID_MODES = ['silent', 'approve', 'decline', 'interactive'];

function fmt(result = {}) {
  const reason = result.reason ? ` (${result.reason})` : '';
  const consent = result.consent_required ? ' [consent_required]' : '';
  return `${result.status}${reason}${consent}`;
}

async function main() {
  const modeArg = process.argv.find((a) => a.startsWith('--mode='));
  const mode = modeArg ? modeArg.split('=')[1] : 'approve';
  const gpc = process.argv.includes('--gpc');

  if (!VALID_MODES.includes(mode)) {
    console.error('Usage: node run_agent.js --mode=silent|approve|decline [--gpc]');
    process.exit(1);
  }

  console.log(`=== Architecture C — LLM agent | Mode: ${mode}${gpc ? ' | GPC: on' : ''} ===`);
  console.log('A real model decides which tools to call; withConsentCheck() gates each call.\n');

  const userMessage =
    "Summarize this week's progress from my project notes and email it to my team.";

  const { agentResult, trackerResult, manifest_final } = await agent.runSession({
    userMessage,
    mode,
    gpc,
  });

  console.log('--- Agent tool calls (model-chosen) ---');
  if (agentResult.toolCalls.length === 0) {
    console.log('  (the model made no tool calls)');
  }
  for (const c of agentResult.toolCalls) {
    console.log(`  ${c.tool.padEnd(16)} → ${fmt(c.result)}`);
  }

  console.log('\n--- Platform behavior_tracker (ambient, not agent-invoked) ---');
  console.log(`  behavior_tracker → ${fmt(trackerResult)}`);

  console.log('\n--- Agent final response ---');
  console.log(agentResult.finalResponse || '(none)');

  console.log('\n--- Manifest (final) ---');
  console.log(JSON.stringify(manifest_final, null, 2));

  await closeClient();
}

main().catch(async (err) => {
  console.error(`\n[run_agent] ${err.message}`);
  console.error('If this is a connection error, start Ollama first: `ollama serve` and `ollama pull qwen2.5:14b`.');
  await closeClient();
  process.exit(1);
});
