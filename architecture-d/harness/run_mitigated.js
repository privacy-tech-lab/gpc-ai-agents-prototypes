/**
 * Mitigated run: gpc=1 with provider-side E2 commitments active.
 * The commitments tag the observation log; they do not change what the
 * provider observes. The user has no protocol-level way to verify they
 * were honored — that is Architecture E's domain.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const fs   = require('fs');
const path = require('path');
const { handleRequest }                              = require('../orchestrator/orchestrator');
const { encodeBaggage }                              = require('../orchestrator/baggage');
const { createProvider }                             = require('../provider/provider');
const { noTrainCommitment, kAnonymity, dpNoise, chain } = require('../provider/mitigations');
const {
  gpcAdoptionRate, topicDistribution, publisherReach,
  inferUserInterests, siteLevelView,
}                                                    = require('../provider/aggregation');

const OUTPUT = path.join(__dirname, '..', 'output', 'mitigated_result.json');

async function main() {
  const userId       = 'user-1';
  const query        = 'iPhone 17 review summary';
  const mitigations  = chain(noTrainCommitment(), kAnonymity(5), dpNoise(1.0));
  const provider     = createProvider({ mitigations });

  console.log('Running mitigated run (GPC on; E2 commitments active)...\n');

  const result = await handleRequest({
    user_id:       userId,
    query,
    baggageHeader: encodeBaggage({ gpc: '1' }),
    provider,
  });

  const providerView = result.provider_view;
  const out = {
    mode:                'mitigated',
    description:         'GPC on with provider-side commitments: no_train + k-anonymity (k=5) + DP noise (eps=1.0).',
    gpc_active:          result.gpc_active,
    meta_envelope:       result.meta_envelope,
    mitigation_chain:    mitigations.name,
    user_facing_summary: `${result.fanout.site_results.length} review snippets returned`,
    site_level_view:     siteLevelView(result.fanout.site_results),
    provider_view:       providerView,
    provider_derivations: {
      gpc_adoption_rate:        gpcAdoptionRate(providerView),
      topic_distribution:       topicDistribution(providerView),
      publisher_reach:          publisherReach(providerView),
      inferred_user_interests:  inferUserInterests(providerView, userId),
    },
    note: 'k=5 and epsilon=1.0 are illustrative defaults. Real deployments would tune these to the population and threat model.',
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2));

  console.log('[Mitigations] chain:', mitigations.name);
  console.log('[Provider observation]');
  console.log('  do_not_train     :', providerView[0].do_not_train);
  console.log('  k_anon_suppressed:', providerView[0].k_anon_suppressed);
  console.log('  cohort_size      :', providerView[0].cohort_size);
  console.log('\nOutput written to:', OUTPUT);
}

main().catch((err) => { console.error(err); process.exit(1); });
