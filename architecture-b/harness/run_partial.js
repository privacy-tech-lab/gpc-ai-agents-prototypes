/**
 * Partial opt-out run: gpc=1, gpc_scope=["ad_targeting"].
 * Analytics and training proceed; only ad_targeting is blocked.
 */

const fs   = require('fs');
const path = require('path');
const { get_medical_records }    = require('../services/medicalRecords');
const { fanOutSecondaryPurposes } = require('../orchestrator/orchestrator');
const { start: startAdPlatform } = require('../services/adPlatform');

const OUTPUT_DIR  = path.join(__dirname, '..', 'output');
const RESULT_FILE = path.join(OUTPUT_DIR, 'partial_result.json');
const QUERY       = 'What does my blood pressure reading mean, and should I adjust my medication?';

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const f of ['analytics_log.json', 'training_dataset.jsonl', 'ad_vector_store.json']) {
    const p = path.join(OUTPUT_DIR, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  const srv     = await startAdPlatform(4002);
  const privacyContext = { gpc: 1, gpc_scope: ['ad_targeting'] };

  console.log('Running partial opt-out (ad_targeting only)...\n');

  const records  = await get_medical_records({ patient_id: 'patient-001' });
  const latestBp = records.readings.find((r) => r.type === 'blood_pressure');
  const response = `Your most recent blood pressure reading was ${latestBp.value} mmHg, which is elevated. ` +
    `You are currently on ${records.medications[0].name} ${records.medications[0].dose}. ` +
    `Please discuss any medication adjustment with your prescribing clinician.`;

  const secondaryEffects = await fanOutSecondaryPurposes({
    privacyContext,
    patient_id: 'patient-001',
    query:      QUERY,
    response,
  });

  fs.writeFileSync(RESULT_FILE, JSON.stringify({ privacyContext, secondaryEffects }, null, 2));

  console.log('[Secondary effects]');
  for (const [k, v] of Object.entries(secondaryEffects)) {
    console.log(`  ${k.padEnd(16)} -> ${v.status}`);
  }
  console.log('\nOutput written to:', RESULT_FILE);

  srv.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
