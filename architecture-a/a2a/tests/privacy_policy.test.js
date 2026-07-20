/**
 * Unit tests for agent-server/privacy_policy.js (Layer 4).
 *
 * Mirrors mcp/tests/gpc_policy.test.js, but exercises withPrivacyPolicy()
 * against Message.metadata instead of MCP's _meta.
 */

const { withPrivacyPolicy, SENSITIVE_OPERATIONS } = require('../agent-server/privacy_policy.js');

const mockHandler = jest.fn().mockResolvedValue({ data: 'result' });

beforeEach(() => mockHandler.mockClear());

describe('SENSITIVE_OPERATIONS', () => {
  test('contains expected sensitive operations', () => {
    expect(SENSITIVE_OPERATIONS.has('user_profile_lookup')).toBe(true);
    expect(SENSITIVE_OPERATIONS.has('save_to_profile')).toBe(true);
    expect(SENSITIVE_OPERATIONS.has('log_interaction')).toBe(true);
  });

  test('does not list search_web as sensitive', () => {
    expect(SENSITIVE_OPERATIONS.has('search_web')).toBe(false);
  });
});

describe('withPrivacyPolicy — blocking behaviour', () => {
  const sensitiveOperations = ['user_profile_lookup', 'save_to_profile', 'log_interaction'];

  for (const operation of sensitiveOperations) {
    test(`blocks ${operation} when metadata.gpc=1 (number)`, async () => {
      const fn = withPrivacyPolicy(operation, mockHandler);
      const result = await fn({}, { gpc: 1 });
      expect(result.status).toBe('blocked');
      expect(result.reason).toBe('gpc_opt_out');
      expect(result.tool).toBe(operation);
      expect(mockHandler).not.toHaveBeenCalled();
    });

    test(`blocks ${operation} when metadata.gpc=true (boolean)`, async () => {
      const fn = withPrivacyPolicy(operation, mockHandler);
      const result = await fn({}, { gpc: true });
      expect(result.status).toBe('blocked');
    });

    test(`blocks ${operation} when metadata.gpc='1' (string)`, async () => {
      const fn = withPrivacyPolicy(operation, mockHandler);
      const result = await fn({}, { gpc: '1' });
      expect(result.status).toBe('blocked');
    });
  }
});

describe('withPrivacyPolicy — passthrough behaviour', () => {
  test('search_web always executes regardless of metadata.gpc', async () => {
    const fn = withPrivacyPolicy('search_web', mockHandler);
    const result = await fn({ query: 'test' }, { gpc: 1 });
    expect(result.status).toBe('ok');
    expect(mockHandler).toHaveBeenCalledTimes(1);
  });

  test('sensitive operation executes when metadata is empty', async () => {
    const fn = withPrivacyPolicy('user_profile_lookup', mockHandler);
    const result = await fn({}, {});
    expect(result.status).toBe('ok');
    expect(mockHandler).toHaveBeenCalledTimes(1);
  });

  test('sensitive operation executes when metadata is missing', async () => {
    const fn = withPrivacyPolicy('user_profile_lookup', mockHandler);
    const result = await fn({});
    expect(result.status).toBe('ok');
  });

  test('ok result includes durationMs', async () => {
    const fn = withPrivacyPolicy('search_web', mockHandler);
    const result = await fn({}, {});
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test('ok result includes handler return value under result key', async () => {
    const fn = withPrivacyPolicy('search_web', mockHandler);
    const result = await fn({}, {});
    expect(result.result).toEqual({ data: 'result' });
  });
});
