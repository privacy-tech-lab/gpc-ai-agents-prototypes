/**
 * Unit tests for proposal-dedicated-field/privacy_policy.js.
 *
 * Mirrors tests/privacy_policy.test.js, but exercises withPrivacySignal()
 * against the dedicated privacySignals field instead of metadata.
 */

const { withPrivacySignal, SENSITIVE_OPERATIONS } = require('../proposal-dedicated-field/privacy_policy.js');

const mockHandler = jest.fn().mockResolvedValue({ data: 'result' });

beforeEach(() => mockHandler.mockClear());

describe('SENSITIVE_OPERATIONS (imported from agent-server/privacy_policy.js)', () => {
  test('contains expected sensitive operations', () => {
    expect(SENSITIVE_OPERATIONS.has('user_profile_lookup')).toBe(true);
    expect(SENSITIVE_OPERATIONS.has('save_to_profile')).toBe(true);
    expect(SENSITIVE_OPERATIONS.has('log_interaction')).toBe(true);
  });

  test('does not list search_web as sensitive', () => {
    expect(SENSITIVE_OPERATIONS.has('search_web')).toBe(false);
  });
});

describe('withPrivacySignal — blocking behaviour', () => {
  const sensitiveOperations = ['user_profile_lookup', 'save_to_profile', 'log_interaction'];

  for (const operation of sensitiveOperations) {
    test(`blocks ${operation} when privacySignals.gpc=true`, async () => {
      const fn = withPrivacySignal(operation, mockHandler);
      const result = await fn({}, { gpc: true });
      expect(result.status).toBe('blocked');
      expect(result.reason).toBe('gpc_opt_out');
      expect(result.tool).toBe(operation);
      expect(mockHandler).not.toHaveBeenCalled();
    });
  }

  test('does not block on truthy-but-not-boolean values (unlike the metadata version)', async () => {
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

  test('sensitive operation executes when privacySignals is empty', async () => {
    const fn = withPrivacySignal('user_profile_lookup', mockHandler);
    const result = await fn({}, {});
    expect(result.status).toBe('ok');
    expect(mockHandler).toHaveBeenCalledTimes(1);
  });

  test('sensitive operation executes when privacySignals is missing', async () => {
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
