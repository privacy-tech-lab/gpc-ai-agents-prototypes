/**
 * Diff the baseline and GPC run outputs and print a human-readable report.
 *
 * Checks:
 *  - Which storage operations executed (status=ok) vs were blocked (status=blocked)
 *  - Whether search_web calls ran in both modes
 *  - Whether the interaction log and vector store grew
 *  - Per-tool timing overhead
 */

const fs   = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');

function loadJson(file) {
  const p = path.join(OUTPUT_DIR, file);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function collectToolStatuses(result) {
  const statuses = {};
  if (!result) return statuses;

  for (const tc of (result.searchCalls ?? [])) {
    statuses[tc.tool] = tc.result?.status ?? 'unknown';
  }

  const detail = result.storageResult?.detail ?? {};
  for (const [key, val] of Object.entries(detail)) {
    statuses[key] = val?.status ?? 'unknown';
  }

  return statuses;
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

  const bStatuses = collectToolStatuses(baseline);
  const gStatuses = collectToolStatuses(gpc);

  const allTools = [...new Set([...Object.keys(bStatuses), ...Object.keys(gStatuses)])];

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║      GPC Propagation Report — Architecture A         ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');
  if (baseline?.model) console.log(`Model: ${baseline.model}\n`);

  const COL    = 24;
  const header = ['Tool'.padEnd(COL), 'Baseline'.padEnd(12), 'GPC'].join(' │ ');
  const sep    = '─'.repeat(header.length);

  console.log(header);
  console.log(sep);

  const fmt = (s) => {
    if (s === 'ok')      return '✓ ok        ';
    if (s === 'blocked') return '✗ BLOCKED   ';
    return (s + '            ').slice(0, 12);
  };

  for (const tool of allTools) {
    console.log([
      tool.padEnd(COL),
      fmt(bStatuses[tool] ?? '—').padEnd(12),
      fmt(gStatuses[tool] ?? '—'),
    ].join(' │ '));
  }

  const logLines  = countLines(path.join(OUTPUT_DIR, 'interaction_log.jsonl'));
  const storeSize = countEntries(path.join(OUTPUT_DIR, 'vector_store.json'));

  console.log('\n── Storage state after runs ──');
  console.log(`  interaction_log.jsonl : ${logLines} entries`);
  console.log(`  vector_store.json     : ${storeSize} entries`);

  if (baseline?.timing?.length) {
    console.log('\n── Per-tool timing (baseline) ──');
    for (const t of baseline.timing) {
      console.log(`  ${t.tool.padEnd(COL)} ${t.durationMs} ms`);
    }
  }

  if (gpc?.timing?.length) {
    console.log('\n── Per-tool timing (GPC run) ──');
    for (const t of gpc.timing) {
      console.log(`  ${t.tool.padEnd(COL)} ${t.durationMs} ms`);
    }
  }

  console.log();
}

main();
