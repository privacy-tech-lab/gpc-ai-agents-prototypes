'use strict';

/**
 * run_agent.js: live LLM demo (requires Ollama).
 *
 * A real model plans the trip; the delegation gate decides which of its
 * calls run, which are surfaced, and which are declined. Flags set the
 * enforcement config; the model never controls them.
 *
 *   node run_agent.js                 # attended, surfaced asks approved
 *   node run_agent.js --unattended    # nobody available: high-stakes calls declined
 *   node run_agent.js --gpc           # vendor defaults void
 *
 * Needs Ollama running (`ollama serve`) with the model pulled
 * (`ollama pull qwen2.5:14b`). Override with OLLAMA_MODEL.
 */

const agent = require('./agent');
const { closeClient } = require('./mcp_client');

function fmt(r) {
  const reason = r.reason ? ` (${r.reason})` : '';
  const source = r.tier_source ? ` [${r.tier}, ${r.tier_source}]` : '';
  return `${r.action.padEnd(22)} -> ${r.status}${reason}${source}`;
}

async function main() {
  const gpc = process.argv.includes('--gpc');
  const unattended = process.argv.includes('--unattended');
  const respondArg = process.argv.find(a => a.startsWith('--respond='));
  const respond = respondArg ? respondArg.split('=')[1] : 'approve';

  const label = [unattended ? 'unattended' : 'attended', gpc ? 'GPC: on' : null]
    .filter(Boolean)
    .join(' | ');
  console.log(`=== Category E (Delegation): LLM agent | ${label} ===`);
  console.log('A real model plans; the delegation manifest decides its standing.\n');

  const { agentResult, delegationLog } = await agent.runSession({
    gpc,
    userPresent: !unattended,
    respond,
  });

  console.log('--- Delegation decisions (agent calls, then platform actions) ---');
  for (const r of delegationLog) console.log(`  ${fmt(r)}`);

  console.log('\n--- Agent final response ---');
  console.log(agentResult.finalResponse || '(none)');

  await closeClient();
}

main().catch(err => {
  console.error(`\n[run_agent] ${err.message}`);
  console.error('If this is a connection error, start Ollama first: `ollama serve` and `ollama pull qwen2.5:14b`.');
  process.exit(1);
});
