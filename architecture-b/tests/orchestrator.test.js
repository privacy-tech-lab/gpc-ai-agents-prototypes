/**
 * Orchestrator-level tests.
 * Spins up the ad platform stub for each test group.
 */

const adPlatform = require('../agents/ad_platform.js');
const { handleRequest } = require('../orchestrator/orchestrator.js');
const { encodeBaggage } = require('../orchestrator/baggage.js');

let srv;

beforeAll(async () => {
  srv = await adPlatform.start(4003); // use non-default port to avoid conflicts
  process.env.AD_PLATFORM_PORT = '4003';
});

afterAll(() => {
  srv.close();
  delete process.env.AD_PLATFORM_PORT;
});

const QUERY      = 'What does my blood pressure reading mean?';
const PATIENT_ID = 'patient-001';

describe('Baseline (gpc=0)', () => {
  test('primary task executes', async () => {
    const result = await handleRequest({
      query: QUERY,
      patient_id: PATIENT_ID,
      baggageHeader: encodeBaggage({ gpc: '0' }),
    });
    expect(result.primary.medical_records.status).toBe('ok');
    expect(result.primary.answer.status).toBe('ok');
  });

  test('all secondary pipelines execute', async () => {
    const result = await handleRequest({
      query: QUERY,
      patient_id: PATIENT_ID,
      baggageHeader: encodeBaggage({ gpc: '0' }),
    });
    expect(result.secondary.log_interaction.status).toBe('ok');
    expect(result.secondary.add_to_training_set.status).toBe('ok');
    expect(result.secondary.update_interest_profile.status).toBe('ok');
    expect(result.secondary.ad_platform.status).toBe('ok');
  });
});

describe('Full GPC (gpc=1, no scope)', () => {
  test('primary task still executes', async () => {
    const result = await handleRequest({
      query: QUERY,
      patient_id: PATIENT_ID,
      baggageHeader: encodeBaggage({ gpc: '1' }),
    });
    expect(result.primary.medical_records.status).toBe('ok');
    expect(result.primary.answer.status).toBe('ok');
  });

  test('all four secondary pipelines are blocked', async () => {
    const result = await handleRequest({
      query: QUERY,
      patient_id: PATIENT_ID,
      baggageHeader: encodeBaggage({ gpc: '1' }),
    });
    expect(result.secondary.log_interaction.status).toBe('blocked');
    expect(result.secondary.add_to_training_set.status).toBe('blocked');
    expect(result.secondary.update_interest_profile.status).toBe('blocked');
    expect(result.secondary.ad_platform.status).toBe('blocked');
  });
});

describe('Partial GPC (gpc=1, scope=ad_targeting|model_training)', () => {
  const baggageHeader = encodeBaggage({ gpc: '1', gpc_scope: 'ad_targeting|model_training' });

  test('primary task executes', async () => {
    const result = await handleRequest({ query: QUERY, patient_id: PATIENT_ID, baggageHeader });
    expect(result.primary.medical_records.status).toBe('ok');
    expect(result.primary.answer.status).toBe('ok');
  });

  test('log_interaction(analytics) is allowed — not in scope', async () => {
    const result = await handleRequest({ query: QUERY, patient_id: PATIENT_ID, baggageHeader });
    expect(result.secondary.log_interaction.status).toBe('ok');
  });

  test('update_interest_profile(personalization) is allowed — not in scope', async () => {
    const result = await handleRequest({ query: QUERY, patient_id: PATIENT_ID, baggageHeader });
    expect(result.secondary.update_interest_profile.status).toBe('ok');
  });

  test('add_to_training_set(model_training) is blocked — in scope', async () => {
    const result = await handleRequest({ query: QUERY, patient_id: PATIENT_ID, baggageHeader });
    expect(result.secondary.add_to_training_set.status).toBe('blocked');
  });

  test('ad_platform(ad_targeting) is blocked — in scope', async () => {
    const result = await handleRequest({ query: QUERY, patient_id: PATIENT_ID, baggageHeader });
    expect(result.secondary.ad_platform.status).toBe('blocked');
  });
});

describe('gpc_active flag in result', () => {
  test('gpc_active=false for baseline', async () => {
    const result = await handleRequest({
      query: QUERY, patient_id: PATIENT_ID, baggageHeader: encodeBaggage({ gpc: '0' }),
    });
    expect(result.gpc_active).toBe(false);
  });

  test('gpc_active=true for full GPC run', async () => {
    const result = await handleRequest({
      query: QUERY, patient_id: PATIENT_ID, baggageHeader: encodeBaggage({ gpc: '1' }),
    });
    expect(result.gpc_active).toBe(true);
  });

  test('gpc_scope present for partial run', async () => {
    const result = await handleRequest({
      query: QUERY,
      patient_id: PATIENT_ID,
      baggageHeader: encodeBaggage({ gpc: '1', gpc_scope: 'ad_targeting|model_training' }),
    });
    expect(result.gpc_scope).toEqual(['ad_targeting', 'model_training']);
  });
});
