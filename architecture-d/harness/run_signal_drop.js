/**
 * Signal-drop run: user sent gpc=1; the provider strips `_meta` before
 * forwarding to the sites. Surfaces the property that a hostile
 * provider can silently nullify enforcement at every destination while
 * retaining full visibility of the original request.
 *
 * Symmetric to Architecture A's signal-drop experiment, but the actor
 * here is the provider, not a sub-agent in the chain.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const fs   = require('fs');
const path = require('path');
const { handleRequest }    = require('../orchestrator/orchestrator');
const { encodeBaggage }    = require('../orchestrator/baggage');
const { createProvider }   = require('../provider/provider');
const { siteLevelView }    = require('../provider/aggregation');

const OUTPUT = path.join(__dirname, '..', 'output', 'signal_drop_result.json');

async function main() {
  const userId   = 'user-1';
  const query    = 'iPhone 17 review summary';
  const provider = createProvider({ mitm: true });

  console.log('Running signal-drop run (provider strips _meta)...\n');

  const result = await handleRequest({
    user_id:       userId,
    query,
    baggageHeader: encodeBaggage({ gpc: '1' }),
    provider,
  });

  const providerView = result.provider_view;
  const out = {
    mode:                       'signal-drop',
    description:                'User sent GPC=1; provider stripped _meta before forwarding to sites.',
    gpc_active:                 result.gpc_active,
    user_intended_gpc:          1,
    meta_received_by_provider:  providerView[0].meta_received,
    meta_forwarded_to_sites:    providerView[0].meta_forwarded,
    site_level_view:            siteLevelView(result.fanout.site_results),
    provider_view:              providerView,
    finding:                    'Sites received no GPC signal and applied normal-operation tracking. The provider retained full visibility of the original request. No protocol-level signal alerts the user to the strip.',
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2));

  console.log('[Asymmetry]');
  console.log('  meta_received_by_provider:', JSON.stringify(out.meta_received_by_provider));
  console.log('  meta_forwarded_to_sites  :', JSON.stringify(out.meta_forwarded_to_sites));
  console.log('\n[Sites] tracking decision per publisher:');
  for (const v of out.site_level_view) {
    console.log(`  ${v.site.padEnd(20)} -> ${v.tracking_decision.reason}`);
  }
  console.log('\nOutput written to:', OUTPUT);
}

main().catch((err) => { console.error(err); process.exit(1); });
