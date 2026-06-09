'use strict';

require('dotenv').config();

/**
 * Mode: mitigated — GPC on, single user, with E2 provider-side
 * commitments active.
 *
 * The commitments do not change what the provider sees; they constrain
 * how it records and what it derives. The user has no protocol-level
 * way to verify the commitments were honored — they are the lever
 * available to the spec only as norms.
 */

const { createProvider } = require('./provider');
const { fanoutAll } = require('./orchestrator');
const { noTrainCommitment, kAnonymity, dpNoise, chain } = require('./mitigations');
const {
  gpcAdoptionRate, topicDistribution, publisherReach,
  inferUserInterests, siteLevelView,
} = require('./aggregation');

async function main() {
  const mitigations = chain(
    noTrainCommitment(),
    kAnonymity(5),
    dpNoise(1.0),
  );

  const provider = createProvider({ mitigations });
  const user_id  = 'user-1';
  const query    = 'iPhone 17 review summary';

  const result = await fanoutAll(provider, user_id, query, { gpc: 1 });
  const provider_view = provider.getProviderView();

  const out = {
    mode: 'mitigated',
    description: 'GPC on with provider-side commitments: no_train + k-anonymity (k=5) + DP noise (eps=1.0).',
    mitigation_chain: mitigations.name,
    user_facing_summary: `${result.site_results.length} review snippets returned`,
    site_level_view: siteLevelView(result.site_results),
    provider_view,
    provider_derivations: {
      gpc_adoption_rate:       gpcAdoptionRate(provider_view),
      topic_distribution:      topicDistribution(provider_view),
      publisher_reach:         publisherReach(provider_view),
      inferred_user_interests: inferUserInterests(provider_view, user_id),
    },
    note: 'Commitments constrain use, not visibility. The user cannot verify them at protocol layer.',
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
