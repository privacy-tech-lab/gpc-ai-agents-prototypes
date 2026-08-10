'use strict';

/**
 * run_agent.js: live LLM demo (requires Ollama).
 *
 * A real model answers the health question; the platform then attempts its
 * downstream uses and the chain hops through the use gate. Flags set the
 * enforcement config; the model never controls them.
 *
 *   node run_agent.js                 # no opt-outs, every use runs
 *   node run_agent.js --gpc           # whole category asserted
 *   node run_agent.js --scope=c4      # chain minimization only
 *
 * Needs Ollama running (`ollama serve`) with the model pulled
 * (`ollama pull qwen2.5:14b`). Override with OLLAMA_MODEL.
 */

const agent = require('./agent');

function fmt(r) {
  const reason = r.reason ? ` (${r.reason})` : '';
  const fields = r.fields_sent ? ` [fields: ${r.fields_sent.join(', ') || 'none'}]` : '';
  return `${(r.use ?? r.hop).padEnd(28)} -> ${r.status}${reason}${fields}`;
}

async function main() {
  const gpc = process.argv.includes('--gpc');
  const scopeArg = process.argv.find(a => a.startsWith('--scope='));
  const scope = scopeArg ? scopeArg.split('=')[1].split(',').filter(Boolean) : [];

  const label = scope.length > 0 ? `scope: ${scope.join(',')}` : gpc ? 'GPC: on' : 'no opt-outs';
  console.log(`=== Category C (Use): LLM agent | ${label} ===`);
  console.log('A real model answers; the use gate decides every downstream use.\n');

  const { agentResult, useResults, chainResults, outputs_snapshot } = await agent.runSession({
    gpc,
    scope,
  });

  console.log('--- Downstream use attempts (platform-side) ---');
  for (const r of useResults) console.log(`  ${fmt(r)}`);

  console.log('\n--- Sub-agent chain (C4) ---');
  for (const r of chainResults) console.log(`  ${fmt(r)}`);

  console.log('\n--- Agent final response (the task output) ---');
  console.log(agentResult.finalResponse || '(none)');

  console.log('\n--- Outputs (final) ---');
  console.log(JSON.stringify(outputs_snapshot, null, 2));
}

main().catch(err => {
  console.error(`\n[run_agent] ${err.message}`);
  console.error('If this is a connection error, start Ollama first: `ollama serve` and `ollama pull qwen2.5:14b`.');
  process.exit(1);
});
