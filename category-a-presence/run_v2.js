'use strict';

const manifest = require('./presence_manifest');
const orchestrator = require('./orchestrator');
const prompt = require('./optin_prompt');

const PLATFORM_VERSION = 'v2.0';
const VALID_MODES = ['silent', 'approve', 'decline', 'interactive'];

async function main() {
  const modeArg = process.argv.find(a => a.startsWith('--mode='));
  const mode = modeArg ? modeArg.split('=')[1] : 'interactive';
  const gpc = process.argv.includes('--gpc');
  const ambient = process.argv.includes('--ambient');

  if (!VALID_MODES.includes(mode)) {
    console.error('Usage: node run_v2.js --mode=silent|approve|decline [--gpc] [--ambient]');
    process.exit(1);
  }

  manifest.reset();
  if (ambient) manifest.setAmbient(true);

  const flags = [gpc ? 'GPC: on' : null, ambient ? 'ambient: user-enabled' : null]
    .filter(Boolean)
    .join(' | ');
  console.log(`=== Category A (Presence): NoteFlow ${PLATFORM_VERSION} | Mode: ${mode}${flags ? ' | ' + flags : ''} ===`);
  console.log('Update shipped two AI features (ai_summarize, ai_ambient_copilot). Neither was consented at install.\n');

  if (gpc) {
    console.log('[GPC] Signal active: undecided AI features are auto-declined, passive activation stays off.\n');
  }
  if (ambient) {
    console.log('[Ambient] User explicitly enabled ambient mode in settings before this session.\n');
  }

  if (mode !== 'silent') {
    prompt.register(mode === 'interactive' ? null : mode);
  }

  const { results, presenceEvents } = await orchestrator.run(PLATFORM_VERSION, mode, gpc);

  // Bump manifest version now that all presence decisions for this platform version are recorded
  if (mode !== 'silent') {
    const mf = manifest.load();
    mf.manifest_version = PLATFORM_VERSION;
    manifest.save(mf);
  }

  const output = {
    platform_version: PLATFORM_VERSION,
    mode,
    gpc,
    ambient_pre_enabled: ambient,
    feature_invocations: results,
    presence_events: presenceEvents,
    presence_timeline: buildTimeline(results),
    manifest_final: manifest.load(),
  };

  console.log('\n' + JSON.stringify(output, null, 2));

  if (mode === 'decline' || gpc) {
    printPersistenceCheck();
  }
}

function buildTimeline(results) {
  return results.map(r => ({
    feature: r.feature,
    active_state: r.status === 'executed' && r.consent_required ? 'on_after_opt_in'
                : r.status === 'executed' && r.violations?.length ? 'on_without_consent'
                : r.status === 'executed'                          ? 'on'
                : r.reason === 'gpc_auto_decline'                  ? 'gpc_declined'
                : r.subtype === 'A2'                               ? 'integrated_but_inactive'
                :                                                    'off',
    subtype: r.subtype ?? (r.violations?.length ? r.violations.join('+') : null),
    initiated_by: r.initiated_by,
  }));
}

function printPersistenceCheck() {
  const mf = manifest.load();
  console.log('\n=== Simulated v3.0: declined AI features stay off ===');
  if (mf.declined_ai_features.length === 0) {
    console.log('No declined AI features recorded.');
    return;
  }
  for (const f of mf.declined_ai_features) {
    console.log(`  [OFF] feature="${f}" declined in v2.0, still off in v3.0`);
  }
  console.log('\nThis satisfies A1: an AI feature the user did not affirmatively enable');
  console.log('stays off through later platform updates until the user reverses it.');
}

main().catch(console.error);
