'use strict';

require('dotenv').config();

/**
 * Mode: baseline — GPC off, single user, fans out to all publishers.
 * Establishes the reference for what the provider learns when no opt-out
 * signal is present.
 */

const { createProvider } = require('./provider');
const { fanoutAll } = require('./orchestrator');
const {
  gpcAdoptionRate, topicDistribution, publisherReach,
  inferUserInterests, siteLevelView,
} = require('./aggregation');

async function main() {
  const provider = createProvider();
  const user_id  = 'user-1';
  const query    = 'iPhone 17 review summary';

  const result = await fanoutAll(provider, user_id, query, { gpc: 0 });
  const provider_view = provider.getProviderView();

  const out = {
    mode: 'baseline',
    description: 'GPC off; single user; fanout to all publishers.',
    user_facing_summary: `${result.site_results.length} review snippets returned`,
    site_level_view: siteLevelView(result.site_results),
    provider_view,
    provider_derivations: {
      gpc_adoption_rate:        gpcAdoptionRate(provider_view),
      topic_distribution:       topicDistribution(provider_view),
      publisher_reach:          publisherReach(provider_view),
      inferred_user_interests:  inferUserInterests(provider_view, user_id),
    },
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
