'use strict';

/**
 * run_baseline.js
 *
 * Runs Prototype 5 with the GPC signal OFF.
 *
 * Every query is processed by the inference engine, which writes inferred
 * attributes to the shadow profile.  By the end of the session the profile
 * contains a detailed picture of the user assembled entirely from search
 * queries — without any explicit disclosure on the user's part.
 *
 * This is the failure case: it demonstrates why the firewall is needed.
 */

const orchestrator = require('./orchestrator');
const { closeClient } = require('./mcp_client');

async function main() {
  console.log('=== Prototype 5 — Inference Firewall | Firewall: OFF (baseline) ===');
  console.log('Every query is classified and attributes are written to the shadow profile.\n');

  const { results, profileSnapshot } = await orchestrator.run(false);

  const output = {
    firewall_active: false,
    mode: 'baseline',
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
  console.log('\nProfile contents:');
  console.log(JSON.stringify(profileSnapshot.attributes, null, 2));
  console.log('\n[!] With firewall off, the system has built a detailed user profile from');
  console.log('    search queries alone — no explicit user disclosure required.');

  await closeClient();
}

main().catch(async (err) => { console.error(err); await closeClient(); process.exit(1); });
