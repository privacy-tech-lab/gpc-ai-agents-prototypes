/**
 * Unit tests for proposal-dedicated-field/privacy_signal_policy.js.
 *
 * Mirrors gpc_policy.test.js, but exercises withPrivacySignal() against the
 * dedicated privacySignals field instead of _meta.
 */

const { withPrivacySignal, SENSITIVE_TOOLS } = require('../proposal-dedicated-field/privacy_signal_policy.js');

const mockHandler = jest.fn().mockResolvedValue({ data: 'result' });

beforeEach(() => mockHandler.mockClear());

describe('SENSITIVE_TOOLS (imported from gpc_policy.js)', () => {
  test('contains expected sensitive tools', () => {
    expect(SENSITIVE_TOOLS.has('user_profile_lookup')).toBe(true);
    expect(SENSITIVE_TOOLS.has('save_to_profile')).toBe(true);
    expect(SENSITIVE_TOOLS.has('log_interaction')).toBe(true);
  });

  test('does not list search_web as sensitive', () => {
    expect(SENSITIVE_TOOLS.has('search_web')).toBe(false);
  });
});

describe('withPrivacySignal — blocking behaviour', () => {
  const sensitiveTools = ['user_profile_lookup', 'save_to_profile', 'log_interaction'];

  for (const tool of sensitiveTools) {
    test(`blocks ${tool} when privacySignals.gpc=true`, async () => {
      const fn = withPrivacySignal(tool, mockHandler);
      const result = await fn({}, { gpc: true });
      expect(result.status).toBe('blocked');
      expect(result.reason).toBe('gpc_opt_out');
      expect(result.tool).toBe(tool);
      expect(mockHandler).not.toHaveBeenCalled();
    });
  }

  test('does not block on truthy-but-not-boolean values (unlike the _meta version)', async () => {
    const fn = withPrivacySignal('save_to_profile', mockHandler);
    const result = await fn({}, { gpc: 1 });
    expect(result.status).toBe('ok');
    expect(mockHandler).toHaveBeenCalledTimes(1);
  });
});

describe('withPrivacySignal — passthrough behaviour', () => {
  test('search_web always executes regardless of privacySignals.gpc', async () => {
    const fn = withPrivacySignal('search_web', mockHandler);
    const result = await fn({ query: 'test' }, { gpc: true });
    expect(result.status).toBe('ok');
    expect(mockHandler).toHaveBeenCalledTimes(1);
  });

  test('sensitive tool executes when privacySignals is empty', async () => {
    const fn = withPrivacySignal('user_profile_lookup', mockHandler);
    const result = await fn({}, {});
    expect(result.status).toBe('ok');
    expect(mockHandler).toHaveBeenCalledTimes(1);
  });

  test('sensitive tool executes when privacySignals is missing', async () => {
    const fn = withPrivacySignal('user_profile_lookup', mockHandler);
    const result = await fn({});
    expect(result.status).toBe('ok');
  });

  test('ok result includes durationMs', async () => {
    const fn = withPrivacySignal('search_web', mockHandler);
    const result = await fn({}, {});
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test('ok result includes handler return value under result key', async () => {
    const fn = withPrivacySignal('search_web', mockHandler);
    const result = await fn({}, {});
    expect(result.result).toEqual({ data: 'result' });
  });
});
