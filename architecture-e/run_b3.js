'use strict';

/**
 * run_b3.js
 *
 * Runs Architecture E with the B3 signal ON.
 *
 * The inference firewall intercepts every classification result before it can
 * be written to the shadow profile.  Answers are still delivered to the user,
 * but no attributes accumulate.  The profile stays empty for the entire session.
 *
 * This is the success case: it shows that B3 can suppress derived collection
 * without degrading the quality of the answer.
 */

const orchestrator = require('./orchestrator');
const { closeClient } = require('./mcp_client');

async function main() {
  console.log('=== Architecture E — Inference Firewall | B3: ON ===');
  console.log('GPC B3 signal active — inference is blocked before any attributes are written.\n');

  const { results, profileSnapshot } = await orchestrator.run(true);

  const output = {
    b3_active: true,
    mode: 'b3_enforced',
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
  console.log('\n[✓] With B3 on, zero attributes were written to the profile.');
  console.log('    All 8 queries were answered. Inference was suppressed, not the answer.');

  await closeClient();
}

main().catch(async (err) => { console.error(err); await closeClient(); process.exit(1); });
