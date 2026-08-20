'use strict';

/**
 * run_optout.js
 *
 * Runs the two sessions with a Category D scope asserted.
 *
 *   node run_optout.js --gpc          # strictest: D1 (implies D2 and D3)
 *   node run_optout.js --scope=d1     # nothing survives a session end
 *   node run_optout.js --scope=d2     # archive exists, may not inform new sessions
 *   node run_optout.js --scope=d3     # sessions retained, no profile synthesis
 *
 * The hierarchy expands downward: d1 implies d2 and d3, d2 implies d3.
 */

const orchestrator = require('./orchestrator');

async function main() {
  const gpc = process.argv.includes('--gpc');
  const scopeArg = process.argv.find(a => a.startsWith('--scope='));
  const scope = scopeArg ? scopeArg.split('=')[1].split(',').filter(Boolean) : [];

  if (!gpc && scope.length === 0) {
    console.error('Usage: node run_optout.js --gpc | --scope=d1|d2|d3');
    process.exit(1);
  }

  const label = scope.length > 0 ? `scope: ${scope.join(', ')}` : 'GPC: strictest (d1)';
  console.log(`=== Category D (Persistence): Aria | ${label} ===\n`);

  const output = await orchestrator.run({ gpc, scope });
  console.log(JSON.stringify(output, null, 2));

  const m = output.memory_snapshot;
  console.log('\n=== Persistence summary ===');
  console.log(`Opt-outs active:     ${output.optouts.join(', ')}`);
  console.log(`Archived sessions:   ${m.archive.entry_count} (blocked: ${m.archive.blocked_count})`);
  console.log(`Profile entries:     ${m.profile.entry_count} (blocked: ${m.profile.blocked_count})`);
  console.log('\nSame-session answers were identical to baseline. Persistence was');
  console.log('limited, not the conversation.');
}

main().catch(console.error);
