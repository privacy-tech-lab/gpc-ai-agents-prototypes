/**
 * Diff the four scripted run outputs (baseline / gpc / mitigated /
 * signal-drop) and print a comparison report.
 *
 * The headline contrast is between `site_level_view` (which changes
 * with GPC) and `provider_view` (which does not). The table makes both
 * legible at the same time.
 */

const fs   = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');

function loadJson(file) {
  const p = path.join(OUTPUT_DIR, file);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    process.stderr.write(`[compare] failed to parse ${file}: ${err.message}\n`);
    return null;
  }
}

function sitesSuppressed(result) {
  // `Array.isArray` rather than a truthy check: a malformed result
  // file (e.g. site_level_view: "string") used to crash .filter().
  if (!Array.isArray(result?.site_level_view)) return '—';
  // `tracking_decision` is absent when querySite returned an error
  // (e.g. unknown publisher). Treat as "not suppressed" for the count
  // so the report degrades gracefully rather than throwing.
  const suppressed = result.site_level_view.filter((v) => v.tracking_decision?.logged === false).length;
  return `${suppressed} / ${result.site_level_view.length}`;
}

function observationCount(result) {
  if (!Array.isArray(result?.provider_view)) return '—';
  return String(result.provider_view.length);
}

function metaForwarded(result) {
  const v = result?.provider_view?.[0];
  if (!v || v.meta_forwarded === undefined) return '—';
  return JSON.stringify(v.meta_forwarded);
}

function metaReceived(result) {
  const v = result?.provider_view?.[0];
  if (!v || v.meta_received === undefined) return '—';
  return JSON.stringify(v.meta_received);
}

function doNotTrainTag(result) {
  const v = result?.provider_view?.[0];
  if (!v) return '—';
  if (v.do_not_train === true) return 'true';
  return 'absent';
}

function inferredTopic(result) {
  const v = result?.provider_view?.[0];
  if (!v) return '—';
  return v.query_topic ?? '—';
}

function main() {
  const baseline   = loadJson('baseline_result.json');
  const gpc        = loadJson('gpc_result.json');
  const mitigated  = loadJson('mitigated_result.json');
  const signalDrop = loadJson('signal_drop_result.json');
  const aggregate  = loadJson('aggregate_result.json');

  console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║   Site-vs-Provider Visibility Report — Architecture D                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

  const rows = [
    ['Sites suppressing log',  sitesSuppressed(baseline),  sitesSuppressed(gpc),  sitesSuppressed(mitigated),  sitesSuppressed(signalDrop)],
    ['Provider observations',  observationCount(baseline), observationCount(gpc), observationCount(mitigated), observationCount(signalDrop)],
    ['meta_received',          metaReceived(baseline),     metaReceived(gpc),     metaReceived(mitigated),     metaReceived(signalDrop)],
    ['meta_forwarded',         metaForwarded(baseline),    metaForwarded(gpc),    metaForwarded(mitigated),    metaForwarded(signalDrop)],
    ['do_not_train tag',       doNotTrainTag(baseline),    doNotTrainTag(gpc),    doNotTrainTag(mitigated),    doNotTrainTag(signalDrop)],
    ['Inferred query topic',   inferredTopic(baseline),    inferredTopic(gpc),    inferredTopic(mitigated),    inferredTopic(signalDrop)],
  ];

  const COL_LABEL = 26;
  const COL_VAL   = 14;
  const header = ['Property'.padEnd(COL_LABEL), 'Baseline'.padEnd(COL_VAL), 'GPC'.padEnd(COL_VAL), 'Mitigated'.padEnd(COL_VAL), 'Signal-drop'.padEnd(COL_VAL)].join(' │ ');
  const sep    = '─'.repeat(header.length);

  console.log(header);
  console.log(sep);
  for (const row of rows) {
    console.log([
      row[0].padEnd(COL_LABEL),
      String(row[1]).padEnd(COL_VAL),
      String(row[2]).padEnd(COL_VAL),
      String(row[3]).padEnd(COL_VAL),
      String(row[4]).padEnd(COL_VAL),
    ].join(' │ '));
  }

  if (aggregate?.derivations) {
    console.log('\n── Aggregate run ──');
    console.log(`  log_size                  : ${aggregate.log_size}`);
    console.log(`  measured_gpc_adoption_rate: ${aggregate.derivations.measured_gpc_adoption_rate}`);
    console.log(`  topics observed           : ${Object.keys(aggregate.derivations.topic_distribution).join(', ')}`);
  }

  console.log();
}

module.exports = { loadJson, sitesSuppressed, observationCount, metaForwarded, metaReceived, doNotTrainTag, inferredTopic };

if (require.main === module) main();
