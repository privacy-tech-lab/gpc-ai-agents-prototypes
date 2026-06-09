'use strict';

/**
 * query_classifier.js
 *
 * Static lookup table mapping known queries to:
 *   - inferred_attributes: the profile fields an inference engine would derive
 *   - answer:              a canned response returned to the user regardless of B3 mode
 *
 * This simulates what a real semantic classifier would produce after analysing
 * the text of a search query.  In a production system this would call an
 * embedding model; here it is a plain object look-up so tests remain deterministic.
 */

const QUERY_MAP = {
  'What are the side effects of metformin?': {
    inferred_attributes: {
      health_flags: ['possible_diabetes'],
      medical_interest: true,
    },
    answer:
      'Common side effects of metformin include nausea, diarrhoea, and stomach upset. ' +
      'Rarely, it can cause lactic acidosis. Consult a physician for personal guidance.',
  },

  'How do I negotiate a lower rent?': {
    inferred_attributes: {
      housing_situation: 'renting',
      financial_pressure: true,
    },
    answer:
      'Research comparable listings in your area, prepare a written request, and offer ' +
      'a longer lease or upfront payment as leverage when approaching your landlord.',
  },

  'What is the average cost of a hearing aid?': {
    inferred_attributes: {
      health_flags: ['possible_hearing_loss'],
      age_indicator: 'older',
    },
    answer:
      'Hearing aids typically cost between $1,000 and $6,000 per device. Over-the-counter ' +
      'options are now available for mild-to-moderate loss at lower price points.',
  },

  'How do I apply for SNAP benefits?': {
    inferred_attributes: {
      income_bracket: 'low',
      benefit_eligible: true,
    },
    answer:
      'Visit your state\'s SNAP portal or a local SNAP office with proof of income, ' +
      'residency, and identity. Eligibility is based on household size and income.',
  },

  'What are low-sodium meal ideas?': {
    inferred_attributes: {
      dietary_restriction: 'low_sodium',
      health_flags: ['cardiovascular_concern'],
    },
    answer:
      'Try grilled chicken with steamed vegetables, oatmeal with fresh fruit, or ' +
      'homemade soups made without added salt. Herbs and citrus add flavour naturally.',
  },

  'How do I dispute a medical bill?': {
    inferred_attributes: {
      healthcare_access: 'strained',
      financial_pressure: true,
    },
    answer:
      'Request an itemised bill, check for billing errors, and contact both the provider ' +
      'and your insurer in writing. Hospitals often have financial assistance programmes.',
  },

  'What are signs of anxiety?': {
    inferred_attributes: {
      mental_health_flags: ['possible_anxiety'],
    },
    answer:
      'Common signs include persistent worry, restlessness, difficulty concentrating, ' +
      'muscle tension, and sleep problems. A licensed therapist can provide a proper evaluation.',
  },

  'What is a good entry-level resume template?': {
    inferred_attributes: {
      employment_status: 'job_seeking',
    },
    answer:
      'Use a clean one-page layout: contact info at the top, then a brief summary, ' +
      'education, relevant experience, and skills. Tailor keywords to each job posting.',
  },
};

/**
 * classify(query)
 *
 * Returns { inferred_attributes, answer } for a known query.
 * Throws for any query not in the table — ensures tests are deterministic.
 *
 * @param {string} query
 * @returns {{ inferred_attributes: object, answer: string }}
 */
function classify(query) {
  const entry = QUERY_MAP[query];
  if (!entry) throw new Error(`Unknown query: "${query}"`);
  // Return a deep copy so callers cannot mutate the static table
  return {
    inferred_attributes: JSON.parse(JSON.stringify(entry.inferred_attributes)),
    answer: entry.answer,
  };
}

/**
 * allQueries()
 *
 * Returns the full ordered list of query strings used by the orchestrator.
 *
 * @returns {string[]}
 */
function allQueries() {
  return Object.keys(QUERY_MAP);
}

module.exports = { classify, allQueries };
