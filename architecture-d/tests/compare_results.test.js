const fs   = require('fs');
const path = require('path');
const {
  loadJson, sitesSuppressed, observationCount, metaForwarded, metaReceived,
  doNotTrainTag, inferredTopic,
} = require('../harness/compare_results');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const TMP_FILE   = path.join(OUTPUT_DIR, '__compare_test_fixture.json');

afterEach(() => {
  if (fs.existsSync(TMP_FILE)) fs.unlinkSync(TMP_FILE);
});

describe('loadJson', () => {
  test('returns null when the file is absent', () => {
    expect(loadJson('__definitely_does_not_exist.json')).toBeNull();
  });

  test('parses well-formed JSON', () => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(TMP_FILE, JSON.stringify({ ok: true }));
    expect(loadJson('__compare_test_fixture.json')).toEqual({ ok: true });
  });

  test('returns null on malformed JSON instead of throwing', () => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(TMP_FILE, '{not valid json');
    // Silence the stderr write so jest output stays clean.
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = () => true;
    try {
      expect(loadJson('__compare_test_fixture.json')).toBeNull();
    } finally {
      process.stderr.write = orig;
    }
  });
});

describe('field extractors degrade gracefully on missing pieces', () => {
  test('sitesSuppressed: null result, missing site_level_view', () => {
    expect(sitesSuppressed(null)).toBe('—');
    expect(sitesSuppressed({})).toBe('—');
  });

  test('sitesSuppressed: returns em-dash on malformed shape (non-array site_level_view)', () => {
    // Regression. A string used to crash the .filter() call.
    expect(sitesSuppressed({ site_level_view: 'not an array' })).toBe('—');
    expect(sitesSuppressed({ site_level_view: { 0: 'a' } })).toBe('—');
    expect(sitesSuppressed({ site_level_view: 42 })).toBe('—');
  });

  test('observationCount: returns em-dash on malformed provider_view shape', () => {
    expect(observationCount({ provider_view: 'not an array' })).toBe('—');
    expect(observationCount({ provider_view: 42 })).toBe('—');
  });

  test('metaForwarded / metaReceived return em-dash when the field is missing on a present observation', () => {
    // Regression. Used to JSON.stringify(undefined) and render the
    // literal word "undefined" in the compare table.
    const r = { provider_view: [{}] };
    expect(metaForwarded(r)).toBe('—');
    expect(metaReceived(r)).toBe('—');
  });

  test('sitesSuppressed: counts only entries with tracking_decision.logged === false', () => {
    const r = { site_level_view: [
      { site: 'a', tracking_decision: { logged: false } },
      { site: 'b', tracking_decision: { logged: true  } },
      { site: 'c', status: 'error' /* tracking_decision absent */ },
    ] };
    expect(sitesSuppressed(r)).toBe('1 / 3');
  });

  test('observationCount handles missing provider_view', () => {
    expect(observationCount(null)).toBe('—');
    expect(observationCount({ provider_view: [{}, {}, {}] })).toBe('3');
  });

  test('metaForwarded / metaReceived stringify the first observation', () => {
    const r = { provider_view: [{ meta_received: { gpc: 1 }, meta_forwarded: {} }] };
    expect(metaReceived(r)).toBe('{"gpc":1}');
    expect(metaForwarded(r)).toBe('{}');
  });

  test('doNotTrainTag reports true / absent', () => {
    expect(doNotTrainTag({ provider_view: [{ do_not_train: true }] })).toBe('true');
    expect(doNotTrainTag({ provider_view: [{}] })).toBe('absent');
    expect(doNotTrainTag({})).toBe('—');
  });

  test('inferredTopic returns query_topic or em-dash', () => {
    expect(inferredTopic({ provider_view: [{ query_topic: 'mobile_device' }] })).toBe('mobile_device');
    expect(inferredTopic({ provider_view: [{}] })).toBe('—');
    expect(inferredTopic({})).toBe('—');
  });
});
