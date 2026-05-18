/**
 * Unit tests for gpc_policy.js (Layer 4).
 *
 * Covers:
 *  - Sensitive tools are blocked when gpc=1 (boolean, number, string)
 *  - Non-sensitive tools always execute
 *  - Timing metadata is included in ok results
 *  - gpc=0 / gpc=false / missing meta — tools run normally
 */

const { withGpc, SENSITIVE_TOOLS } = require('../mcp-server/gpc_policy.js');

const mockHandler = jest.fn().mockResolvedValue({ data: 'result' });

beforeEach(() => mockHandler.mockClear());

describe('SENSITIVE_TOOLS', () => {
  test('contains expected sensitive tools', () => {
    expect(SENSITIVE_TOOLS.has('user_profile_lookup')).toBe(true);
    expect(SENSITIVE_TOOLS.has('save_to_profile')).toBe(true);
    expect(SENSITIVE_TOOLS.has('log_interaction')).toBe(true);
  });

  test('does not list search_web as sensitive', () => {
    expect(SENSITIVE_TOOLS.has('search_web')).toBe(false);
  });
});

describe('withGpc — blocking behaviour', () => {
  const sensitiveTools = ['user_profile_lookup', 'save_to_profile', 'log_interaction'];

  for (const tool of sensitiveTools) {
    test(`blocks ${tool} when gpc=1 (number)`, async () => {
      const fn = withGpc(tool, mockHandler);
      const result = await fn({}, { gpc: 1 });
      expect(result.status).toBe('blocked');
      expect(result.reason).toBe('gpc_opt_out');
      expect(result.tool).toBe(tool);
      expect(mockHandler).not.toHaveBeenCalled();
    });

    test(`blocks ${tool} when gpc=true (boolean)`, async () => {
      const fn = withGpc(tool, mockHandler);
      const result = await fn({}, { gpc: true });
      expect(result.status).toBe('blocked');
    });

    test(`blocks ${tool} when gpc='1' (string)`, async () => {
      const fn = withGpc(tool, mockHandler);
      const result = await fn({}, { gpc: '1' });
      expect(result.status).toBe('blocked');
    });
  }
});

describe('withGpc — passthrough behaviour', () => {
  test('search_web always executes regardless of gpc=1', async () => {
    const fn = withGpc('search_web', mockHandler);
    const result = await fn({ query: 'test' }, { gpc: 1 });
    expect(result.status).toBe('ok');
    expect(mockHandler).toHaveBeenCalledTimes(1);
  });

  test('sensitive tool executes when gpc=0', async () => {
    const fn = withGpc('user_profile_lookup', mockHandler);
    const result = await fn({}, { gpc: 0 });
    expect(result.status).toBe('ok');
    expect(mockHandler).toHaveBeenCalledTimes(1);
  });

  test('sensitive tool executes when meta is empty', async () => {
    const fn = withGpc('user_profile_lookup', mockHandler);
    const result = await fn({}, {});
    expect(result.status).toBe('ok');
  });

  test('sensitive tool executes when meta is missing', async () => {
    const fn = withGpc('user_profile_lookup', mockHandler);
    const result = await fn({});
    expect(result.status).toBe('ok');
  });

  test('ok result includes durationMs', async () => {
    const fn = withGpc('search_web', mockHandler);
    const result = await fn({}, {});
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test('ok result includes handler return value under result key', async () => {
    const fn = withGpc('search_web', mockHandler);
    const result = await fn({}, {});
    expect(result.result).toEqual({ data: 'result' });
  });
});
