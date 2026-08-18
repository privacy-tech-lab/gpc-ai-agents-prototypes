/**
 * GPC run: gpc=1.
 * Fanout to every publisher; strict publishers suppress logging and
 * profile write; the provider observation log is unchanged from the
 * baseline run. The structural finding of the architecture.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const fs   = require('fs');
const path = require('path');
const { handleRequest } = require('../orchestrator/orchestrator');
const { encodeBaggage } = require('../orchestrator/baggage');
const { closeClient }   = require('../provider/mcp_client');
const {
  gpcAdoptionRate, topicDistribution, publisherReach,
  inferUserInterests, siteLevelView,
} = require('../provider/aggregation');

const OUTPUT = path.join(__dirname, '..', 'output', 'gpc_result.json');

async function main() {
  const userId = 'user-1';
  const query  = 'iPhone 17 review summary';

  console.log('Running GPC run (GPC on)...\n');

  const result = await handleRequest({
    user_id:       userId,
    query,
    baggageHeader: encodeBaggage({ gpc: '1' }),
  });

  const providerView = result.provider_view;
  const out = {
    mode:                'gpc',
    description:         'GPC on; single user; fanout to all publishers. Sites enforce; provider still observes the same fields it observed in baseline.',
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
    structural_finding: 'Site-level enforcement does not constrain provider visibility. provider_view here is field-for-field equivalent to the baseline run; only site_level_view changes.',
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2));

  console.log('[Sites] tracking decision per publisher:');
  for (const v of out.site_level_view) {
    console.log(`  ${v.site.padEnd(20)} -> ${v.tracking_decision.reason}`);
  }
  console.log('\n[Provider] still observes:');
  console.log('  query        :', providerView[0].query);
  console.log('  query_topic  :', providerView[0].query_topic);
  console.log('  meta_received:', JSON.stringify(providerView[0].meta_received));
  console.log('\nOutput written to:', OUTPUT);

  await closeClient();
}

main().catch(async (err) => { console.error(err); await closeClient(); process.exit(1); });
