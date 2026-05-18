/**
 * GPC run: gpc=1.
 * Search still runs; all personal-data tools are blocked at Layers 3 and 4.
 */

const fs = require('fs');
const path = require('path');
const thirdParty = require('../agents/third_party_storage.js');
const { handleRequest } = require('../orchestrator/orchestrator.js');
const { encodeBaggage } = require('../orchestrator/baggage.js');

const OUTPUT = path.join(__dirname, '..', 'output', 'gpc_result.json');

async function main() {
  const srv = await thirdParty.start();

  const timing = [];
  const result = await handleRequest({
    query: 'What is Global Privacy Control?',
    user_id: 'user-42',
    baggageHeader: encodeBaggage({ gpc: '1' }),   // GPC on
    timing,
  });

  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log('GPC run complete →', OUTPUT);
  console.log(JSON.stringify(result, null, 2));

  srv.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
