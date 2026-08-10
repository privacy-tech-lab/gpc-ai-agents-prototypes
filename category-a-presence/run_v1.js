'use strict';

const manifest = require('./presence_manifest');
const orchestrator = require('./orchestrator');

const PLATFORM_VERSION = 'v1.0';

async function main() {
  manifest.reset();

  console.log(`=== Category A (Presence): NoteFlow ${PLATFORM_VERSION} ===`);
  console.log('Fresh install. No AI features exist in this version.\n');

  const { results, presenceEvents } = await orchestrator.run(PLATFORM_VERSION, null);

  const output = {
    platform_version: PLATFORM_VERSION,
    feature_invocations: results,
    presence_events: presenceEvents,
    manifest_final: manifest.load(),
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch(console.error);
