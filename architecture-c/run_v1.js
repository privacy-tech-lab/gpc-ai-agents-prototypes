'use strict';

const manifest = require('./consent_manifest');
const orchestrator = require('./orchestrator');

const PLATFORM_VERSION = 'v1.0';

async function main() {
  manifest.reset();

  console.log(`=== Architecture C — Platform ${PLATFORM_VERSION} ===`);
  console.log('Manifest reset to v1.0. Approved: file_access, external_api.\n');

  const { results, quarantineEvents } = await orchestrator.run(PLATFORM_VERSION, null);

  const output = {
    platform_version: PLATFORM_VERSION,
    tool_invocations: results,
    quarantine_events: quarantineEvents,
    manifest_final: manifest.load(),
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch(console.error);
