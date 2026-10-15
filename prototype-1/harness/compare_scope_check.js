/**
 * Diff the run_scope_check.js outputs and print a comparison table showing
 * the persistence permission matrix in practice.
 *
 * Only the 'session' and 'profile' scopes are modeled: see
 * prototype-1/README.md, "Persistence scopes", for why a cross-session
 * scope is left out.
 */

const fs   = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const SCOPES = [
  { label: 'baseline', file: 'scope_baseline_result.json' },
  { label: 'profile',  file: 'scope_profile_result.json' },
  { label: 'session',  file: 'scope_session_result.json' },
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
  const results = SCOPES.map((t) => ({ ...t, data: loadJson(t.file) }));
  const missing = results.filter((r) => !r.data);
  if (missing.length) {
    console.error('Run all three scope checks first:');
    console.error('  node harness/run_scope_check.js && node harness/run_scope_check.js --scope=profile && node harness/run_scope_check.js --scope=session');
    process.exit(1);
  }

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   Prototype 1: Persistence Permission Matrix                       ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const COL    = 28;
  const header = ['Property'.padEnd(COL), ...results.map((r) => r.label.padEnd(10))].join(' │ ');
  console.log(header);
  console.log('─'.repeat(header.length));

  const rows = [
    ['Writes (save_to_profile)',      (r) => fmt(r.storageResult.stored.includes('save_to_profile'))],
    ['Raw history consulted',         (r) => fmt(r.personalization.historyConsulted)],
    ['Synthesized profile used',      (r) => fmt(r.personalization.profileConsulted)],
  ];

  for (const [label, getVal] of rows) {
    console.log([label.padEnd(COL), ...results.map((r) => getVal(r.data).padEnd(10))].join(' │ '));
  }

  console.log('\nsession blocks everything, profile additionally allows raw-history consultation, and baseline');
  console.log('additionally allows the synthesized behavioral profile.\n');
}

main();
