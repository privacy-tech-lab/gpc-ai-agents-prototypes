'use strict';

/**
 * run_agent.js: live LLM demo (requires Ollama).
 *
 * A real model polishes the draft; the platform collects around the session
 * through the collection gate. Flags set the enforcement config; the model
 * never controls them.
 *
 *   node run_agent.js                 # no opt-outs, everything collected
 *   node run_agent.js --gpc           # whole category asserted
 *   node run_agent.js --scope=b3      # single subtype asserted
 *
 * Needs Ollama running (`ollama serve`) with the model pulled
 * (`ollama pull qwen2.5:14b`). Override with OLLAMA_MODEL.
 */

const agent = require('./agent');
const { closeClient } = require('./mcp_client');

function fmt(record) {
  const reason = record.reason ? ` (${record.reason})` : '';
  return `${record.stage}: ${record.status}${reason}`;
}

async function main() {
  const gpc = process.argv.includes('--gpc');
  const scopeArg = process.argv.find(a => a.startsWith('--scope='));
  const scope = scopeArg ? scopeArg.split('=')[1].split(',').filter(Boolean) : [];

  const label = scope.length > 0 ? `scope: ${scope.join(',')}` : gpc ? 'GPC: on' : 'no opt-outs';
  console.log(`=== Category B (Collection): LLM agent | ${label} ===`);
  console.log('A real model polishes the email; the platform collects around it.\n');

  const { agentResult, collectionLog, stores_snapshot } = await agent.runSession({ gpc, scope });

  console.log('--- Collection checkpoints (platform-side) ---');
  for (const record of collectionLog) {
    console.log(`  ${fmt(record)}`);
  }

  console.log('\n--- Agent final response (the task output) ---');
  console.log(agentResult.finalResponse || '(none)');

  console.log('\n--- Stores (final) ---');
  console.log(JSON.stringify(stores_snapshot, null, 2));

  await closeClient();
}

main().catch(err => {
  console.error(`\n[run_agent] ${err.message}`);
  console.error('If this is a connection error, start Ollama first: `ollama serve` and `ollama pull qwen2.5:14b`.');
  process.exit(1);
});
