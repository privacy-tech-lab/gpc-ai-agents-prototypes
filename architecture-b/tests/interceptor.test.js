/**
 * Integration tests for the interceptor + real tool handlers.
 * Verifies that GPC purpose enforcement works end-to-end through callTool().
 */

const path = require('path');
const fs   = require('fs');
const { callTool } = require('../orchestrator/mcp_client.js');

const OUTPUT_DIR    = path.join(__dirname, '..', 'output');
const LOG_FILE      = path.join(OUTPUT_DIR, 'interaction_log.jsonl');
const TRAINING_FILE = path.join(OUTPUT_DIR, 'training_set.jsonl');

beforeEach(() => {
  // Clean output files so counts are predictable
  [LOG_FILE, TRAINING_FILE].forEach((f) => {
    if (fs.existsSync(f)) fs.writeFileSync(f, '');
  });
});

describe('callTool — primary_task always executes', () => {
  test('get_medical_records runs with gpc=1 when purpose=primary_task', async () => {
    const result = await callTool(
      'get_medical_records',
      { patient_id: 'patient-001' },
      { gpc: 1, purpose: 'primary_task' }
    );
    expect(result.status).toBe('ok');
    expect(result.result.found).toBe(true);
  });

  test('answer_question runs with gpc=1 (no restricted purposes)', async () => {
    const result = await callTool(
      'answer_question',
      { question: 'What is my blood pressure?', context: '' },
      { gpc: 1, purpose: 'primary_task' }
    );
    expect(result.status).toBe('ok');
    expect(result.result).toHaveProperty('answer');
  });
});

describe('callTool — secondary purposes blocked under full GPC', () => {
  test('log_interaction blocked for analytics purpose', async () => {
    const result = await callTool(
      'log_interaction',
      { patient_id: 'p1', query: 'test', response_summary: 'test' },
      { gpc: 1, purpose: 'analytics' }
    );
    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('purpose_restricted');
    // Verify nothing was written
    const lines = fs.existsSync(LOG_FILE)
      ? fs.readFileSync(LOG_FILE, 'utf8').trim()
      : '';
    expect(lines).toBe('');
  });

  test('add_to_training_set blocked for model_training purpose', async () => {
    const result = await callTool(
      'add_to_training_set',
      { query: 'test', response: 'test' },
      { gpc: 1, purpose: 'model_training' }
    );
    expect(result.status).toBe('blocked');
    const lines = fs.existsSync(TRAINING_FILE)
      ? fs.readFileSync(TRAINING_FILE, 'utf8').trim()
      : '';
    expect(lines).toBe('');
  });

  test('update_interest_profile blocked for personalization purpose', async () => {
    const result = await callTool(
      'update_interest_profile',
      { patient_id: 'p1', interests: ['diabetes'] },
      { gpc: 1, purpose: 'personalization' }
    );
    expect(result.status).toBe('blocked');
  });
});

describe('callTool — partial opt-out', () => {
  test('log_interaction allowed when analytics not in gpc_scope', async () => {
    const result = await callTool(
      'log_interaction',
      { patient_id: 'p1', query: 'test', response_summary: 'test' },
      { gpc: 1, purpose: 'analytics', gpc_scope: ['model_training', 'ad_targeting'] }
    );
    expect(result.status).toBe('ok');
  });

  test('add_to_training_set blocked when model_training in gpc_scope', async () => {
    const result = await callTool(
      'add_to_training_set',
      { query: 'test', response: 'test' },
      { gpc: 1, purpose: 'model_training', gpc_scope: ['model_training', 'ad_targeting'] }
    );
    expect(result.status).toBe('blocked');
  });
});

describe('callTool — missing purpose field', () => {
  test('log_interaction blocked when purpose field absent under gpc=1', async () => {
    const result = await callTool(
      'log_interaction',
      { patient_id: 'p1', query: 'test', response_summary: 'test' },
      { gpc: 1 } // no purpose
    );
    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('missing_purpose_field');
  });

  test('get_medical_records blocked when purpose field absent under gpc=1', async () => {
    const result = await callTool(
      'get_medical_records',
      { patient_id: 'patient-001' },
      { gpc: 1 } // no purpose
    );
    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('missing_purpose_field');
  });
});
