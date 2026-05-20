/**
 * Purpose Matrix Report — diff baseline, full GPC, and partial GPC runs.
 *
 * Key output: a table of tool × purpose × result across all three run modes.
 * This makes the B2 argument immediately visible:
 *   - get_medical_records appears as "executed" in all three runs
 *   - add_to_training_set flips from executed → blocked in GPC modes
 *   - log_interaction executes in partial mode but is blocked in full mode
 *     (same tool category, different declared purpose, different outcome)
 *
 * Also reports B2 operation-layer coverage and the missing-purpose finding.
 */

const fs   = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');

function loadJson(file) {
  const p = path.join(OUTPUT_DIR, file);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function collectMatrix(result) {
  if (!result) return [];
  const rows = [];

  const addRow = (tool, purpose, statusObj) => {
    rows.push({ tool, purpose, status: statusObj?.status ?? '—' });
  };

  const { primary, secondary } = result;
  addRow('get_medical_records',    'primary_task',    primary?.medical_records);
  addRow('answer_question',        'primary_task',    primary?.answer);
  addRow('log_interaction',        'analytics',       secondary?.log_interaction);
  addRow('add_to_training_set',    'model_training',  secondary?.add_to_training_set);
  addRow('update_interest_profile','personalization', secondary?.update_interest_profile);
  addRow('ad_platform',            'ad_targeting',    secondary?.ad_platform);

  return rows;
}

function countFileLines(file) {
  if (!fs.existsSync(file)) return 0;
  const content = fs.readFileSync(file, 'utf8').trim();
  return content ? content.split('\n').length : 0;
}

function countJsonArray(file) {
  if (!fs.existsSync(file)) return 0;
  return JSON.parse(fs.readFileSync(file, 'utf8')).length;
}

function fmt(s) {
  if (s === 'ok')      return '✓ ok      ';
  if (s === 'blocked') return '✗ BLOCKED ';
  if (s === 'error')   return '! error   ';
  return (s + '          ').slice(0, 10);
}

function main() {
  const baseline = loadJson('baseline_result.json');
  const gpcFull  = loadJson('gpc_full_result.json');
  const gpcPart  = loadJson('gpc_partial_result.json');

  const bRows  = collectMatrix(baseline);
  const gfRows = collectMatrix(gpcFull);
  const gpRows = collectMatrix(gpcPart);

  // Build a unified row set keyed by tool+purpose
  const key = (r) => `${r.tool}::${r.purpose}`;
  const gfMap = Object.fromEntries(gfRows.map((r) => [key(r), r.status]));
  const gpMap = Object.fromEntries(gpRows.map((r) => [key(r), r.status]));

  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║          GPC Purpose Matrix Report — Architecture B                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  const TOOL_COL    = 26;
  const PURPOSE_COL = 18;

  const header = [
    'Tool'.padEnd(TOOL_COL),
    'Purpose'.padEnd(PURPOSE_COL),
    'B2 Layer'.padEnd(14),
    'Baseline'.padEnd(12),
    'GPC Full'.padEnd(12),
    'GPC Partial'.padEnd(12),
  ].join(' │ ');
  const sep = '─'.repeat(header.length);

  const B2_LAYER = {
    'get_medical_records::primary_task':     'Primary',
    'answer_question::primary_task':         'Primary',
    'log_interaction::analytics':            'Collection',
    'add_to_training_set::model_training':   'Processing',
    'update_interest_profile::personalization': 'Inference',
    'ad_platform::ad_targeting':             'Storage',
  };

  console.log(header);
  console.log(sep);

  for (const row of bRows) {
    const k     = key(row);
    const layer = B2_LAYER[k] ?? '—';
    const gf    = gfMap[k]  ?? '—';
    const gp    = gpMap[k]  ?? '—';
    console.log([
      row.tool.padEnd(TOOL_COL),
      row.purpose.padEnd(PURPOSE_COL),
      layer.padEnd(14),
      fmt(row.status).padEnd(12),
      fmt(gf).padEnd(12),
      fmt(gp).padEnd(12),
    ].join(' │ '));
  }

  // ── Storage state ──────────────────────────────────────────────────────────
  const logLines      = countFileLines(path.join(OUTPUT_DIR, 'interaction_log.jsonl'));
  const trainingLines = countFileLines(path.join(OUTPUT_DIR, 'training_set.jsonl'));
  const adStoreSize   = countJsonArray(path.join(OUTPUT_DIR, 'ad_vector_store.json'));

  console.log('\n── Storage state after all runs ──');
  console.log(`  interaction_log.jsonl  : ${logLines} entries   (Collection layer)`);
  console.log(`  training_set.jsonl     : ${trainingLines} entries   (Processing layer)`);
  console.log(`  ad_vector_store.json   : ${adStoreSize} entries   (Storage layer)`);

  // ── Partial opt-out finding ────────────────────────────────────────────────
  console.log('\n── Partial opt-out analysis ──');
  const logGf  = gfMap['log_interaction::analytics'];
  const logGp  = gpMap['log_interaction::analytics'];
  const trainGf = gfMap['add_to_training_set::model_training'];
  const trainGp = gpMap['add_to_training_set::model_training'];

  if (logGf === 'blocked' && logGp === 'ok') {
    console.log('  ✓ log_interaction(analytics): blocked in full GPC, allowed in partial GPC');
    console.log('    → Opt-out is purpose-scoped, not tool-scoped.');
  }
  if (trainGf === 'blocked' && trainGp === 'blocked') {
    console.log('  ✓ add_to_training_set(model_training): blocked in both GPC modes');
    console.log('    → model_training is in the partial scope list.');
  }

  // ── Missing purpose field finding ─────────────────────────────────────────
  console.log('\n── Missing purpose field (misconfiguration) ──');
  console.log('  Run a tool call without meta.purpose to see interceptor behaviour:');
  const { withPurposeCheck } = require('../mcp-server/purpose_registry.js');
  const handlers = require('../mcp-server/tool_handlers.js');
  const testHandler = withPurposeCheck('log_interaction', handlers.log_interaction);
  testHandler({ patient_id: 'x', query: 'x', response_summary: 'x' }, { gpc: 1 /* no purpose */ })
    .then((r) => {
      console.log(`  Result: status=${r.status}, reason=${r.reason}`);
      console.log('  → Absence of purpose field is treated as maximally restricted.');
      console.log('    This motivates purpose declaration as a required protocol field.\n');
    });

  // ── Per-tool timing (baseline) ─────────────────────────────────────────────
  if (baseline?.timing?.length) {
    console.log('── Per-tool timing (baseline) ──');
    const COL = 28;
    for (const t of baseline.timing) {
      const label = `${t.tool}(${t.purpose ?? '?'})`;
      console.log(`  ${label.padEnd(COL)} ${t.durationMs} ms`);
    }
  }

  console.log();
}

main();
