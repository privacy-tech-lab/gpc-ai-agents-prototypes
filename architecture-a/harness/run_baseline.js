/**
 * Baseline run: gpc=false.
 * All four tools execute; profile and log are written to disk.
 */

const fs = require('fs');
const path = require('path');
const thirdParty = require('../agents/third_party_storage.js');
const { handleRequest } = require('../orchestrator/orchestrator.js');
const { encodeBaggage } = require('../orchestrator/baggage.js');

const OUTPUT = path.join(__dirname, '..', 'output', 'baseline_result.json');

async function main() {
  const srv = await thirdParty.start();

  const timing = [];
  const result = await handleRequest({
    query: 'What is Global Privacy Control?',
    user_id: 'user-42',
    baggageHeader: encodeBaggage({ gpc: '0' }),   // GPC off
    timing,
  });

  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log('Baseline run complete →', OUTPUT);
  console.log(JSON.stringify(result, null, 2));

  srv.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
