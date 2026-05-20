/**
 * Full GPC run — gpc=1, no scope restriction.
 *
 * Primary task runs normally: get_medical_records and answer_question both
 * execute with purpose=primary_task.  The patient receives a complete answer.
 *
 * All four secondary-purpose operations are blocked:
 *   log_interaction         (analytics)      → B2 Collection blocked
 *   add_to_training_set     (model_training) → B2 Processing blocked
 *   update_interest_profile (personalization)→ B2 Inference blocked
 *   ad_platform write       (ad_targeting)   → B2 Storage blocked
 */

const fs          = require('fs');
const path        = require('path');
const adPlatform  = require('../agents/ad_platform.js');
const { handleRequest } = require('../orchestrator/orchestrator.js');
const { encodeBaggage } = require('../orchestrator/baggage.js');

const OUTPUT = path.join(__dirname, '..', 'output', 'gpc_full_result.json');

async function main() {
  const srv = await adPlatform.start();

  const timing = [];
  const result = await handleRequest({
    query:         'What does my blood pressure reading mean, and should I adjust my medication?',
    patient_id:    'patient-001',
    baggageHeader: encodeBaggage({ gpc: '1' }),   // Full GPC — no scope
    timing,
  });

  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log('Full GPC run complete →', OUTPUT);
  console.log(JSON.stringify(result, null, 2));

  srv.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
