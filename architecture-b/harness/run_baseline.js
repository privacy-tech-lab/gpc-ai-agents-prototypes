/**
 * Baseline run — gpc=0.
 *
 * All five tools execute for their declared purposes.  The interaction is
 * logged, added to the training set, the interest profile is updated, and
 * the ad platform writes to the vector store.  No restrictions.
 */

const fs          = require('fs');
const path        = require('path');
const adPlatform  = require('../agents/ad_platform.js');
const { handleRequest } = require('../orchestrator/orchestrator.js');
const { encodeBaggage } = require('../orchestrator/baggage.js');

const OUTPUT = path.join(__dirname, '..', 'output', 'baseline_result.json');

async function main() {
  const srv = await adPlatform.start();

  const timing = [];
  const result = await handleRequest({
    query:         'What does my blood pressure reading mean, and should I adjust my medication?',
    patient_id:    'patient-001',
    baggageHeader: encodeBaggage({ gpc: '0' }),
    timing,
  });

  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log('Baseline run complete →', OUTPUT);
  console.log(JSON.stringify(result, null, 2));

  srv.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
