'use strict';

/**
 * run_baseline.js
 *
 * No opt-outs. Both sessions are archived, session 2 is tailored from
 * session 1's disclosures, and the archive is synthesized into a durable
 * behavioral profile. This is the failure case the category exists to
 * prevent.
 */

const orchestrator = require('./orchestrator');

async function main() {
  console.log('=== Category D (Persistence): Aria | no opt-outs ===');
  console.log('Two sessions. Everything survives, everything connects.\n');

  const output = await orchestrator.run({});
  console.log(JSON.stringify(output, null, 2));

  const m = output.memory_snapshot;
  console.log('\n=== Persistence summary ===');
  console.log(`Archived sessions:   ${m.archive.entry_count}`);
  console.log(`Profile entries:     ${m.profile.entry_count}`);
  console.log('\nA vegetarian dinner question in one session became a targeted');
  console.log('restaurant pitch in the next and a durable behavioral profile after.');
}

main().catch(console.error);
