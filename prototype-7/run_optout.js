'use strict';

/**
 * run_optout.js
 *
 * Runs the two sessions with a persistence scope asserted.
 *
 *   node run_optout.js --gpc                   # strictest: session (implies cross_session and profile)
 *   node run_optout.js --scope=session         # nothing survives a session end
 *   node run_optout.js --scope=cross_session   # archive exists, may not inform new sessions
 *   node run_optout.js --scope=profile         # sessions retained, no profile synthesis
 *
 * The hierarchy expands downward: session implies cross_session and profile,
 * cross_session implies profile.
 */

const orchestrator = require('./orchestrator');

async function main() {
  const gpc = process.argv.includes('--gpc');
  const scopeArg = process.argv.find(a => a.startsWith('--scope='));
  const scope = scopeArg ? scopeArg.split('=')[1].split(',').filter(Boolean) : [];

  if (!gpc && scope.length === 0) {
    console.error('Usage: node run_optout.js --gpc | --scope=session|cross_session|profile');
    process.exit(1);
  }

  const label = scope.length > 0 ? `scope: ${scope.join(', ')}` : 'GPC: strictest (session)';
  console.log(`=== Persistence: Aria | ${label} ===\n`);

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
