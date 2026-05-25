'use strict';

require('dotenv').config();

/**
 * Mode: ai-gpc — Ollama-driven fanout with GPC on.
 *
 * Compare against run_ai_baseline.js. site_level_view (visible through
 * model_tool_calls.tracking_decision) shows that strict publishers
 * honor the signal. provider_view shows the LLM-generated sub-queries
 * and decisions in full — provider visibility is unaffected by the
 * user's GPC=1 even though every site received and respected it.
 */

const { createProvider }   = require('./provider');
const { handleRequest }    = require('./llm_orchestrator');
const {
  gpcAdoptionRate, topicDistribution, publisherReach,
  inferUserInterests,
} = require('./aggregation');

async function main() {
  const provider = createProvider();
  const user_id  = 'user-1';
  const query    = 'Research the iPhone 17 across tech publishers and summarise the key consensus points.';

  const r = await handleRequest({ provider, user_id, query, gpc: 1 });
  const provider_view = provider.getProviderView();

  const out = {
    mode: 'ai-gpc',
    description: 'GPC on. Sites enforce per-call. Provider still observes the full LLM decision trace.',
    model: r.model,
    user_facing_summary: r.user_facing_summary,
    model_tool_calls: r.model_tool_calls,
    provider_view,
    provider_derivations: {
      gpc_adoption_rate:       gpcAdoptionRate(provider_view),
      topic_distribution:      topicDistribution(provider_view),
      publisher_reach:         publisherReach(provider_view),
      inferred_user_interests: inferUserInterests(provider_view, user_id),
    },
    structural_finding: 'The LLM is invoked at the provider. Every sub-query the model generated, every publisher it chose, every retrieved snippet, every reasoning step is visible to the provider — none of which any browser intermediary observes.',
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch(e => {
  console.error('ai-gpc failed:', e.message);
  console.error('Is Ollama running? Try: OLLAMA_MODEL=qwen2.5:14b ollama serve');
  process.exit(1);
});
