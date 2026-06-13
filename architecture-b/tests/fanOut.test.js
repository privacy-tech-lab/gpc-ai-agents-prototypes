/**
 * Integration tests for lib/agentLoop.js fanOutSecondaryPurposes().
 *
 * The ad platform HTTP server is started on a test port so we can verify
 * the full Layer 3 trust-boundary enforcement without mocking fetch.
 * Analytics and training services write to the real output/ directory;
 * each test cleans up before running.
 */

// Must be set before agentLoop.js is required (module-level constant)
process.env.AD_PLATFORM_URL = 'http://localhost:4099/target';

const fs   = require('fs');
const path = require('path');
const { start: startAdPlatform } = require('../services/adPlatform');
const { fanOutSecondaryPurposes } = require('../lib/agentLoop');

const OUTPUT_DIR     = path.join(__dirname, '..', 'output');
const ANALYTICS_FILE = path.join(OUTPUT_DIR, 'analytics_log.json');
const TRAINING_FILE  = path.join(OUTPUT_DIR, 'training_dataset.jsonl');
const AD_FILE        = path.join(OUTPUT_DIR, 'ad_vector_store.json');

let adServer;

beforeAll(async () => {
  adServer = await startAdPlatform(4099);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
});

afterAll(() => adServer?.close());

beforeEach(() => {
  [ANALYTICS_FILE, TRAINING_FILE, AD_FILE].forEach((f) => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
});

const PARAMS = {
  patient_id: 'patient-001',
  query:      'What does my blood pressure reading mean?',
  response:   'Your blood pressure is elevated. Discuss medication with your clinician.',
};

// ── No GPC ────────────────────────────────────────────────────────────────────

describe('fanOutSecondaryPurposes — no GPC', () => {
  test('all three pipelines return ok', async () => {
    const result = await fanOutSecondaryPurposes({ privacyContext: {}, ...PARAMS });
    expect(result.analytics.status).toBe('ok');
    expect(result.model_training.status).toBe('ok');
    expect(result.ad_targeting.status).toBe('ok');
  });

  test('analytics log file written with correct patient_id', async () => {
    await fanOutSecondaryPurposes({ privacyContext: {}, ...PARAMS });
    const log = JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf8'));
    expect(log).toHaveLength(1);
    expect(log[0].patient_id).toBe('patient-001');
    expect(log[0].query).toBe(PARAMS.query);
  });

  test('training dataset file written with query + response', async () => {
    await fanOutSecondaryPurposes({ privacyContext: {}, ...PARAMS });
    const lines = fs.readFileSync(TRAINING_FILE, 'utf8').trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.query).toBe(PARAMS.query);
    expect(entry.response).toBe(PARAMS.response);
  });

  test('ad vector store written', async () => {
    await fanOutSecondaryPurposes({ privacyContext: {}, ...PARAMS });
    const store = JSON.parse(fs.readFileSync(AD_FILE, 'utf8'));
    expect(store).toHaveLength(1);
    expect(store[0].patient_id).toBe('patient-001');
  });
});

// ── Full GPC opt-out ──────────────────────────────────────────────────────────

describe('fanOutSecondaryPurposes — full GPC opt-out', () => {
  test('all three pipelines return blocked', async () => {
    const result = await fanOutSecondaryPurposes({ privacyContext: { gpc: 1 }, ...PARAMS });
    expect(result.analytics.status).toBe('blocked');
    expect(result.model_training.status).toBe('blocked');
    expect(result.ad_targeting.status).toBe('blocked');
  });

  test('no files written when all pipelines blocked', async () => {
    await fanOutSecondaryPurposes({ privacyContext: { gpc: 1 }, ...PARAMS });
    expect(fs.existsSync(ANALYTICS_FILE)).toBe(false);
    expect(fs.existsSync(TRAINING_FILE)).toBe(false);
    const adStore = fs.existsSync(AD_FILE) ? JSON.parse(fs.readFileSync(AD_FILE, 'utf8')) : [];
    expect(adStore).toHaveLength(0);
  });

  test('blocked reason is purpose_restricted', async () => {
    const result = await fanOutSecondaryPurposes({ privacyContext: { gpc: 1 }, ...PARAMS });
    expect(result.analytics.reason).toBe('purpose_restricted');
    expect(result.model_training.reason).toBe('purpose_restricted');
  });
});

// ── Partial opt-out ───────────────────────────────────────────────────────────

describe('fanOutSecondaryPurposes — partial opt-out (ad_targeting only)', () => {
  const partialCtx = { gpc: 1, gpc_scope: ['ad_targeting'] };

  test('analytics and model_training proceed; ad_targeting blocked', async () => {
    const result = await fanOutSecondaryPurposes({ privacyContext: partialCtx, ...PARAMS });
    expect(result.analytics.status).toBe('ok');
    expect(result.model_training.status).toBe('ok');
    expect(result.ad_targeting.status).toBe('blocked');
  });

  test('analytics and training files written; ad store not written', async () => {
    await fanOutSecondaryPurposes({ privacyContext: partialCtx, ...PARAMS });
    expect(fs.existsSync(ANALYTICS_FILE)).toBe(true);
    expect(fs.existsSync(TRAINING_FILE)).toBe(true);
    const adStore = fs.existsSync(AD_FILE) ? JSON.parse(fs.readFileSync(AD_FILE, 'utf8')) : [];
    expect(adStore).toHaveLength(0);
  });

  test('ad_targeting blocked reason comes from ad platform (purpose_restricted)', async () => {
    const result = await fanOutSecondaryPurposes({ privacyContext: partialCtx, ...PARAMS });
    expect(result.ad_targeting.reason).toBe('purpose_restricted');
    expect(result.ad_targeting.layer).toBe('ad_platform_storage');
  });
});

// ── primary task is unaffected ────────────────────────────────────────────────

describe('get_medical_records is never gated', () => {
  test('medicalRecords.get_medical_records returns full data regardless of gpc', async () => {
    const { get_medical_records } = require('../services/medicalRecords');
    const result = await get_medical_records({ patient_id: 'patient-001' });
    expect(result.patient_id).toBe('patient-001');
    expect(result.readings.length).toBeGreaterThan(0);
    expect(result.medications.length).toBeGreaterThan(0);
  });
});
