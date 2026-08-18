/**
 * Session 2: a follow-up request against the same seeded user (user-42,
 * Asia travel history from harness/seed_demo.js), run at whichever
 * Category D tier is requested. This is what makes D1/D2/D3 separately
 * observable — a single-session demo has no continuity to selectively
 * restrict in the first place.
 *
 *   node run_session2.js                 # baseline — full continuity
 *   node run_session2.js --scope=d3      # raw history ok, no synthesized profile
 *   node run_session2.js --scope=d2      # writes ok, no consultation at all
 *   node run_session2.js --scope=d1      # nothing persists, nothing consulted
 */

const fs   = require('fs');
const path = require('path');
const { handleRequest, shutdown } = require('../orchestrator/orchestrator.js');

const VALID_SCOPES = ['d1', 'd2', 'd3'];

async function main() {
  const scopeArg = process.argv.find((a) => a.startsWith('--scope='));
  const scope    = scopeArg ? scopeArg.split('=')[1] : undefined;

  if (scope && !VALID_SCOPES.includes(scope)) {
    console.error('Usage: node run_session2.js [--scope=d1|d2|d3]  (omit --scope for baseline)');
    process.exit(1);
  }

  const label  = scope ?? 'baseline';
  const OUTPUT = path.join(__dirname, '..', 'output', `session2_${label}_result.json`);
  const timing = [];

  console.log(`=== Architecture A — Session 2 | Category D scope: ${label} ===\n`);

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
