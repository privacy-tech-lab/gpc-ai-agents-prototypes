/**
 * Raw tool implementations for the medical assistant.
 * No GPC logic here — enforcement lives exclusively in purpose_registry.js.
 *
 * B2 operation layer each tool belongs to:
 *   log_interaction        → Collection  (raw query recorded)
 *   add_to_training_set    → Processing  (data repurposed for ML)
 *   update_interest_profile→ Inference   (behavioral profile derived)
 *   (ad_platform vector DB)→ Storage     (derived data persisted to ad store)
 *
 * Category C (cross-context) tools:
 *   sell_to_data_broker        → cross_context_sale     (commercial data transfer)
 *   share_with_research_partner→ cross_context_sharing  (non-commercial cross-org transfer)
 *
 * Category D (memory / temporal inference) tools:
 *   infer_sensitive_attributes → sensitive_data_inference (derive health risk scores)
 */

const fs   = require('fs');
const path = require('path');

const OUTPUT_DIR          = path.join(__dirname, '..', 'output');
const LOG_FILE            = path.join(OUTPUT_DIR, 'interaction_log.jsonl');
const TRAINING_FILE       = path.join(OUTPUT_DIR, 'training_set.jsonl');
const PROFILES_FILE       = path.join(OUTPUT_DIR, 'interest_profiles.json');
const DATA_BROKER_FILE    = path.join(OUTPUT_DIR, 'data_broker_export.jsonl');
const RESEARCH_SHARE_FILE = path.join(OUTPUT_DIR, 'research_partner_export.jsonl');
const INFERRED_ATTRS_FILE = path.join(OUTPUT_DIR, 'inferred_attributes.json');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// --- Mock patient records ---

const MOCK_RECORDS = {
  'patient-001': {
    patient_id:  'patient-001',
    name:        'Alex Johnson',
    dob:         '1985-03-12',
    conditions:  ['hypertension', 'type 2 diabetes'],
    medications: ['metformin 500mg', 'lisinopril 10mg'],
    last_visit:  '2025-11-15',
    allergies:   ['penicillin'],
    lab_results: {
      hba1c:          '7.2%',
      blood_pressure: '138/88 mmHg',
      cholesterol:    '195 mg/dL',
    },
  },
};

// --- Tool implementations ---

async function get_medical_records({ patient_id, record_type = 'full' }) {
  const record = MOCK_RECORDS[patient_id] ?? null;
  if (!record) return { patient_id, found: false, record: null };
  if (record_type === 'summary') {
    return {
      patient_id,
      found: true,
      record: { conditions: record.conditions, medications: record.medications },
    };
  }
  return { patient_id, found: true, record };
}

async function answer_question({ question, context = '' }) {
  const CANNED = {
    'blood pressure': 'Your most recent reading of 138/88 mmHg is Stage 1 hypertension. Your lisinopril prescription is appropriate. Continue monitoring and follow lifestyle recommendations from your care team.',
    'diabetes':       'Your HbA1c of 7.2% indicates moderately controlled type 2 diabetes. Your metformin dosage may need adjustment; discuss with your physician at your next visit.',
    'medication':     'You are on metformin 500mg (diabetes) and lisinopril 10mg (hypertension). Note your documented penicillin allergy before any new prescriptions.',
    'allerg':         'Your records show a documented allergy to penicillin. Inform all providers before any antibiotic prescription.',
  };
  const key = Object.keys(CANNED).find((k) => question.toLowerCase().includes(k));
  const answer = key
    ? CANNED[key]
    : `Based on your health context: ${context || 'No specific record data matched your query. Please consult your healthcare provider.'}`;
  return {
    question,
    answer,
    disclaimer: 'Informational only. Always consult a licensed healthcare provider.',
  };
}

async function log_interaction({ patient_id, query, response_summary }) {
  const entry = { patient_id, query, response_summary, timestamp: new Date().toISOString() };
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  return { logged: true, entry };
}

async function update_interest_profile({ patient_id, interests }) {
  let profiles = {};
  if (fs.existsSync(PROFILES_FILE)) {
    profiles = JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8'));
  }
  const prior = profiles[patient_id]?.interests ?? [];
  profiles[patient_id] = {
    interests: [...new Set([...prior, ...interests])],
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2));
  return { patient_id, updated: true, profile: profiles[patient_id] };
}

async function add_to_training_set({ query, response, metadata = {} }) {
  const entry = { query, response, metadata, addedAt: new Date().toISOString() };
  fs.appendFileSync(TRAINING_FILE, JSON.stringify(entry) + '\n');
  return { added: true, entry };
}

// ── Category C: Cross-context tools ──────────────────────────────────────────

async function sell_to_data_broker({ patient_id, record_snapshot }) {
  const entry = {
    patient_id,
    record_snapshot: record_snapshot ?? null,
    destination:     'mock-data-broker.example.com',
    exportedAt:      new Date().toISOString(),
  };
  fs.appendFileSync(DATA_BROKER_FILE, JSON.stringify(entry) + '\n');
  return { exported: true, entry };
}

async function share_with_research_partner({ patient_id, study_id, data_subset }) {
  const entry = {
    patient_id,
    study_id:    study_id ?? 'STUDY-001',
    data_subset: data_subset ?? null,
    partner:     'mock-research-partner.example.edu',
    sharedAt:    new Date().toISOString(),
  };
  fs.appendFileSync(RESEARCH_SHARE_FILE, JSON.stringify(entry) + '\n');
  return { shared: true, entry };
}

// ── Category D: Sensitive inference tools ─────────────────────────────────────

async function infer_sensitive_attributes({ patient_id, records }) {
  const r = records
    ? (typeof records === 'string' ? JSON.parse(records) : records)
    : {};

  // Derive mock sensitive attributes from structured health records
  const conditionCount = r.conditions?.length ?? 0;
  const attributes = {
    adherence_risk:       conditionCount > 1 ? 'moderate' : 'low',
    chronic_condition_count: conditionCount,
    insurance_risk_score: conditionCount > 1 ? 'elevated' : 'standard',
    mental_health_flag:   (r.conditions ?? []).some((c) =>
      ['anxiety', 'depression', 'bipolar'].includes(c.toLowerCase())
    ),
  };

  let existing = {};
  if (fs.existsSync(INFERRED_ATTRS_FILE)) {
    try { existing = JSON.parse(fs.readFileSync(INFERRED_ATTRS_FILE, 'utf8')); } catch { existing = {}; }
  }
  existing[patient_id] = { attributes, inferredAt: new Date().toISOString() };
  fs.writeFileSync(INFERRED_ATTRS_FILE, JSON.stringify(existing, null, 2));

  return { patient_id, inferred: true, attributes };
}

module.exports = {
  get_medical_records,
  answer_question,
  log_interaction,
  update_interest_profile,
  add_to_training_set,
  sell_to_data_broker,
  share_with_research_partner,
  infer_sensitive_attributes,
};
