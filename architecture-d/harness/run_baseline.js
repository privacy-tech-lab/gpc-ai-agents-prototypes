/**
 * Baseline run: no GPC signal.
 * Fanout to every publisher in the registry; every site applies its
 * default tracking policy. Reference for the GPC run to compare against.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const fs   = require('fs');
const path = require('path');
const { handleRequest }                                  = require('../orchestrator/orchestrator');
const { encodeBaggage }                                  = require('../orchestrator/baggage');
const {
  gpcAdoptionRate, topicDistribution, publisherReach,
  inferUserInterests, siteLevelView,
}                                                        = require('../provider/aggregation');

const OUTPUT = path.join(__dirname, '..', 'output', 'baseline_result.json');

async function main() {
  const userId = 'user-1';
  const query  = 'iPhone 17 review summary';

  console.log('Running baseline (GPC off)...\n');

  const result = await handleRequest({
    user_id:       userId,
    query,
    baggageHeader: '',
  });

  const providerView = result.provider_view;
  const out = {
    mode:                'baseline',
    description:         'GPC off; single user; fanout to all publishers.',
    gpc_active:          result.gpc_active,
    meta_envelope:       result.meta_envelope,
    user_facing_summary: `${result.fanout.site_results.length} review snippets returned`,
    site_level_view:     siteLevelView(result.fanout.site_results),
    provider_view:       providerView,
    provider_derivations: {
      gpc_adoption_rate:        gpcAdoptionRate(providerView),
      topic_distribution:       topicDistribution(providerView),
      publisher_reach:          publisherReach(providerView),
      inferred_user_interests:  inferUserInterests(providerView, userId),
    },
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2));

  console.log('[Sites] tracking decision per publisher:');
  for (const v of out.site_level_view) {
    console.log(`  ${v.site.padEnd(20)} -> ${v.tracking_decision.reason}`);
  }
  console.log('\n[Provider] observed:');
  console.log('  query        :', providerView[0].query);
  console.log('  query_topic  :', providerView[0].query_topic);
  console.log('  meta_received:', JSON.stringify(providerView[0].meta_received));
  console.log('\nOutput written to:', OUTPUT);
}

main().catch((err) => { console.error(err); process.exit(1); });
