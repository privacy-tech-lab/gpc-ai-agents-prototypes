/**
 * LLM orchestrator harness — runs baseline and full-GPC scenarios back to back.
 *
 * Demonstrates that purpose-scoped enforcement is model-agnostic: an Ollama
 * LLM driving get_medical_records and answer_question faces exactly the same
 * secondary-pipeline blocking as the scripted orchestrator. The harness injects
 * purpose metadata; the model never declares or manipulates it.
 */

const fs         = require('fs');
const path       = require('path');
const adPlatform = require('../agents/ad_platform.js');
const { handleRequest } = require('../orchestrator/llm_orchestrator.js');
const { encodeBaggage } = require('../orchestrator/baggage.js');

const QUERY      = 'What does my blood pressure reading mean, and should I adjust my medication?';
const PATIENT_ID = 'patient-001';

const OUTPUT_BASELINE = path.join(__dirname, '..', 'output', 'llm_baseline_result.json');
const OUTPUT_GPC      = path.join(__dirname, '..', 'output', 'llm_gpc_result.json');

function printRun(label, result) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${label}  |  model: ${result.model}`);
  console.log(`GPC active: ${result.gpc_active}`);
  console.log('='.repeat(60));

  console.log('\n[Primary — LLM-driven tool calls]');
  for (const tc of result.primary.llm_tool_calls) {
    const status = tc.result?.status ?? '?';
    console.log(`  ${tc.tool.padEnd(28)} purpose=${tc.input?.purpose ?? '(harness-injected)'}  -> ${status}`);
  }
  console.log('\n[Primary] Final response:');
  console.log(' ', result.primary.final_response);

  console.log('\n[Secondary — scripted, purpose-injected]');
  for (const [key, val] of Object.entries(result.secondary)) {
    const status = val?.status ?? '?';
    const reason = val?.reason ? `  (${val.reason})` : '';
    console.log(`  ${key.padEnd(28)} -> ${status}${reason}`);
  }

  if (result.timing?.length) {
    console.log('\n[Timing]');
    for (const t of result.timing) {
      console.log(`  ${t.tool.padEnd(28)} purpose=${String(t.purpose ?? '').padEnd(18)} ${t.durationMs}ms  ${t.status}`);
    }
  }
}

async function main() {
  const srv = await adPlatform.start();

  // ── Baseline (GPC off) ────────────────────────────────────────────────────
  console.log('Running LLM baseline (GPC off)...');
  const baselineTiming = [];
  const baselineResult = await handleRequest({
    query:         QUERY,
    patient_id:    PATIENT_ID,
    baggageHeader: encodeBaggage({ gpc: '0' }),
    timing:        baselineTiming,
  });
  fs.writeFileSync(OUTPUT_BASELINE, JSON.stringify(baselineResult, null, 2));
  printRun('LLM BASELINE — GPC off', baselineResult);

  // ── Full GPC (GPC on) ─────────────────────────────────────────────────────
  console.log('\n\nRunning LLM full GPC (GPC on)...');
  const gpcTiming = [];
  const gpcResult = await handleRequest({
    query:         QUERY,
    patient_id:    PATIENT_ID,
    baggageHeader: encodeBaggage({ gpc: '1' }),
    timing:        gpcTiming,
  });
  fs.writeFileSync(OUTPUT_GPC, JSON.stringify(gpcResult, null, 2));
  printRun('LLM FULL GPC — GPC on', gpcResult);

  console.log('\n\nOutputs written to:');
  console.log(' ', OUTPUT_BASELINE);
  console.log(' ', OUTPUT_GPC);

  srv.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
