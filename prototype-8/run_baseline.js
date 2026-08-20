'use strict';

/**
 * run_baseline.js
 *
 * The violation baseline: the platform treats its own vendor defaults as
 * consent and the agent resolves everything unilaterally, including the
 * non-refundable booking, the passport transfer, and two actions the user
 * never tiered at all.
 */

const orchestrator = require('./orchestrator');
const { closeClient } = require('./mcp_client');

async function main() {
  console.log('=== Category E (Delegation): TripPilot | silent baseline ===');
  console.log('Vendor defaults treated as consent. The agent decides everything.\n');

  const output = await orchestrator.run({ silent: true });
  console.log(JSON.stringify(output, null, 2));

  console.log('\n=== Delegation summary ===');
  console.log(`Actions executed:   ${output.tally.executed ?? 0} of ${output.results.length}`);
  console.log(`E1 violations:      ${output.violations.join(', ')}`);
  console.log('\nThe agent charged a card, shipped passport data, enabled tracking,');
  console.log('and subscribed the user to a mailing list, all without standing.');

  await closeClient();
}

main().catch(console.error);
