/**
 * AI baseline: Ollama drives the fanout with GPC off.
 * The model receives the user query, decides which publishers to call
 * and what sub-query to send each. Requires a running Ollama instance
 * with the configured model loaded (default qwen2.5:14b).
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const fs   = require('fs');
const path = require('path');
const { handleAgentRequest } = require('../orchestrator/orchestrator');
const { encodeBaggage }      = require('../orchestrator/baggage');
const {
  gpcAdoptionRate, topicDistribution, publisherReach, inferUserInterests,
} = require('../provider/aggregation');

const OUTPUT = path.join(__dirname, '..', 'output', 'ai_baseline_result.json');

async function main() {
  const userId = 'user-1';
  const query  = 'Research the iPhone 17 across tech publishers and summarize the key consensus points.';

  console.log('Running AI baseline (Ollama; GPC off)...\n');

  const result = await handleAgentRequest({
    user_id:       userId,
    query,
    baggageHeader: '',
  });

  const providerView = result.provider_view;
  const out = {
    mode:                'ai-baseline',
    description:         'GPC off. Ollama model decides which publishers to query and what sub-queries to send.',
    gpc_active:          result.gpc_active,
    meta_envelope:       result.meta_envelope,
    model:               result.agent.model,
    truncated:           result.agent.truncated,
    user_facing_summary: result.agent.user_facing_summary,
    model_tool_calls:    result.agent.model_tool_calls,
    provider_view:       providerView,
    provider_derivations: {
      gpc_adoption_rate:       gpcAdoptionRate(providerView),
      topic_distribution:      topicDistribution(providerView),
      publisher_reach:         publisherReach(providerView),
      inferred_user_interests: inferUserInterests(providerView, userId),
    },
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2));

  console.log('Model:', out.model);
  console.log('[Model] tool calls:');
  for (const tc of out.model_tool_calls) {
    console.log(`  ${tc.publisher_id.padEnd(20)} sub_query="${tc.sub_query}"`);
  }
  console.log('\n[Summary]\n', out.user_facing_summary);
  console.log('\nOutput written to:', OUTPUT);
}

main().catch((err) => {
  console.error('ai-baseline failed:', err.message);
  console.error('Is Ollama running? Try: ollama serve && ollama pull qwen2.5:14b');
  process.exit(1);
});
