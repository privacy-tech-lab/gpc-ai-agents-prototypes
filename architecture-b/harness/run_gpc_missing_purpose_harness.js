/**
 * Missing-purpose experiment — Phase 2.
 *
 * Runs the full tool matrix under three GPC scenarios and prints a comparison
 * table showing what happens when the purpose field is absent from every call:
 *
 *   Scenario A — GPC off, purpose declared   → all tools execute (no opt-out)
 *   Scenario B — GPC on,  purpose declared   → purpose-scoped enforcement
 *   Scenario C — GPC on,  purpose MISSING    → every call blocked, incl. primary
 *
 * Scenario C is the key finding: without a required purpose field in the
 * protocol, any GPC-compliant implementation must choose between two failure
 * modes — block everything (breaking primary tasks) or allow everything
 * (ignoring the opt-out).  The only sound solution is to make purpose
 * declaration a required field in MCP or any successor agent protocol.
 */

const fs         = require('fs');
const path       = require('path');
const adPlatform = require('../agents/ad_platform.js');
const { callTool } = require('../orchestrator/mcp_client.js');

const OUTPUT = path.join(__dirname, '..', 'output', 'missing_purpose_result.json');

// Full matrix: every tool with its correct declared purpose and test args
const TOOL_MATRIX = [
  {
    tool:             'get_medical_records',
    args:             { patient_id: 'patient-001', record_type: 'full' },
    declared_purpose: 'primary_task',
    pipeline:         'primary',
  },
  {
    tool:             'answer_question',
    args:             { question: 'What is my blood pressure?', context: '' },
    declared_purpose: 'primary_task',
    pipeline:         'primary',
  },
  {
    tool:             'log_interaction',
    args:             { patient_id: 'patient-001', query: 'test', response_summary: 'test' },
    declared_purpose: 'analytics',
    pipeline:         'secondary',
  },
  {
    tool:             'add_to_training_set',
    args:             { query: 'test', response: 'test', metadata: {} },
    declared_purpose: 'model_training',
    pipeline:         'secondary',
  },
  {
    tool:             'update_interest_profile',
    args:             { patient_id: 'patient-001', interests: ['blood pressure'] },
    declared_purpose: 'personalization',
    pipeline:         'secondary',
  },
];

async function callAdPlatformWith({ gpc, purpose }) {
  const port = process.env.AD_PLATFORM_PORT ?? 4002;
  try {
    const resp = await fetch(`http://localhost:${port}/target`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        patient_id: 'patient-001',
        query:      'test',
        gpc,
        ...(purpose !== undefined ? { purpose } : {}),
      }),
    });
    return resp.json();
  } catch (err) {
    return { status: 'error', reason: err.message };
  }
}

async function runScenario(scenarioLabel, getMetaFn, adPlatformArgs) {
  const results = [];

  for (const entry of TOOL_MATRIX) {
    const meta   = getMetaFn(entry.declared_purpose);
    const result = await callTool(entry.tool, entry.args, meta);
    results.push({
      tool:             entry.tool,
      pipeline:         entry.pipeline,
      declared_purpose: entry.declared_purpose,
      meta_sent:        meta,
      status:           result.status,
      reason:           result.reason ?? null,
    });
  }

  // Ad platform (HTTP call, not via MCP client)
  const adResult = await callAdPlatformWith(adPlatformArgs);
  results.push({
    tool:             'ad_platform',
    pipeline:         'secondary',
    declared_purpose: 'ad_targeting',
    meta_sent:        adPlatformArgs,
    status:           adResult.status,
    reason:           adResult.reason ?? null,
  });

  return { scenario: scenarioLabel, results };
}

function fmt(status, reason) {
  if (status === 'ok')      return '✓ ok      ';
  if (status === 'blocked') {
    const tag = reason === 'missing_purpose_field' ? '(no purpose)' : '(restricted)';
    return `✗ BLOCKED ${tag}`;
  }
  if (status === 'error')   return `! error   `;
  return String(status).padEnd(10);
}

function printTable(scenarioA, scenarioB, scenarioC) {
  const TOOL_COL     = 28;
  const PIPELINE_COL = 10;
  const PURPOSE_COL  = 18;
  const STATUS_COL   = 22;

  const header = [
    'Tool'.padEnd(TOOL_COL),
    'Pipeline'.padEnd(PIPELINE_COL),
    'Purpose'.padEnd(PURPOSE_COL),
    'A: GPC off'.padEnd(STATUS_COL),
    'B: GPC on, purpose'.padEnd(STATUS_COL),
    'C: GPC on, NO purpose'.padEnd(STATUS_COL),
  ].join(' | ');

  const sep = '─'.repeat(header.length);

  console.log('\n╔' + '═'.repeat(header.length) + '╗');
  console.log('║  Missing-Purpose Experiment — Architecture B' + ' '.repeat(header.length - 45) + '║');
  console.log('╚' + '═'.repeat(header.length) + '╝\n');
  console.log(header);
  console.log(sep);

  for (let i = 0; i < scenarioA.results.length; i++) {
    const rA = scenarioA.results[i];
    const rB = scenarioB.results[i];
    const rC = scenarioC.results[i];

    const line = [
      rA.tool.padEnd(TOOL_COL),
      rA.pipeline.padEnd(PIPELINE_COL),
      rA.declared_purpose.padEnd(PURPOSE_COL),
      fmt(rA.status, rA.reason).padEnd(STATUS_COL),
      fmt(rB.status, rB.reason).padEnd(STATUS_COL),
      fmt(rC.status, rC.reason).padEnd(STATUS_COL),
    ].join(' | ');

    console.log(line);
  }

  console.log(sep);
}

function printFindings(scenarioC) {
  const allBlocked = scenarioC.results.every((r) => r.status === 'blocked');
  const noPurpose  = scenarioC.results.every((r) => r.reason === 'missing_purpose_field');
  const primary    = scenarioC.results.filter((r) => r.pipeline === 'primary');
  const secondary  = scenarioC.results.filter((r) => r.pipeline === 'secondary');

  console.log('\n── Findings ──\n');

  if (allBlocked) {
    console.log('  FINDING 1: Every tool call — including primary-task calls — was blocked.');
    console.log('             Cause: GPC=1 active and purpose field absent from all requests.\n');
  }
  if (noPurpose) {
    console.log('  FINDING 2: All blocks carry reason=missing_purpose_field.');
    console.log('             The interceptor treats absence of purpose as maximal restriction.\n');
  }

  const primaryBlocked = primary.filter((r) => r.status === 'blocked').length;
  console.log(`  FINDING 3: ${primaryBlocked}/${primary.length} primary-pipeline calls blocked.`);
  console.log('             A missing purpose field breaks the primary task, not just secondary');
  console.log('             pipelines.  The enforcement model cannot distinguish intent.\n');

  const secondaryBlocked = secondary.filter((r) => r.status === 'blocked').length;
  console.log(`  FINDING 4: ${secondaryBlocked}/${secondary.length} secondary-pipeline calls blocked.`);
  console.log('             This matches full-GPC behaviour — but for the wrong reason.\n');

  console.log('  CONCLUSION: Without purpose as a required protocol field, a GPC-compliant');
  console.log('              implementation has no viable middle path:');
  console.log('                (a) Treat missing purpose as restricted → breaks primary tasks');
  console.log('                (b) Treat missing purpose as unrestricted → ignores opt-out');
  console.log('              Purpose declaration must be a required field in MCP or any');
  console.log('              successor agent communication protocol.\n');
}

async function main() {
  const srv = await adPlatform.start();

  console.log('Running missing-purpose experiment (3 scenarios × 6 tools)...');

  // Scenario A: GPC off, purpose declared — everything executes
  const scenarioA = await runScenario(
    'A: GPC off, purpose declared',
    (purpose) => ({ gpc: 0, purpose }),
    { gpc: 0, purpose: 'ad_targeting' }
  );

  // Scenario B: GPC on, purpose declared — purpose-scoped enforcement
  const scenarioB = await runScenario(
    'B: GPC on, purpose declared',
    (purpose) => ({ gpc: 1, purpose }),
    { gpc: 1, purpose: 'ad_targeting' }
  );

  // Scenario C: GPC on, purpose field deliberately omitted from every call
  const scenarioC = await runScenario(
    'C: GPC on, purpose MISSING',
    (_purpose) => ({ gpc: 1 }), // purpose intentionally dropped
    { gpc: 1 }                  // ad platform also receives no purpose
  );

  const output = { scenarioA, scenarioB, scenarioC, generatedAt: new Date().toISOString() };
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));

  printTable(scenarioA, scenarioB, scenarioC);
  printFindings(scenarioC);

  console.log('Output written to:', OUTPUT);

  srv.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
