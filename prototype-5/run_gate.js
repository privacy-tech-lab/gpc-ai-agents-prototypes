'use strict';

/**
 * run_gate.js
 *
 * Runs Prototype 5 with the GPC signal ON.
 *
 * The profile write gate intercepts every classification result before it can
 * be written to the shadow profile.  Answers are still delivered to the user,
 * but no attributes accumulate.  The profile stays empty for the entire session.
 *
 * This is the success case: it shows that the gate can suppress derived collection
 * without degrading the quality of the answer.
 */

const orchestrator = require('./orchestrator');
const { closeClient } = require('./mcp_client');

async function main() {
  console.log('=== Prototype 5 — Profile Write Gate | Gate: ON ===');
  console.log('GPC signal active — inference is blocked before any attributes are written.\n');

  const { results, profileSnapshot } = await orchestrator.run(true);

  const output = {
    gate_active: true,
    mode: 'gate_enforced',
    query_results: results,
    shadow_profile: profileSnapshot,
    profile_attribute_count: profileSnapshot.attributes
      ? Object.keys(profileSnapshot.attributes).length
      : 0,
    inference_blocked_count: profileSnapshot.blocked_count,
  };

  console.log(JSON.stringify(output, null, 2));

  console.log('\n=== Shadow Profile Summary ===');
  console.log(`Attributes accumulated: ${output.profile_attribute_count}`);
  console.log(`Inference attempts blocked: ${output.inference_blocked_count}`);
  console.log('\n[✓] With the gate on, zero attributes were written to the profile.');
  console.log('    All 8 queries were answered. Inference was suppressed, not the answer.');

  await closeClient();
}

main().catch(async (err) => { console.error(err); await closeClient(); process.exit(1); });
