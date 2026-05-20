/**
 * Partial GPC run — gpc=1, scope restricted to ad_targeting and model_training.
 *
 * This is the critical run for the paper's argument: the opt-out is
 * purpose-scoped rather than tool-scoped.  The same secondary-pipeline tools
 * produce different outcomes depending on their declared purpose:
 *
 *   log_interaction         (analytics)      → ALLOWED  (not in scope)
 *   add_to_training_set     (model_training) → BLOCKED  (in scope)
 *   update_interest_profile (personalization)→ ALLOWED  (not in scope)
 *   ad_platform write       (ad_targeting)   → BLOCKED  (in scope)
 *
 * Baggage encoding: gpc=1,gpc_scope=ad_targeting|model_training
 * The pipe-delimited gpc_scope is decoded by baggage.js into an array.
 */

const fs          = require('fs');
const path        = require('path');
const adPlatform  = require('../agents/ad_platform.js');
const { handleRequest } = require('../orchestrator/orchestrator.js');
const { encodeBaggage } = require('../orchestrator/baggage.js');

const OUTPUT = path.join(__dirname, '..', 'output', 'gpc_partial_result.json');

async function main() {
  const srv = await adPlatform.start();

  const timing = [];
  const result = await handleRequest({
    query:         'What does my blood pressure reading mean, and should I adjust my medication?',
    patient_id:    'patient-001',
    baggageHeader: encodeBaggage({ gpc: '1', gpc_scope: 'ad_targeting|model_training' }),
    timing,
  });

  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log('Partial GPC run complete →', OUTPUT);
  console.log(JSON.stringify(result, null, 2));

  srv.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
