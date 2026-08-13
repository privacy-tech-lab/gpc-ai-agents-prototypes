'use strict';

/**
 * run_agent.js: live LLM demo (requires Ollama).
 *
 * A real model plays Aria in session 2. What it can remember about session 1
 * is decided by the persistence gate behind the recall_memory tool. Flags set
 * the enforcement config; the model never controls them.
 *
 *   node run_agent.js                 # no opt-outs: tailored suggestion
 *   node run_agent.js --gpc           # strictest (d1): clean slate
 *   node run_agent.js --scope=d2      # archive exists, recall refused
 *   node run_agent.js --scope=d3      # recall works, no profile synthesis
 *
 * Needs Ollama running (`ollama serve`) with the model pulled
 * (`ollama pull qwen2.5:14b`). Override with OLLAMA_MODEL.
 */

const agent = require('./agent');

function fmt(c) {
  const reason = c.reason ? ` (${c.reason})` : '';
  const id = c.session_id ? ` ${c.session_id}` : '';
  return `${c.checkpoint}${id} -> ${c.status}${reason}`;
}

async function main() {
  const gpc = process.argv.includes('--gpc');
  const scopeArg = process.argv.find(a => a.startsWith('--scope='));
  const scope = scopeArg ? scopeArg.split('=')[1].split(',').filter(Boolean) : [];

  const label = scope.length > 0 ? `scope: ${scope.join(',')}` : gpc ? 'GPC: on (d1)' : 'no opt-outs';
  console.log(`=== Category D (Persistence): LLM agent | ${label} ===`);
  console.log('A real model asks the persistence gate what it may remember.\n');

  const { agentResult, checkpoints, memory_snapshot } = await agent.runSession({ gpc, scope });

  console.log('--- Persistence checkpoints ---');
  for (const c of checkpoints) console.log(`  ${fmt(c)}`);

  console.log('\n--- Agent final response (session 2) ---');
  console.log(agentResult.finalResponse || '(none)');

  console.log('\n--- Memory (final) ---');
  console.log(JSON.stringify(memory_snapshot, null, 2));
}

main().catch(err => {
  console.error(`\n[run_agent] ${err.message}`);
  console.error('If this is a connection error, start Ollama first: `ollama serve` and `ollama pull qwen2.5:14b`.');
  process.exit(1);
});
