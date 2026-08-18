/**
 * Diff the three scenario outputs and print a human-readable report.
 */

const fs   = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');

function loadJson(file) {
  const p = path.join(OUTPUT_DIR, file);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function countLines(file) {
  if (!fs.existsSync(file)) return 0;
  const content = fs.readFileSync(file, 'utf8').trim();
  return content ? content.split('\n').length : 0;
}

function countEntries(file) {
  if (!fs.existsSync(file)) return 0;
  return JSON.parse(fs.readFileSync(file, 'utf8')).length;
}

function main() {
  const baseline = loadJson('baseline_result.json');
  const gpc      = loadJson('gpc_result.json');
  const partial  = loadJson('partial_result.json');

  if (!baseline || !gpc || !partial) {
    console.error('Run all three scenarios first: npm run baseline && npm run gpc && npm run partial');
    process.exit(1);
  }

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║       GPC Propagation Report — Architecture B                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const COL    = 18;
  const header = ['Pipeline'.padEnd(COL), 'No GPC'.padEnd(14), 'Full opt-out'.padEnd(14), 'Partial (ad)'].join(' │ ');
  const sep    = '─'.repeat(header.length);

  console.log(header);
  console.log(sep);

  const fmt = (s) => {
    if (s === 'ok')      return '✓ ok          ';
    if (s === 'blocked') return '✗ BLOCKED     ';
    return (s + '              ').slice(0, 14);
  };

  const pipelines = ['analytics', 'model_training', 'ad_targeting'];
  for (const p of pipelines) {
    console.log([
      p.padEnd(COL),
      fmt(baseline.secondaryEffects[p]?.status ?? '—').slice(0, 14),
      fmt(gpc.secondaryEffects[p]?.status ?? '—').slice(0, 14),
      fmt(partial.secondaryEffects[p]?.status ?? '—').trimEnd(),
    ].join(' │ '));
  }

  console.log('\n── Storage state after partial run ──');
  console.log(`  analytics_log.json      : ${countEntries(path.join(OUTPUT_DIR, 'analytics_log.json'))} entries`);
  console.log(`  training_dataset.jsonl  : ${countLines(path.join(OUTPUT_DIR, 'training_dataset.jsonl'))} entries`);
  console.log(`  ad_vector_store.json    : ${countEntries(path.join(OUTPUT_DIR, 'ad_vector_store.json'))} entries`);
  console.log();
}

main();
