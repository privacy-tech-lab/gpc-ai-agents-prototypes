/**
 * Unit tests for inference_classifier.js.
 */

const classifier = require('../inference_classifier');

describe('classify', () => {
  test('returns the task output and inferences for a known draft', () => {
    const c = classifier.classify('raise_request_email');
    expect(c.polished_email).toContain('compensation');
    expect(c.inferred_attributes.financial_pressure).toBe(true);
    expect(c.inferred_attributes.health_flags).toEqual(['ongoing_medical_treatment']);
  });

  test('every inferred attribute has a declared source', () => {
    const c = classifier.classify('raise_request_email');
    const attrs = Object.keys(c.inferred_attributes).sort();
    const sourced = Object.keys(c.attribute_sources).sort();
    expect(sourced).toEqual(attrs);
  });

  test('behavior-sourced attributes come from telemetry, not the submitted text', () => {
    const c = classifier.classify('raise_request_email');
    expect(c.attribute_sources.undisclosed_health_severity).toBe('behavior');
    expect(c.attribute_sources.negotiation_anxiety).toBe('behavior');
  });

  test('throws for an unknown draft', () => {
    expect(() => classifier.classify('nope')).toThrow('Unknown draft: "nope"');
  });

  test('returns deep copies so callers cannot mutate the table', () => {
    const a = classifier.classify('raise_request_email');
    a.inferred_attributes.health_flags.push('mutated');
    const b = classifier.classify('raise_request_email');
    expect(b.inferred_attributes.health_flags).toEqual(['ongoing_medical_treatment']);
  });
});
