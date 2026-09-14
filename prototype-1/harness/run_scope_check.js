/**
 * Sends one request against the seeded user (user-42, Asia travel history
 * from harness/seed_demo.js) at whichever persistence scope is requested,
 * and writes the full pipeline output to disk. Varying --scope is what
 * makes D1 and D3 separately observable: run_baseline.js and run_gpc.js
 * never pass a persistence scope, so they never exercise the
 * get_interaction_history / user_profile_lookup gates in personalization.js.
 *
 * D2 (cross-session scope) is not modeled here. Its defining feature is
 * a within-session/cross-session split ("retain during this session, but
 * do not carry it into a future one"), and this prototype has no
 * within-session state to hold that boundary: each call is a single,
 * independent request/response against the same seeded user, with no
 * server-side session in between. See prototype-1/README.md,
 * "Opt-out categories depicted".
 *
 *   node run_scope_check.js                 # baseline: full continuity
 *   node run_scope_check.js --scope=d3      # raw history ok, no synthesized profile
 *   node run_scope_check.js --scope=d1      # nothing persists, nothing consulted
 */

const fs   = require('fs');
const path = require('path');
const { handleRequest, shutdown } = require('../orchestrator/orchestrator.js');

const VALID_SCOPES = ['d1', 'd3'];

async function main() {
  const scopeArg = process.argv.find((a) => a.startsWith('--scope='));
  const scope    = scopeArg ? scopeArg.split('=')[1] : undefined;

  if (scope && !VALID_SCOPES.includes(scope)) {
    console.error('Usage: node run_scope_check.js [--scope=d1|d3]  (omit --scope for baseline)');
    process.exit(1);
  }

  const label  = scope ?? 'baseline';
  const OUTPUT = path.join(__dirname, '..', 'output', `scope_${label}_result.json`);
  const timing = [];

  console.log(`=== Prototype 1: persistence scope = ${label} ===\n`);

  const result = await handleRequest({
    query:            'Help me plan a 3-day trip to Osaka and Kyoto',
    user_id:          'user-42',
    secGpc:           scope ? '1' : '',
    persistenceScope: scope,
    timing,
  });

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2));

  console.log('[Personalization]');
  console.log('  raw history consulted     :', result.personalization.historyConsulted);
  console.log('  synthesized profile used  :', result.personalization.profileConsulted);
  console.log('\n[Storage]');
  console.log('  stored :', result.storageResult.stored.join(', ') || '(none)');
  console.log('  blocked:', result.storageResult.blocked.join(', ') || '(none)');
  console.log('\n[Answer]\n', result.answer);
  console.log('\nOutput written to:', OUTPUT);

  await shutdown();
}

main().catch(async (err) => { console.error(err); await shutdown(); process.exit(1); });
