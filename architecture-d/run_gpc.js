'use strict';

require('dotenv').config();

/**
 * Mode: gpc — GPC on, single user, fanout to all publishers.
 *
 * Headline finding: site_level_view shows that strict publishers honor
 * the signal (no log, no profile write), while provider_view is
 * substantively identical to the baseline run. Per-call enforcement at
 * the site does not bound provider visibility.
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

  const result = await fanoutAll(provider, user_id, query, { gpc: 1 });
  const provider_view = provider.getProviderView();

  const out = {
    mode: 'gpc',
    description: 'GPC on; single user; fanout to all publishers. Sites enforce; provider still observes everything.',
    user_facing_summary: `${result.site_results.length} review snippets returned`,
    site_level_view: siteLevelView(result.site_results),
    provider_view,
    provider_derivations: {
      gpc_adoption_rate:       gpcAdoptionRate(provider_view),
      topic_distribution:      topicDistribution(provider_view),
      publisher_reach:         publisherReach(provider_view),
      inferred_user_interests: inferUserInterests(provider_view, user_id),
    },
    structural_finding: 'Provider observation log is unchanged from baseline. Site-level enforcement does not constrain provider visibility.',
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
