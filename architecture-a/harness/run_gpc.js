/**
 * GPC run: gpc=1.
 * Search and synthesis still run; all storage operations are blocked at Layer 4.
 */

const fs   = require('fs');
const path = require('path');
const { handleRequest, shutdown } = require('../orchestrator/orchestrator.js');

const OUTPUT = path.join(__dirname, '..', 'output', 'gpc_result.json');

async function main() {
  const timing = [];

  console.log('Running GPC run (GPC on)...\n');

  const result = await handleRequest({
    query:   'Help me plan a 5-day trip to Japan — what should I see, eat, and know before I go?',
    user_id: 'user-42',
    secGpc:  '1',
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

  // handleRequest() started real A2A agent servers and an MCP child process;
  // close them so this script exits instead of hanging open.
  await shutdown();
}

main().catch(async (err) => { console.error(err); await shutdown(); process.exit(1); });
