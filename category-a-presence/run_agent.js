'use strict';

/**
 * run_agent.js: live LLM demo (requires Ollama).
 *
 * A real model is given note_read, note_save, and ai_summarize and decides
 * which to call for the request. Every call is gated by invokeFeature(); the
 * platform fires ai_ambient_copilot around the session. The mode and flags
 * set the enforcement config; the model never controls them.
 *
 *   node run_agent.js --mode=approve            # new AI feature prompts, then runs
 *   node run_agent.js --mode=decline            # new AI feature prompts, then stays off
 *   node run_agent.js --mode=approve --ambient  # user pre-enabled ambient mode
 *   node run_agent.js --mode=approve --gpc      # undecided AI features auto-declined
 *   node run_agent.js --mode=silent             # no enforcement (failure case)
 *
 * Needs Ollama running (`ollama serve`) with the model pulled
 * (`ollama pull qwen2.5:14b`). Override with OLLAMA_MODEL.
 */

const agent = require('./agent');

const VALID_MODES = ['silent', 'approve', 'decline', 'interactive'];

function fmt(result = {}) {
  const reason = result.reason ? ` (${result.reason})` : '';
  const consent = result.consent_required ? ' [consent_required]' : '';
  const subtype = result.subtype ? ` [${result.subtype}]` : '';
  return `${result.status}${reason}${subtype}${consent}`;
}

async function main() {
  const modeArg = process.argv.find(a => a.startsWith('--mode='));
  const mode = modeArg ? modeArg.split('=')[1] : 'approve';
  const gpc = process.argv.includes('--gpc');
  const ambient = process.argv.includes('--ambient');

  if (!VALID_MODES.includes(mode)) {
    console.error('Usage: node run_agent.js --mode=silent|approve|decline [--gpc] [--ambient]');
    process.exit(1);
  }

  console.log(`=== Category A (Presence): LLM agent | Mode: ${mode}${gpc ? ' | GPC: on' : ''}${ambient ? ' | ambient: user-enabled' : ''} ===`);
  console.log('A real model decides which features to call; invokeFeature() gates each call.\n');

  const userMessage = 'Summarize my meeting notes and save the summary as a new note.';

  const { agentResult, copilotResult, manifest_final } = await agent.runSession({
    userMessage,
    mode,
    gpc,
    ambient,
  });

  console.log('--- Agent feature calls (model-chosen) ---');
  if (agentResult.toolCalls.length === 0) {
    console.log('  (the model made no tool calls)');
  }
  for (const c of agentResult.toolCalls) {
    console.log(`  ${c.tool.padEnd(18)} -> ${fmt(c.result)}`);
  }

  console.log('\n--- Platform ai_ambient_copilot (passive, not agent-invoked) ---');
  console.log(`  ai_ambient_copilot -> ${fmt(copilotResult)}`);

  console.log('\n--- Agent final response ---');
  console.log(agentResult.finalResponse || '(none)');

  console.log('\n--- Manifest (final) ---');
  console.log(JSON.stringify(manifest_final, null, 2));
}

main().catch(err => {
  console.error(`\n[run_agent] ${err.message}`);
  console.error('If this is a connection error, start Ollama first: `ollama serve` and `ollama pull qwen2.5:14b`.');
  process.exit(1);
});
