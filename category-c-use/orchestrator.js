'use strict';

/**
 * orchestrator.js
 *
 * One scripted HealthAssist session. The primary answer is produced first
 * and is never gated. Then the platform attempts every downstream use, and
 * the task's sub-agent chain runs its two hops. Each attempt goes through
 * the use gate with the resolved opt-out set.
 */

const gate = require('./use_gate');
const fixture = require('./session_fixture');
const { createOutputs, snapshotAll } = require('./stores');

const USE_SEQUENCE = [
  { use: 'primary_answer', subtype: null, store: null },
  { use: 'insurance_risk_assessment', subtype: 'c1', store: 'insurance_assessments' },
  { use: 'personalization_update', subtype: 'c1a', store: 'personalization_profile' },
  { use: 'analytics_aggregation', subtype: 'c2', store: 'analytics_log' },
  { use: 'ad_targeting', subtype: 'c2a', store: 'ad_queue' },
  { use: 'training_append', subtype: 'c3', store: 'training_set' },
];

const CHAIN = [
  { hop: 'pharmacy_price_agent', required_fields: ['medication'], necessary: true },
  { hop: 'wellness_marketing_vendor', required_fields: [], necessary: false },
];

function buildUsePayload(request, session) {
  switch (request.use) {
    case 'insurance_risk_assessment':
      return { reading: session.reading, risk_model: 'underwriting_v2' };
    case 'personalization_update':
      return { inferred_interest: 'cardiovascular_content', tone: 'reassuring' };
    case 'analytics_aggregation':
      return { event: 'health_query', topic: 'blood_pressure' };
    case 'ad_targeting':
      return { segment: 'hypertension_candidates', advertiser: 'pharma_partner' };
    case 'training_append':
      return { prompt: session.user_question, completion: session.canned_answer };
    default:
      return {};
  }
}

async function run({ gpc = false, scope = [] } = {}) {
  const optouts = gate.resolveOptouts({ gpc, scope });
  const outputs = createOutputs();
  const session = fixture.getSession();

  // The primary task always completes.
  const taskOutput = session.canned_answer;

  const useResults = USE_SEQUENCE.map(request =>
    gate.checkUse(request, buildUsePayload(request, session), outputs, optouts)
  );

  // C4: the task's delegation chain.
  const chainPayload = {
    medication: session.health_context.medication,
    reading: session.reading,
    health_context: session.health_context,
    user_question: session.user_question,
  };
  const chainResults = CHAIN.map(hop =>
    gate.transferAlongChain(hop, chainPayload, outputs, optouts)
  );

  return {
    optouts: [...optouts].sort(),
    task_output: taskOutput,
    use_results: useResults,
    chain_results: chainResults,
    outputs_snapshot: snapshotAll(outputs),
  };
}

module.exports = { run, USE_SEQUENCE, CHAIN };
