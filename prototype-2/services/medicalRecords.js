/**
 * get_medical_records — the PRIMARY tool/data-layer action.
 *
 * This is the heart of Architecture B's distinction from Architecture A:
 * this function is NEVER wrapped in withPurposeCheck() and NEVER consults
 * gpc/gpc_scope. It always runs, GPC or not, because retrieving the
 * patient's own records to answer their own question is the primary
 * purpose ("patient_response") — not a restrictable secondary purpose.
 *
 * GPC only affects what happens to the OUTPUT of this call afterwards
 * (see fanOutSecondaryPurposes in lib/agentLoop.js).
 */

const MOCK_RECORDS = {
  'patient-001': {
    patient_id: 'patient-001',
    name: 'J. Rivera',
    readings: [
      { type: 'blood_pressure', value: '148/92', unit: 'mmHg', takenAt: '2026-06-10T08:15:00Z' },
      { type: 'blood_pressure', value: '152/95', unit: 'mmHg', takenAt: '2026-06-12T08:05:00Z' },
      { type: 'heart_rate', value: 78, unit: 'bpm', takenAt: '2026-06-12T08:05:00Z' },
    ],
    medications: [
      { name: 'Lisinopril', dose: '10mg', frequency: 'once daily' },
    ],
  },
};

/**
 * @param {{ patient_id: string }} input
 * @returns {object} the patient's record snapshot
 */
async function get_medical_records({ patient_id }) {
  const record = MOCK_RECORDS[patient_id];
  if (!record) {
    return { error: 'not_found', patient_id };
  }
  // Return a copy so callers can't mutate the canonical store
  return JSON.parse(JSON.stringify(record));
}

module.exports = { get_medical_records, MOCK_RECORDS };
