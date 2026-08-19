/**
 * Cross-architecture comparison — Phase 5.
 *
 * Runs both architectures' compare scripts as sub-processes and prints their
 * outputs, then prints a structured side-by-side summary of enforcement model,
 * opt-out granularity, and signal-drop failure modes.
 *
 * Usage:
 *   node compare_architectures.js          # structural summary only
 *   node compare_architectures.js --run    # also run each arch's compare script
 */

const { execSync }  = require('child_process');
const fs            = require('fs');
const path          = require('path');

const ROOT  = __dirname;
const ARCH_A = path.join(ROOT, 'prototype-1');
const ARCH_B = path.join(ROOT, 'prototype-2');
const RUN    = process.argv.includes('--run');

// ── Sub-process helpers ───────────────────────────────────────────────────────

function runCompare(archDir, label) {
  const scriptPath = path.join(archDir, 'harness', 'compare_results.js');
  console.log(`\n${'═'.repeat(76)}`);
  console.log(`  ${label}`);
  console.log('═'.repeat(76));
  try {
    const output = execSync(`node ${scriptPath}`, { cwd: archDir, timeout: 30000 }).toString();
    console.log(output);
  } catch (err) {
    const msg = err.stdout?.toString() || err.message;
    console.log(msg);
    if (err.stderr?.toString()) {
      console.error('[stderr]', err.stderr.toString().slice(0, 400));
    }
    console.log(`  (Some output files may be missing — run 'npm run demo' inside ${path.basename(archDir)} first)\n`);
  }
}

// ── Output file readers ───────────────────────────────────────────────────────

function loadJson(archDir, file) {
  const p = path.join(archDir, 'output', file);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function countLines(archDir, file) {
  const p = path.join(archDir, 'output', file);
  if (!fs.existsSync(p)) return null;
  const content = fs.readFileSync(p, 'utf8').trim();
  return content ? content.split('\n').length : 0;
}

function countArray(archDir, file) {
  const p = path.join(archDir, 'output', file);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')).length; } catch { return null; }
}

// ── Formatting helpers ────────────────────────────────────────────────────────

const W = 38; // column width for side-by-side

function row(label, valA, valB) {
  const l = String(label).padEnd(22);
  const a = String(valA ?? '—').padEnd(W);
  const b = String(valB ?? '—');
  console.log(`  ${l}  ${a}  ${b}`);
}

function divider(title) {
  console.log(`\n── ${title} ${'─'.repeat(73 - title.length - 4)}`);
}

function heading(title) {
  console.log(`\n╔${'═'.repeat(74)}╗`);
  console.log(`║  ${title.padEnd(72)}║`);
  console.log(`╚${'═'.repeat(74)}╝`);
}

// ── Detect signal-drop failure modes from output files ───────────────────────

function archASignalDrop() {
  const sd = loadJson(ARCH_A, 'signal_drop_result.json');
  if (!sd) return { available: false };
  const d = sd.data ?? {};
  const mcpRan = ['user_profile_lookup', 'log_interaction', 'save_to_profile']
    .filter((t) => d[t]?.status === 'ok');
  const jwtHeld = d.third_party_store?.status === 'blocked';
  return { available: true, mcpBypass: mcpRan.length > 0, jwtHeld, toolsRan: mcpRan };
}

function archBSignalDrop() {
  const sd = loadJson(ARCH_B, 'signal_drop_result.json');
  if (!sd) return { available: false };
  const bRows = sd.scenarioB?.rows ?? [];
  const cRows = sd.scenarioC?.rows ?? [];
  const secondaryBypassed = bRows.filter((r) => r.purpose !== 'primary_task' && r.status === 'ok').map((r) => r.tool);
  const primaryBlocked    = cRows.find((r) => r.tool === 'get_medical_records')?.status === 'blocked';
  return { available: true, secondaryBypassed, primaryBlocked };
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  if (RUN) {
    runCompare(ARCH_A, 'Architecture A — compare_results.js');
    runCompare(ARCH_B, 'Architecture B — compare_results.js');
  }

  // ── Structural comparison ─────────────────────────────────────────────────
  heading('GPC Enforcement: Architecture A vs Architecture B');

  const COL_A = 'Architecture A'.padEnd(W);
  const COL_B = 'Architecture B';
  console.log(`\n  ${''.padEnd(22)}  ${COL_A}  ${COL_B}`);
  console.log('  ' + '─'.repeat(22 + 2 + W + 2 + W));

  divider('Overview');
  row('Scenario',         'Travel assistant',                  'Medical assistant');
  row('Enforcement unit', 'Tool (withGpc)',                    'Tool × purpose (withPurposeCheck)');
  row('Opt-out model',    'Binary: GPC on/off per tool',       'Graduated: per purpose string');
  row('Partial opt-out',  'No',                                'Yes (gpc_scope= pipe-delimited list)');
  row('Trust boundary',   'RS256 JWT (Layer 3)',               'Ad platform HTTP check (service bdry)');
  row('Primary task',     'Always executes',                   'Always executes');

  divider('Enforcement granularity');
  row('Scope of a block', 'Entire tool blocked',               'Only the declared purpose blocked');
  row('Example',          'user_profile_lookup blocked wholly','get_medical_records runs for primary_task;');
  row('',                 '',                                  'blocked only for personalization purpose');
  row('Purpose taxonomy', 'None — tool identity only',         'B2: analytics|model_training|personalization');
  row('',                 '',                                  'C: cross_context_sale|cross_context_sharing');
  row('',                 '',                                  'D: sensitive_data_inference');
  row('B2 layer coverage','None',                              'Collection → Processing → Inference → Storage');
  row('C/D layer coverage','None',                             'Cross-context sale/sharing + temporal inference');

  divider('Signal-drop failure modes');
  const sdA = archASignalDrop();
  const sdB = archBSignalDrop();

  row('Fields required',  '1 (_meta)',                         '2 (meta.gpc + meta.purpose)');

  if (sdA.available) {
    const mcpMsg = sdA.mcpBypass
      ? `Layer 4 FAILS: ${sdA.toolsRan.join(', ')} run`
      : 'Layer 4 holds';
    const jwtMsg = sdA.jwtHeld ? 'Layer 3 holds (JWT)' : 'Layer 3 fails';
    row('Strip _meta',       `${mcpMsg}`, `N/A`);
    row('',                  `${jwtMsg}`, '');
  } else {
    row('Strip _meta',       'Run signal-drop to see',          'N/A');
  }

  if (sdB.available) {
    const bypassMsg = sdB.secondaryBypassed.length > 0
      ? `SILENT BYPASS: ${sdB.secondaryBypassed.length} secondary tools run`
      : 'No bypass detected';
    const overMsg = sdB.primaryBlocked
      ? 'OVER-BLOCK: primary task blocked'
      : 'Primary not blocked';
    row('Strip meta.gpc',    'N/A',                             bypassMsg);
    row('Strip meta.purpose','N/A',                             overMsg);
  } else {
    row('Strip meta.gpc',    'N/A',                             'Run signal-drop to see');
    row('Strip meta.purpose','N/A',                             'Run signal-drop to see');
  }

  row('Silent failure?',   'Yes (strip _meta)',                'Yes (strip meta.gpc)');
  row('Detectable failure?','No — JWT catches vendor write',   'Yes (strip meta.purpose → over-blocks)');

  divider('Storage impact (from output files)');
  const aLog     = countLines(ARCH_A, 'interaction_log.jsonl');
  const aVec     = countArray(ARCH_A, 'vector_store.json');
  const bLog     = countLines(ARCH_B, 'interaction_log.jsonl');
  const bTrain   = countLines(ARCH_B, 'training_set.jsonl');
  const bAdStore = countArray(ARCH_B, 'ad_vector_store.json');
  const bBroker  = countLines(ARCH_B, 'data_broker_export.jsonl');
  const bInfer   = fs.existsSync(path.join(ARCH_B, 'output', 'inferred_attributes.json'));

  row('interaction_log entries',  aLog  ?? '(not run)', bLog    ?? '(not run)');
  row('vector_store / ad_store',  aVec  ?? '(not run)', bAdStore ?? '(not run)');
  if (bTrain !== null)   row('training_set entries',  '—',                bTrain);
  if (bBroker !== null)  row('data_broker_export',    '—',                bBroker);
  if (bInfer)            row('inferred_attributes',   '—',                'present');

  divider('Conclusion');
  console.log();
  console.log('  Architecture A establishes that the GPC signal survives a multi-agent');
  console.log('  pipeline and is enforced at the MCP layer.  Its failure mode (stripping');
  console.log('  _meta) is silent — a rogue agent can bypass enforcement with no visible');
  console.log('  signal, motivating a spec-level propagation requirement.');
  console.log();
  console.log('  Architecture B demonstrates that purpose-scoped enforcement produces');
  console.log('  finer-grained control: the same tool behaves differently depending on');
  console.log('  the declared downstream use, and a user can opt out of cross-context');
  console.log('  sale (C) or sensitive inference (D) without disrupting operational');
  console.log('  analytics (B2).  This is structurally impossible with tool-level blocking.');
  console.log();
  console.log('  Architecture B also shows that its additional required field (purpose)');
  console.log('  introduces a second failure mode.  The dangerous mode — stripping gpc —');
  console.log('  is still silent.  The less dangerous mode — stripping purpose — is');
  console.log('  detectable because it over-blocks, breaking the primary task.');
  console.log();
  console.log('  Both architectures converge on the same protocol requirement:');
  console.log('  purpose (and the GPC signal) must be propagated as a mandatory,');
  console.log('  verifiable field in MCP or any successor agent communication protocol.');
  console.log();
}

main();
