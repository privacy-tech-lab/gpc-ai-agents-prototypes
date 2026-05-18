/**
 * AI baseline run: multi-agent, GPC off.
 * The orchestrator LLM dispatches to the search agent, then the data agent.
 * All tools execute and data is written to disk.
 */

const fs         = require('fs');
const path       = require('path');
const thirdParty = require('../agents/third_party_storage.js');
const { handleRequest } = require('../orchestrator/llm_orchestrator.js');
const { encodeBaggage } = require('../orchestrator/baggage.js');

const OUTPUT = path.join(__dirname, '..', 'output', 'ai_baseline_result.json');

async function main() {
  const srv    = await thirdParty.start();
  const timing = [];

  console.log('Running AI baseline (GPC off, multi-agent)...\n');

  const result = await handleRequest({
    query:         'Research Global Privacy Control and save a summary to my profile.',
    user_id:       'user-42',
    baggageHeader: encodeBaggage({ gpc: '0' }),
    timing,
  });

  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2));

  console.log('=== AI Baseline Run — GPC off ===\n');
  console.log('Model:', result.model);

  if (result.search_agent) {
    console.log('\n[Search Agent] Tool calls:');
    for (const tc of result.search_agent.toolCalls) {
      console.log(`  ${tc.tool.padEnd(28)} -> ${tc.result.status}`);
    }
    console.log('\n[Search Agent] Summary:\n', result.search_agent.summary);
  }

  if (result.data_agent) {
    console.log('\n[Data Agent] Tool calls:');
    for (const tc of result.data_agent.toolCalls) {
      console.log(`  ${tc.tool.padEnd(28)} -> ${tc.result.status}`);
    }
    console.log('\n[Data Agent] Response:\n', result.data_agent.summary);
  }

  console.log('\n[Orchestrator] Final response:\n', result.orchestrator.finalResponse);
  console.log('\nOutput written to:', OUTPUT);

  srv.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
