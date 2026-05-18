/**
 * AI baseline run: Ollama agent, gpc=false.
 * The model autonomously calls all five tools; all execute and data is written to disk.
 */

const fs   = require('fs');
const path = require('path');
const thirdParty = require('../agents/third_party_storage.js');
const { handleRequest } = require('../orchestrator/ollama_orchestrator.js');
const { encodeBaggage }  = require('../orchestrator/baggage.js');

const OUTPUT = path.join(__dirname, '..', 'output', 'ai_baseline_result.json');

async function main() {
  const srv    = await thirdParty.start();
  const timing = [];

  console.log('Running AI baseline (GPC off)...\n');

  const result = await handleRequest({
    query: 'Research Global Privacy Control and save a summary to my profile.',
    user_id: 'user-42',
    baggageHeader: encodeBaggage({ gpc: '0' }),
    timing,
  });

  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2));

  console.log('=== AI Baseline Run — GPC off ===\n');
  console.log('Model:', result.model);
  console.log('\nTool calls made:');
  for (const t of result.tool_calls) {
    console.log(`  ${t.tool.padEnd(28)} -> ${t.result.status}`);
  }
  console.log('\nFinal response from model:\n');
  console.log(result.final_response);
  console.log('\nOutput written to:', OUTPUT);

  srv.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
