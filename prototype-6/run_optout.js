'use strict';

/**
 * run_optout.js
 *
 * Runs the session with collection preferences asserted.
 *
 *   node run_optout.js --gpc                     # assert all three (input + behavior + derived)
 *   node run_optout.js --scope=derived           # assert one scope
 *   node run_optout.js --scope=input,behavior    # assert any subset
 *
 * The task output is identical in every mode; only what the platform keeps
 * changes.
 */

const orchestrator = require('./orchestrator');
const { closeClient } = require('./mcp_client');

async function main() {
  const gpc = process.argv.includes('--gpc');
  const scopeArg = process.argv.find(a => a.startsWith('--scope='));
  const scope = scopeArg ? scopeArg.split('=')[1].split(',').filter(Boolean) : [];

  if (!gpc && scope.length === 0) {
    console.error('Usage: node run_optout.js --gpc | --scope=input,behavior,derived');
    process.exit(1);
  }

  const label = scope.length > 0 ? `scope: ${scope.join(', ')}` : 'GPC: all scopes';
  console.log(`=== Collection: ComposeMate | ${label} ===\n`);

  const output = await orchestrator.run({ gpc, scope });
  console.log(JSON.stringify(output, null, 2));

  const s = output.stores_snapshot;
  console.log('\n=== Collection summary ===');
  console.log(`Preferences active:     ${output.optouts.join(', ')}`);
  console.log(`Input log entries:      ${s.input_log.entry_count} (blocked: ${s.input_log.blocked_count})`);
  console.log(`Behavior log entries:   ${s.behavior_log.entry_count} (blocked: ${s.behavior_log.blocked_count})`);
  console.log(`Profile attributes:     ${s.derived_profile.attribute_count} (blocked: ${s.derived_profile.blocked_count})`);
  console.log('\nThe polished email was returned unchanged. Collection was suppressed,');
  console.log('not the answer.');

  await closeClient();
}

main().catch(console.error);
