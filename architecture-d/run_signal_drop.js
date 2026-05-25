'use strict';

require('dotenv').config();

/**
 * Mode: signal-drop — provider strips _meta before forwarding to sites.
 *
 * The threat model property this surfaces: the provider has both
 * visibility (it logs the user's intended GPC=1) and the technical
 * capability to silently nullify enforcement at the destination. The
 * user cannot tell from the response that the strip happened. Sites
 * cannot tell that the orchestrator sent GPC=1.
 *
 * Symmetric to Architecture A's signal-drop experiment, but the actor
 * here is the provider rather than an intermediate sub-agent.
 */

const { createProvider } = require('./provider');
const { fanoutAll } = require('./orchestrator');
const { siteLevelView } = require('./aggregation');

async function main() {
  const provider = createProvider({ mitm: true });
  const user_id  = 'user-1';
  const query    = 'iPhone 17 review summary';

  const result = await fanoutAll(provider, user_id, query, { gpc: 1 });
  const provider_view = provider.getProviderView();

  const out = {
    mode: 'signal-drop',
    description: 'User sent GPC=1; provider stripped _meta before forwarding to sites.',
    user_intended_gpc: 1,
    meta_received_by_provider: provider_view[0].meta_received,
    meta_forwarded_to_sites:   provider_view[0].meta_forwarded,
    site_level_view: siteLevelView(result.site_results),
    finding: 'Sites received no GPC signal and applied normal-operation tracking. The provider retained full visibility of the original request. No protocol-level signal alerts the user to the strip.',
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
