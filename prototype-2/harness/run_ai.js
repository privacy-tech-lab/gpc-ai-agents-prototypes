/**
 * AI run: Ollama drives the medical agent, then the orchestrator fans the
 * answer out to the three secondary purposes. Same gate as the scripted
 * runs; the only difference is that a real model produces the answer and
 * decides to call get_medical_records. Requires a running Ollama instance
 * with the configured model loaded (default qwen2.5:14b).
 *
 *   node run_ai.js                              # no GPC: all pipelines execute
 *   node run_ai.js --gpc                        # full opt-out: all pipelines blocked
 *   node run_ai.js --gpc --scope=ad_targeting   # partial: only ad_targeting blocked
 */

const fs   = require('fs');
const path = require('path');
const medicalAgent = require('../agents/medical_agent');
const { fanOutSecondaryPurposes } = require('../orchestrator/orchestrator');
const { start: startAdPlatform }  = require('../services/adPlatform');
const { closeClient }             = require('../orchestrator/mcp_client');
const { MODEL }                   = require('../orchestrator/agent_loop');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const QUERY      = 'What does my blood pressure reading mean, and should I adjust my medication?';

function parseArgs(argv) {
  const gpc      = argv.includes('--gpc');
  const scopeArg = argv.find((a) => a.startsWith('--scope='));
  const scope    = scopeArg ? scopeArg.slice('--scope='.length).split(',').filter(Boolean) : undefined;
  if (scope && !gpc) {
    console.error('Usage: node run_ai.js [--gpc [--scope=purpose,purpose]]  (--scope needs --gpc)');
    process.exit(1);
  }
  const privacyContext = {};
  if (gpc) privacyContext.gpc = 1;
  if (scope) privacyContext.gpc_scope = scope;
  const label = !gpc ? 'baseline' : scope ? 'partial' : 'gpc';
  return { privacyContext, label };
}

async function main() {
  const { privacyContext, label } = parseArgs(process.argv.slice(2));
  const RESULT_FILE = path.join(OUTPUT_DIR, `ai_${label}_result.json`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const f of ['analytics_log.json', 'training_dataset.jsonl', 'ad_vector_store.json']) {
    const p = path.join(OUTPUT_DIR, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  const srv = await startAdPlatform(4002);

  console.log(`Running AI ${label} (Ollama; ${JSON.stringify(privacyContext)})...\n`);

  const { finalResponse, toolCalls } = await medicalAgent.run({
    query: QUERY,
    patient_id: 'patient-001',
    privacyContext,
  });

  const secondaryEffects = await fanOutSecondaryPurposes({
    privacyContext,
    patient_id: 'patient-001',
    query:      QUERY,
    response:   finalResponse,
  });

  fs.writeFileSync(RESULT_FILE, JSON.stringify({
    mode: `ai-${label}`,
    model: MODEL,
    privacyContext,
    toolCalls,
    response: finalResponse,
    secondaryEffects,
  }, null, 2));

  console.log('Model:', MODEL);
  console.log('[Model] tool calls:');
  for (const tc of toolCalls) console.log(`  ${tc.tool}  ${JSON.stringify(tc.input)}`);
  console.log('\n[Answer]\n', finalResponse);
  console.log('\n[Secondary effects]');
  for (const [k, v] of Object.entries(secondaryEffects)) {
    console.log(`  ${k.padEnd(16)} -> ${v.status}`);
  }
  console.log('\nOutput written to:', RESULT_FILE);

  srv.close();
  await closeClient();
}

main().catch(async (err) => {
  console.error('ai run failed:', err.message);
  console.error('Is Ollama running? Try: ollama serve && ollama pull qwen2.5:14b');
  await closeClient();
  process.exit(1);
});
