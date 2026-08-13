'use strict';

/**
 * run_optout.js
 *
 * Runs the trip with E1 enforced through the delegation manifest.
 *
 *   node run_optout.js                          # user present, approves surfaced asks
 *   node run_optout.js --respond=decline        # user present, declines surfaced asks
 *   node run_optout.js --unattended             # nobody available: surfaced asks are declined
 *   node run_optout.js --gpc                    # vendor defaults void; only user tiers count
 *   node run_optout.js --gpc --unattended       # strictest combination
 */

const orchestrator = require('./orchestrator');
const { closeClient } = require('./mcp_client');

async function main() {
  const gpc = process.argv.includes('--gpc');
  const unattended = process.argv.includes('--unattended');
  const respondArg = process.argv.find(a => a.startsWith('--respond='));
  const respond = respondArg ? respondArg.split('=')[1] : 'approve';

  const label = [
    unattended ? 'unattended' : `attended, responds ${respond}`,
    gpc ? 'GPC: on' : null,
  ]
    .filter(Boolean)
    .join(' | ');
  console.log(`=== Category E (Delegation): TripPilot | E1 enforced | ${label} ===\n`);

  const output = await orchestrator.run({ gpc, userPresent: !unattended, respond });
  console.log(JSON.stringify(output, null, 2));

  console.log('\n=== Delegation summary ===');
  for (const r of output.results) {
    const reason = r.reason ? ` (${r.reason})` : '';
    console.log(`${r.action.padEnd(22)} ${r.status}${reason}  [tier: ${r.tier}, source: ${r.tier_source}]`);
  }
  console.log('\nDiscretion was calibrated to what is at stake, not granted wholesale.');

  await closeClient();
}

main().catch(console.error);
