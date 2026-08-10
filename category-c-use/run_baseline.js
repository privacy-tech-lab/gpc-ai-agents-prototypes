'use strict';

/**
 * run_baseline.js
 *
 * No opt-outs. One health question feeds an insurance risk model, a
 * personalization profile, analytics, a pharma ad queue, a training set, and
 * two chain transfers carrying the full health payload. This is the failure
 * case the category exists to prevent.
 */

const orchestrator = require('./orchestrator');

async function main() {
  console.log('=== Category C (Use): HealthAssist | no opt-outs ===');
  console.log('One blood pressure question. Every downstream use runs.\n');

  const output = await orchestrator.run({});
  console.log(JSON.stringify(output, null, 2));

  const s = output.outputs_snapshot;
  console.log('\n=== Use summary ===');
  for (const [name, snap] of Object.entries(s)) {
    console.log(`${name.padEnd(24)} entries: ${snap.entry_count}  blocked: ${snap.blocked_count}`);
  }
  console.log('\nThe marketing vendor received the full health context it had no');
  console.log('task reason to see.');
}

main().catch(console.error);
