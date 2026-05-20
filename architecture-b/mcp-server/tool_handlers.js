/**
 * Raw tool implementations for the medical assistant.
 * No GPC logic here — enforcement lives exclusively in purpose_registry.js.
 *
 * B2 operation layer each tool belongs to:
 *   log_interaction        → Collection  (raw query recorded)
 *   add_to_training_set    → Processing  (data repurposed for ML)
 *   update_interest_profile→ Inference   (behavioral profile derived)
 *   (ad_platform vector DB)→ Storage     (derived data persisted to ad store)
 */

const fs   = require('fs');
const path = require('path');

const OUTPUT_DIR     = path.join(__dirname, '..', 'output');
const LOG_FILE       = path.join(OUTPUT_DIR, 'interaction_log.jsonl');
const TRAINING_FILE  = path.join(OUTPUT_DIR, 'training_set.jsonl');
const PROFILES_FILE  = path.join(OUTPUT_DIR, 'interest_profiles.json');

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

module.exports = {
  get_medical_records,
  answer_question,
  log_interaction,
  update_interest_profile,
  add_to_training_set,
};
