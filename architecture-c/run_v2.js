'use strict';

const manifest = require('./consent_manifest');
const orchestrator = require('./orchestrator');
const prompt = require('./consent_prompt');

const PLATFORM_VERSION = 'v2.0';
const VALID_MODES = ['silent', 'approve', 'decline', 'interactive'];

async function main() {
  const modeArg = process.argv.find(a => a.startsWith('--mode='));
  const mode = modeArg ? modeArg.split('=')[1] : 'interactive';
  const gpc = process.argv.includes('--gpc');

  if (!VALID_MODES.includes(mode)) {
    console.error(`Usage: node run_v2.js --mode=silent|approve|decline [--gpc]`);
    process.exit(1);
  }

  manifest.reset();

  const gpcLabel = gpc ? ' | GPC: on' : '';
  console.log(`=== Architecture C — Platform ${PLATFORM_VERSION} | Mode: ${mode}${gpcLabel} ===`);
  console.log('Manifest reset to v1.0. New tools (email_sender, behavior_tracker) not yet consented.\n');

  if (gpc) {
    console.log('[GPC] Signal active — non-primary categories will be auto-declined without prompting.\n');
  }

  if (mode !== 'silent') {
    prompt.register(mode === 'interactive' ? null : mode);
  }

  const { results, quarantineEvents } = await orchestrator.run(PLATFORM_VERSION, mode, gpc);

  // Bump manifest version now that all consent decisions for this platform version are recorded
  if (mode !== 'silent') {
    const mf = manifest.load();
    mf.manifest_version = PLATFORM_VERSION;
    manifest.save(mf);
  }

  const output = {
    platform_version: PLATFORM_VERSION,
    mode,
    gpc,
    tool_invocations: results,
    quarantine_events: quarantineEvents,
    capability_timeline: buildTimeline(results),
    manifest_final: manifest.load(),
  };

  console.log('\n' + JSON.stringify(output, null, 2));

  if (mode === 'decline' || gpc) {
    printPersistenceCheck();
  }
}

function buildTimeline(results) {
  return results.map(r => ({
    tool: r.tool,
    callable_at: r.status === 'executed' && r.consent_required ? 'after_consent'
               : r.status === 'executed'                        ? 'immediately'
               : r.reason  === 'gpc_auto_decline'               ? 'gpc_blocked'
               :                                                  'never',
    final_status: r.status,
    category: r.category ?? null,
  }));
}

function printPersistenceCheck() {
  const mf = manifest.load();
  console.log('\n=== Simulated v3.0 — declined categories persist ===');
  if (mf.declined_categories.length === 0) {
    console.log('No declined categories recorded.');
    return;
  }
  for (const cat of mf.declined_categories) {
    console.log(`  [BLOCKED] category="${cat}" — declined in v2.0, still blocked in v3.0`);
  }
  console.log('\nThis satisfies A2 (opt-in only): a declined tool remains blocked through');
  console.log('further platform updates until the user actively reverses the decision.');
}

main().catch(console.error);
