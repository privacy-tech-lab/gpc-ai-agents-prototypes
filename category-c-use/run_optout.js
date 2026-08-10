'use strict';

/**
 * run_optout.js
 *
 * Runs the session with Category C opt-outs asserted.
 *
 *   node run_optout.js --gpc               # assert the whole category
 *   node run_optout.js --scope=c3          # assert one subtype
 *   node run_optout.js --scope=c1,c4       # assert any subset
 *
 * c1 implies c1a and c2 implies c2a. The answer is identical in every mode.
 */

const orchestrator = require('./orchestrator');

async function main() {
  const gpc = process.argv.includes('--gpc');
  const scopeArg = process.argv.find(a => a.startsWith('--scope='));
  const scope = scopeArg ? scopeArg.split('=')[1].split(',').filter(Boolean) : [];

  if (!gpc && scope.length === 0) {
    console.error('Usage: node run_optout.js --gpc | --scope=c1,c1a,c2,c2a,c3,c4');
    process.exit(1);
  }

  const label = scope.length > 0 ? `scope: ${scope.join(', ')}` : 'GPC: full category';
  console.log(`=== Category C (Use): HealthAssist | ${label} ===\n`);

  const output = await orchestrator.run({ gpc, scope });
  console.log(JSON.stringify(output, null, 2));

  const s = output.outputs_snapshot;
  console.log('\n=== Use summary ===');
  console.log(`Opt-outs active: ${output.optouts.join(', ')}`);
  for (const [name, snap] of Object.entries(s)) {
    console.log(`${name.padEnd(24)} entries: ${snap.entry_count}  blocked: ${snap.blocked_count}`);
  }
  console.log('\nThe answer was returned unchanged. Out-of-context use was restricted,');
  console.log('not the task.');
}

main().catch(console.error);
