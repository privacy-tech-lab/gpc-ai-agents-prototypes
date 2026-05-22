/**
 * C/D category demonstration — Phase 3.
 *
 * Runs the full tool matrix (B2 + C/D) under three GPC scenarios and prints a
 * comparison table that shows purpose-scoped enforcement working identically
 * across B2, Category C, and Category D purposes — without any changes to the
 * interceptor logic.
 *
 * Scenario A — GPC off:
 *   All B2 and C/D tools execute.
 *
 * Scenario B — Full GPC (gpc=1, no scope):
 *   Every secondary purpose blocked.  Both B2 and C/D purposes are restricted.
 *
 * Scenario C — CD-only partial opt-out (gpc_scope=cross_context_sale|cross_context_sharing|sensitive_data_inference):
 *   B2 secondary pipelines (analytics, model_training, personalization) execute.
 *   Only Category C and D purposes are blocked.
 *   A patient can opt out of having their data sold or used for risk scoring
 *   without blocking the operational analytics that keep the service running.
 *
 * The key architectural finding: withPurposeCheck() required zero changes to
 * handle C/D categories.  Only the registry entries were new.
 */

const fs         = require('fs');
const path       = require('path');
const adPlatform = require('../agents/ad_platform.js');
const { callTool } = require('../orchestrator/mcp_client.js');
const { encodeBaggage } = require('../orchestrator/baggage.js');

const OUTPUT = path.join(__dirname, '..', 'output', 'cd_categories_result.json');

const PATIENT_ID = 'patient-001';
const QUERY      = 'What does my blood pressure reading mean, and should I adjust my medication?';

// Full matrix: B2 tools + C/D tools with their declared purposes
const TOOL_MATRIX = [
  // Primary (always expected to run)
  { tool: 'get_medical_records',          args: { patient_id: PATIENT_ID, record_type: 'full' },                                         purpose: 'primary_task',            category: 'Primary' },
  { tool: 'answer_question',              args: { question: QUERY, context: '' },                                                         purpose: 'primary_task',            category: 'Primary' },
  // B2 secondary pipelines
  { tool: 'log_interaction',              args: { patient_id: PATIENT_ID, query: QUERY, response_summary: 'test' },                       purpose: 'analytics',               category: 'B2 Collection' },
  { tool: 'add_to_training_set',          args: { query: QUERY, response: 'test', metadata: {} },                                         purpose: 'model_training',          category: 'B2 Processing' },
  { tool: 'update_interest_profile',      args: { patient_id: PATIENT_ID, interests: ['blood pressure', 'medication'] },                  purpose: 'personalization',         category: 'B2 Inference' },
  // C/D secondary pipelines
  { tool: 'sell_to_data_broker',          args: { patient_id: PATIENT_ID, record_snapshot: 'hypertension, metformin' },                   purpose: 'cross_context_sale',      category: 'C Sale' },
  { tool: 'share_with_research_partner',  args: { patient_id: PATIENT_ID, study_id: 'HTN-2025', data_subset: 'conditions,lab_results' },  purpose: 'cross_context_sharing',   category: 'C Sharing' },
  { tool: 'infer_sensitive_attributes',   args: { patient_id: PATIENT_ID, records: JSON.stringify({ conditions: ['hypertension', 'type 2 diabetes'], medications: ['metformin', 'lisinopril'] }) }, purpose: 'sensitive_data_inference', category: 'D Inference' },
];

async function callAdPlatformWith({ gpc, purpose, gpc_scope }) {
  const port = process.env.AD_PLATFORM_PORT ?? 4002;
  try {
    const resp = await fetch(`http://localhost:${port}/target`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ patient_id: PATIENT_ID, query: QUERY, gpc, purpose, gpc_scope: gpc_scope ?? null }),
    });
    return resp.json();
  } catch (err) {
    return { status: 'error', reason: err.message };
  }
}

async function runScenario(label, getMetaFn, adArgs) {
  const rows = [];

  for (const entry of TOOL_MATRIX) {
    const meta   = getMetaFn(entry.purpose);
    const result = await callTool(entry.tool, entry.args, meta);
    rows.push({
      tool:     entry.tool,
      category: entry.category,
      purpose:  entry.purpose,
      status:   result.status,
      reason:   result.reason ?? null,
    });
  }

  // ad_platform (HTTP, not MCP)
  const adResult = await callAdPlatformWith(adArgs);
  rows.push({
    tool:     'ad_platform',
    category: 'B2 Storage',
    purpose:  'ad_targeting',
    status:   adResult.status,
    reason:   adResult.reason ?? null,
  });

  return { label, rows };
}

function fmt(status, reason) {
  if (status === 'ok')      return '✓ ok      ';
  if (status === 'blocked') return reason === 'missing_purpose_field' ? '✗ BLOCKED(no purp)' : '✗ BLOCKED ';
  if (status === 'error')   return '! error   ';
  return String(status).slice(0, 10);
}

function printTable(a, b, c) {
  const TOOL_COL = 30;
  const CAT_COL  = 14;
  const PUR_COL  = 24;
  const STA_COL  = 18;

  const header = [
    'Tool'.padEnd(TOOL_COL),
    'Category'.padEnd(CAT_COL),
    'Purpose'.padEnd(PUR_COL),
    'A: GPC off'.padEnd(STA_COL),
    'B: Full GPC'.padEnd(STA_COL),
    'C: CD-only scope'.padEnd(STA_COL),
  ].join(' | ');
  const sep = '─'.repeat(header.length);

  console.log('\n╔' + '═'.repeat(header.length) + '╗');
  console.log('║  C/D Category Experiment — Architecture B' + ' '.repeat(header.length - 42) + '║');
  console.log('║  Scenario C scope: cross_context_sale | cross_context_sharing | sensitive_data_inference' + ' '.repeat(header.length - 90) + '║');
  console.log('╚' + '═'.repeat(header.length) + '╝\n');
  console.log(header);
  console.log(sep);

  for (let i = 0; i < a.rows.length; i++) {
    const rA = a.rows[i];
    const rB = b.rows[i];
    const rC = c.rows[i];
    console.log([
      rA.tool.padEnd(TOOL_COL),
      rA.category.padEnd(CAT_COL),
      rA.purpose.padEnd(PUR_COL),
      fmt(rA.status, rA.reason).padEnd(STA_COL),
      fmt(rB.status, rB.reason).padEnd(STA_COL),
      fmt(rC.status, rC.reason).padEnd(STA_COL),
    ].join(' | '));
  }
  console.log(sep);
}

function printFindings(a, b, c) {
  const b2InC  = c.rows.filter((r) => ['B2 Collection', 'B2 Processing', 'B2 Inference', 'B2 Storage'].includes(r.category));
  const cdInC  = c.rows.filter((r) => ['C Sale', 'C Sharing', 'D Inference'].includes(r.category));
  const b2Pass = b2InC.every((r) => r.status === 'ok');
  const cdFail = cdInC.every((r) => r.status === 'blocked');

  console.log('\n── Findings ──\n');

  if (b2Pass) {
    console.log('  FINDING 1: In Scenario C, all B2 secondary pipelines (analytics, model_training,');
    console.log('             personalization, ad_targeting) executed normally.');
  }
  if (cdFail) {
    console.log('  FINDING 2: In Scenario C, all C/D pipelines (cross_context_sale,');
    console.log('             cross_context_sharing, sensitive_data_inference) were blocked.');
  }
  if (b2Pass && cdFail) {
    console.log('\n  FINDING 3: Purpose-scoped enforcement allows a patient to opt out of');
    console.log('             cross-context data sale and sensitive risk-score inference');
    console.log('             while retaining full operational analytics.');
    console.log('             This level of granularity is impossible with tool-level blocking.\n');
  }

  console.log('  FINDING 4: withPurposeCheck() required zero code changes to enforce');
  console.log('             C and D category purposes.  Only three registry entries were');
  console.log('             added.  The interceptor is category-agnostic by design.\n');
}

async function main() {
  const srv = await adPlatform.start();

  const CD_SCOPE = ['cross_context_sale', 'cross_context_sharing', 'sensitive_data_inference'];

  console.log('Running C/D category experiment (3 scenarios × 9 tools)...\n');

  const scenarioA = await runScenario(
    'A: GPC off',
    (purpose) => ({ gpc: 0, purpose }),
    { gpc: 0, purpose: 'ad_targeting' }
  );

  const scenarioB = await runScenario(
    'B: Full GPC',
    (purpose) => ({ gpc: 1, purpose }),
    { gpc: 1, purpose: 'ad_targeting' }
  );

  const scenarioC = await runScenario(
    'C: CD-only scope',
    (purpose) => ({ gpc: 1, purpose, gpc_scope: CD_SCOPE }),
    { gpc: 1, purpose: 'ad_targeting', gpc_scope: CD_SCOPE }
  );

  const output = { scenarioA, scenarioB, scenarioC, generatedAt: new Date().toISOString() };
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));

  printTable(scenarioA, scenarioB, scenarioC);
  printFindings(scenarioA, scenarioB, scenarioC);

  console.log('Output written to:', OUTPUT);
  srv.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
