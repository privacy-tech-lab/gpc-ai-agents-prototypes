/**
 * Signal-drop experiment — Phase 4.
 *
 * Architecture B's GPC enforcement depends on TWO fields propagating through
 * every tool call: `meta.gpc` (the opt-out signal) and `meta.purpose` (the
 * declared downstream use).  A rogue or misconfigured intermediate agent can
 * strip either field, producing two distinct failure modes:
 *
 *   Scenario A — Correct propagation (gpc=1, both fields present)
 *     Primary task executes; all secondary purposes blocked.
 *     Expected behaviour — baseline for comparison.
 *
 *   Scenario B — GPC signal dropped (meta.gpc stripped, meta.purpose kept)
 *     withPurposeCheck() sees no opt-out signal and allows everything.
 *     All secondary pipelines execute despite the user's GPC=1 request.
 *     SILENT BYPASS: the user has no indication the opt-out was ignored.
 *
 *   Scenario C — Purpose field dropped (meta.gpc kept, meta.purpose stripped)
 *     withPurposeCheck() sees gpc=1 but no purpose → maximal restriction.
 *     ALL calls blocked, including the primary task. The patient gets no answer.
 *     DETECTABLE but destructive: service is broken rather than silently non-compliant.
 *
 * Contrast with Architecture A's signal drop:
 *   Architecture A: stripping _meta entirely → silent bypass (Layer 4 fails, Layer 3 holds via JWT)
 *   Architecture B: stripping meta.gpc → silent bypass; stripping meta.purpose → over-blocks
 *   Architecture B requires BOTH fields to propagate correctly.  One failure mode is
 *   silent (Scenario B); the other is detectable from the broken service (Scenario C).
 *   Neither is acceptable — both motivate spec-level enforcement of purpose propagation.
 */

const fs         = require('fs');
const path       = require('path');
const adPlatform = require('../agents/ad_platform.js');
const { handleRequest } = require('../orchestrator/orchestrator.js');
const { encodeBaggage } = require('../orchestrator/baggage.js');

const QUERY      = 'What does my blood pressure reading mean, and should I adjust my medication?';
const PATIENT_ID = 'patient-001';

const OUTPUT = path.join(__dirname, '..', 'output', 'signal_drop_result.json');

// Rows we care about — same shape as compare_results.js collectMatrix()
function collectRows(result) {
  const { primary, secondary } = result;
  return [
    { tool: 'get_medical_records',     purpose: 'primary_task',    status: primary?.medical_records?.status    ?? '—' },
    { tool: 'answer_question',         purpose: 'primary_task',    status: primary?.answer?.status             ?? '—' },
    { tool: 'log_interaction',         purpose: 'analytics',       status: secondary?.log_interaction?.status  ?? '—' },
    { tool: 'add_to_training_set',     purpose: 'model_training',  status: secondary?.add_to_training_set?.status ?? '—' },
    { tool: 'update_interest_profile', purpose: 'personalization', status: secondary?.update_interest_profile?.status ?? '—' },
    { tool: 'ad_platform',             purpose: 'ad_targeting',    status: secondary?.ad_platform?.status      ?? '—' },
  ];
}

function fmt(s) {
  if (s === 'ok')      return '✓ ok      ';
  if (s === 'blocked') return '✗ BLOCKED ';
  if (s === 'error')   return '! error   ';
  return (String(s) + '          ').slice(0, 10);
}

function printTable(rowsA, rowsB, rowsC) {
  const TOOL_COL = 28;
  const PUR_COL  = 18;
  const STA_COL  = 12;

  const header = [
    'Tool'.padEnd(TOOL_COL),
    'Purpose'.padEnd(PUR_COL),
    'A: Correct'.padEnd(STA_COL),
    'B: Drop gpc'.padEnd(STA_COL),
    'C: Drop purpose'.padEnd(STA_COL),
  ].join(' │ ');
  const sep = '─'.repeat(header.length);

  console.log('\n╔' + '═'.repeat(header.length) + '╗');
  console.log('║  Signal-Drop Experiment — Architecture B' + ' '.repeat(header.length - 41) + '║');
  console.log('╚' + '═'.repeat(header.length) + '╝\n');
  console.log(header);
  console.log(sep);

  for (let i = 0; i < rowsA.length; i++) {
    const rA = rowsA[i];
    const rB = rowsB[i];
    const rC = rowsC[i];
    console.log([
      rA.tool.padEnd(TOOL_COL),
      rA.purpose.padEnd(PUR_COL),
      fmt(rA.status).padEnd(STA_COL),
      fmt(rB.status).padEnd(STA_COL),
      fmt(rC.status).padEnd(STA_COL),
    ].join(' │ '));
  }
  console.log(sep);
}

function printFindings(rowsA, rowsB, rowsC) {
  const secondaryB = rowsB.filter((r) => r.purpose !== 'primary_task');
  const allBPassed = secondaryB.every((r) => r.status === 'ok');
  const primaryBOk = rowsB.find((r) => r.tool === 'get_medical_records')?.status === 'ok';

  const primaryCBlocked = rowsC.find((r) => r.tool === 'get_medical_records')?.status === 'blocked';
  const allCBlocked = rowsC.every((r) => r.status === 'blocked');

  console.log('\n── Findings ──\n');

  if (primaryBOk && allBPassed) {
    console.log('  FINDING 1 (Scenario B — drop gpc): SILENT BYPASS');
    console.log('    All secondary pipelines executed despite gpc=1 in the Baggage header.');
    console.log('    withPurposeCheck() saw no gpc signal and applied no restrictions.');
    console.log('    The patient\'s opt-out was silently ignored with no error or indication.\n');
  }

  if (primaryCBlocked && allCBlocked) {
    console.log('  FINDING 2 (Scenario C — drop purpose): OVER-RESTRICTION (detectable)');
    console.log('    All calls blocked, including get_medical_records (primary task).');
    console.log('    Reason: missing_purpose_field — interceptor treated absence of purpose');
    console.log('    as maximal restriction. Service is broken, not silently non-compliant.\n');
  }

  if (allBPassed && allCBlocked) {
    console.log('  FINDING 3 (Comparison):');
    console.log('    Architecture B has TWO distinct signal-propagation failure modes:');
    console.log('      B: strip meta.gpc     → silent bypass   (same as Architecture A\'s failure)');
    console.log('      C: strip meta.purpose → over-restriction (unique to Architecture B)');
    console.log();
    console.log('    Architecture A requires ONE field to propagate correctly (_meta).');
    console.log('    Architecture B requires TWO (gpc + purpose). The additional field adds');
    console.log('    a new failure mode (Scenario C) that is detectable from the broken');
    console.log('    service — but the more dangerous Scenario B failure is still silent.');
    console.log();
    console.log('    Both failure modes motivate purpose propagation as a required,');
    console.log('    spec-level protocol feature — not an optional convention.\n');
  }
}

async function main() {
  const srv = await adPlatform.start();

  const baggage = encodeBaggage({ gpc: '1' });

  // Scenario A: correct propagation
  console.log('Running Scenario A (correct, gpc=1)...');
  const resultA = await handleRequest({
    query: QUERY, patient_id: PATIENT_ID, baggageHeader: baggage,
    dropGpc: false, dropPurpose: false,
  });

  // Scenario B: gpc stripped — silent bypass
  console.log('Running Scenario B (drop gpc)...');
  const resultB = await handleRequest({
    query: QUERY, patient_id: PATIENT_ID, baggageHeader: baggage,
    dropGpc: true, dropPurpose: false,
  });

  // Scenario C: purpose stripped — over-blocks everything
  console.log('Running Scenario C (drop purpose)...');
  const resultC = await handleRequest({
    query: QUERY, patient_id: PATIENT_ID, baggageHeader: baggage,
    dropGpc: false, dropPurpose: true,
  });

  const output = {
    scenarioA: { label: 'Correct propagation',     drop_flags: resultA.drop_flags, rows: collectRows(resultA) },
    scenarioB: { label: 'Drop gpc (silent bypass)', drop_flags: resultB.drop_flags, rows: collectRows(resultB) },
    scenarioC: { label: 'Drop purpose (over-block)', drop_flags: resultC.drop_flags, rows: collectRows(resultC) },
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));

  printTable(collectRows(resultA), collectRows(resultB), collectRows(resultC));
  printFindings(collectRows(resultA), collectRows(resultB), collectRows(resultC));

  console.log('Output written to:', OUTPUT);
  srv.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
