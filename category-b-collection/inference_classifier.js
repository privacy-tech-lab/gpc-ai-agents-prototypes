'use strict';

/**
 * inference_classifier.js
 *
 * Static lookup table mapping a known draft to:
 *  - polished_email: the task output, returned to the user in every mode
 *  - inferred_attributes: what an inference engine would derive
 *  - attribute_sources: whether each attribute derives from the submitted
 *    input (B1 material) or from passive behavior (B2 material)
 *
 * The sources map is the point of the B3 subtype: derivation is only possible
 * because B1 or B2 collection happened first. A production system would run
 * an embedding model or a rules tagger here; a plain lookup keeps tests
 * deterministic.
 */

const DRAFT_MAP = {
  raise_request_email: {
    polished_email:
      'Hi Sarah, I would like to schedule time this week to discuss my compensation. ' +
      'Over my three years here my responsibilities have grown, and I want to make sure ' +
      'my salary reflects that. Please let me know a time that works for you. Thank you.',
    inferred_attributes: {
      health_flags: ['ongoing_medical_treatment'],
      financial_pressure: true,
      undisclosed_health_severity: true,
      negotiation_anxiety: true,
    },
    attribute_sources: {
      health_flags: 'input',
      financial_pressure: 'input',
      undisclosed_health_severity: 'behavior',
      negotiation_anxiety: 'behavior',
    },
  },
};

/**
 * classify(draftId)
 *
 * Returns { polished_email, inferred_attributes, attribute_sources } for a
 * known draft. Throws for unknown ids so tests stay deterministic.
 */
function classify(draftId) {
  const entry = DRAFT_MAP[draftId];
  if (!entry) throw new Error(`Unknown draft: "${draftId}"`);
  return JSON.parse(JSON.stringify(entry));
}

module.exports = { classify };
