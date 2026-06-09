'use strict';

require('dotenv').config();

/**
 * Mode: ai-baseline — Ollama-driven fanout with GPC off.
 *
 * Requires a running Ollama instance with the configured model loaded.
 * Defaults: http://localhost:11434, qwen2.5:14b. Override via
 * OLLAMA_BASE_URL and OLLAMA_MODEL env vars.
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

  const r = await handleRequest({ provider, user_id, query, gpc: 0 });
  const provider_view = provider.getProviderView();

  const out = {
    mode: 'ai-baseline',
    description: 'GPC off. Ollama model decides which publishers to query and what sub-queries to send.',
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
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch(e => {
  console.error('ai-baseline failed:', e.message);
  console.error('Is Ollama running? Try: OLLAMA_MODEL=qwen2.5:14b ollama serve');
  process.exit(1);
});
