/**
 * Signal-drop experiment (Step 6).
 *
 * An intermediate agent strips the MCP _meta field before forwarding.
 * The GPC signal disappears silently: Layer 4 sees no signal and all tools
 * execute as if GPC were off — even though the user opted out.
 *
 * This is the empirical motivation for why a spec-level propagation
 * requirement is needed.
 */

const fs = require('fs');
const path = require('path');
const thirdParty = require('../agents/third_party_storage.js');
const { handleRequest } = require('../orchestrator/orchestrator.js');
const { encodeBaggage } = require('../orchestrator/baggage.js');

const OUTPUT = path.join(__dirname, '..', 'output', 'signal_drop_result.json');

async function main() {
  const srv = await thirdParty.start();

  const timing = [];
  const result = await handleRequest({
    query: 'Help me plan a 5-day trip to Japan — what should I see, eat, and know before I go?',
    user_id: 'user-42',
    baggageHeader: encodeBaggage({ gpc: '1' }),   // user has opted out
    dropSignal: true,                              // but one agent strips the meta
    timing,
  });

  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log('Signal-drop run complete →', OUTPUT);
  console.log(JSON.stringify(result, null, 2));

  srv.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
