/**
 * AI GPC run: multi-agent, GPC on.
 *
 * The search agent calls search_web (not GPC-sensitive) and returns a summary.
 * The data agent attempts all four data tools; the three sensitive ones are
 * blocked by the GPC policy layer. The model receives blocked responses and
 * acknowledges them in its final reply.
 */

const fs         = require('fs');
const path       = require('path');
const thirdParty = require('../agents/third_party_storage.js');
const searchAgent = require('../agents/llm_search_agent.js');
const dataAgent   = require('../agents/llm_data_agent.js');
const { encodeBaggage, readGpcFromBaggage } = require('../orchestrator/baggage.js');
const { issueToken } = require('../mcp-server/identity_provider.js');
const { MODEL }      = require('../orchestrator/agent_loop.js');

const OUTPUT = path.join(__dirname, '..', 'output', 'ai_gpc_result.json');

async function main() {
  const srv    = await thirdParty.start();
  const timing = [];

  const query         = 'Research Global Privacy Control and save a summary to my profile.';
  const user_id       = 'user-42';
  const baggageHeader = encodeBaggage({ gpc: '1' });

  const gpc  = readGpcFromBaggage(baggageHeader);
  const jwt  = issueToken('orchestrator', gpc);
  const meta = { gpc: gpc ? 1 : 0, jwt };

  console.log('Running AI GPC run (GPC on, multi-agent)...\n');

  // Search agent still runs — search_web is not GPC-sensitive.
  const searchResult = await searchAgent.run({ query, meta, timing });
  const dataResult   = await dataAgent.run({
    user_id,
    query,
    searchSummary: searchResult.summary,
    meta,
    timing,
  });

  const result = {
    model:         MODEL,
    gpc_active:    gpc,
    baggage_header: baggageHeader,
    meta_envelope: { gpc: meta.gpc },
    search_agent:  { summary: searchResult.summary,  toolCalls: searchResult.toolCalls },
    data_agent:    { summary: dataResult.summary,    toolCalls: dataResult.toolCalls },
    timing,
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2));

  console.log('=== AI GPC Run — GPC on ===\n');
  console.log('Model:', MODEL);

  console.log('\n[Search Agent] Tool calls:');
  for (const tc of searchResult.toolCalls) {
    console.log(`  ${tc.tool.padEnd(28)} -> ${tc.result.status}`);
  }
  console.log('\n[Search Agent] Summary:\n', searchResult.summary);

  console.log('\n[Data Agent] Tool calls:');
  for (const tc of dataResult.toolCalls) {
    console.log(`  ${tc.tool.padEnd(28)} -> ${tc.result.status}`);
  }
  console.log('\n[Data Agent] Final response:\n', dataResult.summary);

  console.log('\nOutput written to:', OUTPUT);
  srv.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
