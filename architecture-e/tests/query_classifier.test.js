/**
 * Unit tests for query_classifier.js
 *
 * Covers:
 *  - allQueries() returns exactly 8 queries
 *  - classify() returns inferred_attributes and answer for each known query
 *  - Specific attribute shapes for every query
 *  - classify() throws for an unknown query
 *  - Results are deep copies (mutations don't affect the static table)
 */

const classifier = require('../query_classifier');

describe('allQueries()', () => {
  test('returns exactly 8 queries', () => {
    expect(classifier.allQueries()).toHaveLength(8);
  });

  test('returns an array of strings', () => {
    const queries = classifier.allQueries();
    for (const q of queries) {
      expect(typeof q).toBe('string');
    }
  });

  test('includes the metformin query', () => {
    expect(classifier.allQueries()).toContain('What are the side effects of metformin?');
  });

  test('includes the SNAP benefits query', () => {
    expect(classifier.allQueries()).toContain('How do I apply for SNAP benefits?');
  });
});

describe('classify() — metformin query', () => {
  const q = 'What are the side effects of metformin?';

  test('returns inferred_attributes', () => {
    const result = classifier.classify(q);
    expect(result.inferred_attributes).toBeDefined();
  });

  test('flags possible_diabetes in health_flags', () => {
    const { inferred_attributes } = classifier.classify(q);
    expect(inferred_attributes.health_flags).toContain('possible_diabetes');
  });

  test('sets medical_interest to true', () => {
    const { inferred_attributes } = classifier.classify(q);
    expect(inferred_attributes.medical_interest).toBe(true);
  });

  test('returns a non-empty answer string', () => {
    const { answer } = classifier.classify(q);
    expect(typeof answer).toBe('string');
    expect(answer.length).toBeGreaterThan(0);
  });
});

describe('classify() — rent negotiation query', () => {
  const q = 'How do I negotiate a lower rent?';

  test('sets housing_situation to renting', () => {
    const { inferred_attributes } = classifier.classify(q);
    expect(inferred_attributes.housing_situation).toBe('renting');
  });

  test('sets financial_pressure to true', () => {
    const { inferred_attributes } = classifier.classify(q);
    expect(inferred_attributes.financial_pressure).toBe(true);
  });
});

describe('classify() — hearing aid query', () => {
  const q = 'What is the average cost of a hearing aid?';

  test('flags possible_hearing_loss in health_flags', () => {
    const { inferred_attributes } = classifier.classify(q);
    expect(inferred_attributes.health_flags).toContain('possible_hearing_loss');
  });

  test('sets age_indicator to older', () => {
    const { inferred_attributes } = classifier.classify(q);
    expect(inferred_attributes.age_indicator).toBe('older');
  });
});

describe('classify() — SNAP benefits query', () => {
  const q = 'How do I apply for SNAP benefits?';

  test('sets income_bracket to low', () => {
    const { inferred_attributes } = classifier.classify(q);
    expect(inferred_attributes.income_bracket).toBe('low');
  });

  test('sets benefit_eligible to true', () => {
    const { inferred_attributes } = classifier.classify(q);
    expect(inferred_attributes.benefit_eligible).toBe(true);
  });
});

describe('classify() — low-sodium query', () => {
  const q = 'What are low-sodium meal ideas?';

  test('sets dietary_restriction to low_sodium', () => {
    const { inferred_attributes } = classifier.classify(q);
    expect(inferred_attributes.dietary_restriction).toBe('low_sodium');
  });

  test('flags cardiovascular_concern in health_flags', () => {
    const { inferred_attributes } = classifier.classify(q);
    expect(inferred_attributes.health_flags).toContain('cardiovascular_concern');
  });
});

describe('classify() — medical bill dispute query', () => {
  const q = 'How do I dispute a medical bill?';

  test('sets healthcare_access to strained', () => {
    const { inferred_attributes } = classifier.classify(q);
    expect(inferred_attributes.healthcare_access).toBe('strained');
  });

  test('sets financial_pressure to true', () => {
    const { inferred_attributes } = classifier.classify(q);
    expect(inferred_attributes.financial_pressure).toBe(true);
  });
});

describe('classify() — anxiety query', () => {
  const q = 'What are signs of anxiety?';

  test('flags possible_anxiety in mental_health_flags', () => {
    const { inferred_attributes } = classifier.classify(q);
    expect(inferred_attributes.mental_health_flags).toContain('possible_anxiety');
  });
});

describe('classify() — resume template query', () => {
  const q = 'What is a good entry-level resume template?';

  test('sets employment_status to job_seeking', () => {
    const { inferred_attributes } = classifier.classify(q);
    expect(inferred_attributes.employment_status).toBe('job_seeking');
  });
});

describe('classify() — error handling', () => {
  test('throws for an unknown query', () => {
    expect(() => classifier.classify('something totally unknown')).toThrow('Unknown query');
  });

  test('error message includes the unknown query text', () => {
    expect(() => classifier.classify('xyz')).toThrow('xyz');
  });
});

describe('classify() — deep copy isolation', () => {
  test('mutating the returned attributes does not affect subsequent calls', () => {
    const q = 'What are the side effects of metformin?';
    const first = classifier.classify(q);
    first.inferred_attributes.health_flags.push('mutation');
    const second = classifier.classify(q);
    expect(second.inferred_attributes.health_flags).not.toContain('mutation');
  });
});
