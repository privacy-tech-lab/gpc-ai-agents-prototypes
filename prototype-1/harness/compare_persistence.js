/**
 * Diff the four session-2 scope outputs and print a comparison table
 * showing the Category D permission matrix in practice.
 */

const fs   = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const TIERS = [
  { label: 'baseline', file: 'session2_baseline_result.json' },
  { label: 'd3',       file: 'session2_d3_result.json' },
  { label: 'd2',       file: 'session2_d2_result.json' },
  { label: 'd1',       file: 'session2_d1_result.json' },
];

function loadJson(file) {
  const p = path.join(OUTPUT_DIR, file);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function fmt(val) {
  if (val === true)  return '✓ yes';
  if (val === false) return '✗ no ';
  return String(val).padEnd(5);
}

function main() {
  const results = TIERS.map((t) => ({ ...t, data: loadJson(t.file) }));
  const missing = results.filter((r) => !r.data);
  if (missing.length) {
    console.error('Run all four session-2 tiers first:');
    console.error('  node harness/run_session2.js && node harness/run_session2.js --scope=d3 && node harness/run_session2.js --scope=d2 && node harness/run_session2.js --scope=d1');
    process.exit(1);
  }

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   Category D Permission Matrix — Architecture A, Session 2         ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const COL    = 28;
  const header = ['Property'.padEnd(COL), ...results.map((r) => r.label.padEnd(10))].join(' │ ');
  console.log(header);
  console.log('─'.repeat(header.length));

  const rows = [
    ['Writes (save_to_profile)',      (r) => fmt(r.storageResult.stored.includes('save_to_profile'))],
    ['Raw history consulted (D3)',    (r) => fmt(r.personalization.historyConsulted)],
    ['Synthesized profile used',      (r) => fmt(r.personalization.profileConsulted)],
  ];

  for (const [label, getVal] of rows) {
    console.log([label.padEnd(COL), ...results.map((r) => getVal(r.data).padEnd(10))].join(' │ '));
  }

  console.log('\nThis is the Category D split made concrete: writes go through storage.js, which');
  console.log('blocks them whenever GPC is on, the same way at d1, d2, and d3. Reads go through');
  console.log('personalization.js, which tracks scope: d1 and d2 consult nothing, d3 additionally');
  console.log('allows raw-history consultation, and baseline additionally allows the synthesized');
  console.log('behavioral profile.\n');
}

main();
