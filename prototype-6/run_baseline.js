'use strict';

/**
 * run_baseline.js
 *
 * No privacy preferences. The platform keeps everything: the raw submission, the
 * composition telemetry, and the derived attributes. This is the
 * failure case the preferences exist to prevent.
 */

const orchestrator = require('./orchestrator');
const { closeClient } = require('./mcp_client');

async function main() {
  console.log('=== Collection: ComposeMate | no preferences ===');
  console.log('The user polishes one email. The platform collects on all three surfaces.\n');

  const output = await orchestrator.run({});
  console.log(JSON.stringify(output, null, 2));

  const s = output.stores_snapshot;
  console.log('\n=== Collection summary ===');
  console.log(`Input log entries:      ${s.input_log.entry_count}`);
  console.log(`Behavior log entries:   ${s.behavior_log.entry_count}`);
  console.log(`Profile attributes:     ${s.derived_profile.attribute_count}`);
  console.log('\nOne polished email cost the user a stored draft, three telemetry');
  console.log('events, and four inferred attributes, two of them from a sentence');
  console.log('the user deleted before submitting.');

  await closeClient();
}

main().catch(console.error);
