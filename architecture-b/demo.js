/**
 * demo.js — exercises Architecture B's enforcement without requiring a
 * running Ollama instance.
 *
 * Scenarios:
 *   1. No GPC               -> all three secondary pipelines write
 *   2. GPC full opt-out     -> all three secondary pipelines blocked
 *   3. GPC partial opt-out  -> only ad_targeting blocked (gpc_scope)
 *
 * In every scenario, get_medical_records is called and returns full data —
 * demonstrating that the PRIMARY task is never affected by GPC.
 */
const fs = require('fs');
const path = require('path');
const { get_medical_records } = require('./services/medicalRecords');
const { fanOutSecondaryPurposes } = require('./lib/agentLoop');
const { start: startAdPlatform } = require('./services/adPlatform');

const OUTPUT_DIR = path.join(__dirname, 'output');

function resetOutputs() {
  for (const f of ['analytics_log.json', 'training_dataset.jsonl', 'ad_vector_store.json']) {
    const p = path.join(OUTPUT_DIR, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

function readJsonSafe(file) {
  const p = path.join(OUTPUT_DIR, file);
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, 'utf8');
  if (file.endsWith('.jsonl')) return raw.trim().split('\n').filter(Boolean).map(JSON.parse);
  return JSON.parse(raw);
}

async function runScenario(label, privacyContext) {
  console.log(`\n=== ${label} ===`);
  console.log('privacyContext:', JSON.stringify(privacyContext));

  // --- PRIMARY task: always runs, regardless of GPC ---
  const records = await get_medical_records({ patient_id: 'patient-001' });
  const latestBp = records.readings.find((r) => r.type === 'blood_pressure');
  const finalResponse = `Your most recent blood pressure reading was ${latestBp.value} mmHg, ` +
    `which is elevated. You're currently on ${records.medications[0].name} ${records.medications[0].dose}. ` +
    `Please discuss any medication adjustment with your prescribing clinician.`;

  console.log('[primary] get_medical_records succeeded:', !records.error);
  console.log('[primary] response:', finalResponse);

  // --- SECONDARY fan-out: gated by privacyContext ---
  const secondaryEffects = await fanOutSecondaryPurposes({
    privacyContext,
    patient_id: 'patient-001',
    query: 'What does my blood pressure reading mean, and should I adjust my medication?',
    response: finalResponse,
  });

  console.log('[secondary] outcomes:', JSON.stringify(secondaryEffects, null, 2));
  return secondaryEffects;
}

(async () => {
  const adServer = await startAdPlatform(4002);

  resetOutputs();
  await runScenario('1. No GPC', {});

  resetOutputs();
  await runScenario('2. GPC full opt-out', { gpc: 1 });

  resetOutputs();
  await runScenario('3. GPC partial opt-out (ad_targeting only)', { gpc: 1, gpc_scope: ['ad_targeting'] });

  console.log('\n=== Final on-disk state after scenario 3 ===');
  console.log('analytics_log.json:', readJsonSafe('analytics_log.json'));
  console.log('training_dataset.jsonl:', readJsonSafe('training_dataset.jsonl'));
  console.log('ad_vector_store.json:', readJsonSafe('ad_vector_store.json'));

  adServer.close();
})();
