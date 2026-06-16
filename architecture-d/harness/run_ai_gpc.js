/**
 * AI GPC: Ollama drives the fanout with GPC on. Sites enforce per-call;
 * the provider observes every model decision in addition to every site
 * response. Requires a running Ollama instance with the configured
 * model loaded (default qwen2.5:7b).
 */

require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const { handleAgentRequest } = require('../orchestrator/orchestrator');
const { encodeBaggage }      = require('../orchestrator/baggage');
const {
  gpcAdoptionRate, topicDistribution, publisherReach, inferUserInterests,
} = require('../provider/aggregation');

const OUTPUT = path.join(__dirname, '..', 'output', 'ai_gpc_result.json');

async function main() {
  const userId = 'user-1';
  const query  = 'Research the iPhone 17 across tech publishers and summarize the key consensus points.';

  console.log('Running AI GPC (Ollama; GPC on)...\n');

  const result = await handleAgentRequest({
    user_id:       userId,
    query,
    baggageHeader: encodeBaggage({ gpc: '1' }),
  });

  const providerView = result.provider_view;
  const out = {
    mode:                'ai-gpc',
    description:         'GPC on. Sites enforce per-call. Provider observes the full LLM decision trace.',
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
    structural_finding: 'Every sub-query the model generated and every publisher it chose is visible to the provider. Site-level GPC enforcement does not change that.',
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2));

  console.log('Model:', out.model);
  console.log('[Model] tool calls:');
  for (const tc of out.model_tool_calls) {
    const reason = tc.tracking_decision?.reason ?? 'n/a';
    console.log(`  ${tc.publisher_id.padEnd(20)} site:${reason.padEnd(28)} sub_query="${tc.sub_query}"`);
  }
  console.log('\n[Summary]\n', out.user_facing_summary);
  console.log('\nOutput written to:', OUTPUT);
}

main().catch((err) => {
  console.error('ai-gpc failed:', err.message);
  console.error('Is Ollama running? Try: ollama serve && ollama pull qwen2.5:7b');
  process.exit(1);
});
