/**
 * Baseline run: gpc=false.
 * All storage operations execute; profile and log are written to disk.
 */

const fs   = require('fs');
const path = require('path');
const { handleRequest } = require('../orchestrator/orchestrator.js');

const OUTPUT = path.join(__dirname, '..', 'output', 'baseline_result.json');

async function main() {
  const timing = [];

  console.log('Running baseline (GPC off)...\n');

  const result = await handleRequest({
    query:   'Help me plan a 5-day trip to Japan — what should I see, eat, and know before I go?',
    user_id: 'user-42',
    secGpc:  '0',
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
  console.log('  stored :', result.storageResult.stored.join(', '));
  console.log('  blocked:', result.storageResult.blocked.join(', ') || '(none)');
  console.log('\n[Answer]\n', result.answer);
  console.log('\nOutput written to:', OUTPUT);
}

main().catch((err) => { console.error(err); process.exit(1); });
