/**
 * GPC run: gpc=1.
 * Search and synthesis still run; all storage operations are blocked at Layers 3 and 4.
 */

const fs         = require('fs');
const path       = require('path');
const thirdParty = require('../agents/third_party_storage.js');
const { handleRequest } = require('../orchestrator/orchestrator.js');
const { encodeBaggage } = require('../orchestrator/baggage.js');

const OUTPUT = path.join(__dirname, '..', 'output', 'gpc_result.json');

async function main() {
  const srv    = await thirdParty.start();
  const timing = [];

  console.log('Running GPC run (GPC on)...\n');

  const result = await handleRequest({
    query:         'Help me plan a 5-day trip to Japan — what should I see, eat, and know before I go?',
    user_id:       'user-42',
    baggageHeader: encodeBaggage({ gpc: '1' }),
    timing,
  });

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2));

  console.log('Model:', result.model);
  console.log('\n[Search Agent] calls:');
  for (const tc of result.searchCalls) {
    console.log(`  ${tc.tool.padEnd(20)} -> ${tc.result?.status}`);
  }
  console.log('\n[Storage]');
  console.log('  stored :', result.storageResult.stored.join(', ') || '(none)');
  console.log('  blocked:', result.storageResult.blocked.join(', '));
  console.log('\n[Answer]\n', result.answer);
  console.log('\nOutput written to:', OUTPUT);

  srv.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
