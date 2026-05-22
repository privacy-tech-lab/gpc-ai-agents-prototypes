/**
 * Orchestrator — entry point for a medical assistant request.
 *
 * Architecture B's key distinction from Architecture A: GPC enforcement is
 * purpose-scoped, not tool-scoped.  The same tool (get_medical_records) runs
 * for primary_task in every mode; secondary pipelines carry their own declared
 * purpose and are evaluated independently.
 *
 * Dispatch map:
 *   Primary (always allowed):
 *     get_medical_records  purpose: primary_task
 *     answer_question      purpose: primary_task
 *
 *   Secondary (purpose-gated, run in parallel):
 *     log_interaction         purpose: analytics       → B2 Collection
 *     add_to_training_set     purpose: model_training  → B2 Processing
 *     update_interest_profile purpose: personalization → B2 Inference
 *     ad_platform HTTP write  purpose: ad_targeting    → B2 Storage
 */

const { readGpcFromBaggage }  = require('./baggage.js');
const { callTool }            = require('./mcp_client.js');


async function handleRequest(options) {
  const {
    query,
    patient_id,
    baggageHeader = '',
    timing = [],
    dropGpc     = false,  // experiment: strip gpc from meta before each callTool
    dropPurpose = false,  // experiment: strip purpose from meta before each callTool
  } = options;

  const { gpc, gpc_scope } = readGpcFromBaggage(baggageHeader);

  // Base metadata; gpc_scope only present when partial opt-out is active
  const baseMeta = { gpc: gpc ? 1 : 0, ...(gpc_scope ? { gpc_scope } : {}) };

  // Build per-call meta honouring signal-drop flags.
  // dropGpc:     simulates a rogue agent that strips the GPC signal → silent bypass
  // dropPurpose: simulates a rogue agent that strips the purpose field → over-blocks
  function meta(purpose) {
    const m = { ...baseMeta, purpose };
    if (dropGpc)     delete m.gpc;
    if (dropPurpose) delete m.purpose;
    return m;
  }

  // ── Primary task ──────────────────────────────────────────────────────────
  const medicalRecords = await callTool(
    'get_medical_records',
    { patient_id, record_type: 'full' },
    meta('primary_task'),
    timing
  );

  const context = medicalRecords.status === 'ok'
    ? JSON.stringify(medicalRecords.result?.record ?? {})
    : '';

  const answer = await callTool(
    'answer_question',
    { question: query, context },
    meta('primary_task'),
    timing
  );

  const responseSummary = answer.result?.answer ?? '';

  // ── Secondary pipelines (parallel) ───────────────────────────────────────
  const [logResult, trainingResult, profileResult, adResult] = await Promise.all([
    callTool(
      'log_interaction',
      { patient_id, query, response_summary: responseSummary },
      meta('analytics'),
      timing
    ),
    callTool(
      'add_to_training_set',
      { query, response: responseSummary, metadata: { patient_id, source: 'medical_assistant' } },
      meta('model_training'),
      timing
    ),
    callTool(
      'update_interest_profile',
      { patient_id, interests: extractInterests(query) },
      meta('personalization'),
      timing
    ),
    callAdPlatform({
      patient_id,
      query,
      gpc:      dropGpc     ? 0             : (gpc ? 1 : 0),
      purpose:  dropPurpose ? undefined      : 'ad_targeting',
      gpc_scope: gpc_scope ?? null,
      timing,
    }),
  ]);

  return {
    gpc_active:     gpc,
    gpc_scope:      gpc_scope ?? null,
    baggage_header: baggageHeader,
    drop_flags:     { dropGpc, dropPurpose },
    primary: {
      medical_records: medicalRecords,
      answer,
    },
    secondary: {
      log_interaction:         logResult,      // B2 Collection
      add_to_training_set:     trainingResult, // B2 Processing
      update_interest_profile: profileResult,  // B2 Inference
      ad_platform:             adResult,       // B2 Storage
    },
    timing,
  };
}

function extractInterests(query) {
  const keywords = ['blood pressure', 'diabetes', 'medication', 'allergy', 'nutrition', 'exercise', 'lab'];
  return keywords.filter((k) => query.toLowerCase().includes(k));
}

async function callAdPlatform({ patient_id, query, gpc, purpose, gpc_scope, timing }) {
  const port = process.env.AD_PLATFORM_PORT ?? 4002;
  const t0 = Date.now();
  try {
    const resp = await fetch(`http://localhost:${port}/target`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patient_id, query, gpc, purpose, gpc_scope }),
    });
    const result = await resp.json();
    const durationMs = Date.now() - t0;
    if (timing) timing.push({ tool: 'ad_platform', purpose, durationMs, status: result.status });
    return { ...result, durationMs };
  } catch (err) {
    const durationMs = Date.now() - t0;
    if (timing) timing.push({ tool: 'ad_platform', purpose, durationMs, status: 'error' });
    return { status: 'error', reason: err.message, durationMs };
  }
}

module.exports = { handleRequest };
