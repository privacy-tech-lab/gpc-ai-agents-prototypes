/**
 * Integration tests for services/personalization.js.
 *
 * Exercises the real MCP client/server round trip (same pattern as
 * orchestrator.test.js) rather than mocking mcp_client, since the whole
 * point of this module is orchestrating two real tool calls under
 * different scope gates.
 */

const { buildPersonalizationContext } = require('../services/personalization.js');
const { callTool, closeClient } = require('../orchestrator/mcp_client.js');

const USER_ID = 'test-user-personalization';

beforeAll(async () => {
  // Seed known state for this user via real (unblocked) tool calls.
  await callTool('save_to_profile', { user_id: USER_ID, data: { interests: ['hiking'] } }, {}, []);
  await callTool('log_interaction', { user_id: USER_ID, query: 'past query', response_summary: 'past answer' }, {}, []);
});

afterAll(async () => {
  await closeClient();
});

describe('buildPersonalizationContext — baseline (no signal)', () => {
  test('consults both raw history and the synthesized profile', async () => {
    const ctx = await buildPersonalizationContext({ user_id: USER_ID, _meta: {}, timing: [] });
    expect(ctx.historyConsulted).toBe(true);
    expect(ctx.profileConsulted).toBe(true);
    expect(ctx.history.interactions.some((i) => i.query === 'past query')).toBe(true);
    expect(ctx.profile.profile.interests).toContain('hiking');
  });
});

describe('buildPersonalizationContext — d3 (raw history ok, no synthesized profile)', () => {
  test('consults history but not the profile', async () => {
    const _meta = { gpc: 1, persistence_scope: 'd3' };
    const ctx = await buildPersonalizationContext({ user_id: USER_ID, _meta, timing: [] });
    expect(ctx.historyConsulted).toBe(true);
    expect(ctx.profileConsulted).toBe(false);
    expect(ctx.profile).toBeNull();
  });
});

describe('buildPersonalizationContext — d2 (no consultation at all)', () => {
  test('consults neither history nor profile', async () => {
    const _meta = { gpc: 1, persistence_scope: 'd2' };
    const ctx = await buildPersonalizationContext({ user_id: USER_ID, _meta, timing: [] });
    expect(ctx.historyConsulted).toBe(false);
    expect(ctx.profileConsulted).toBe(false);
    expect(ctx.history).toBeNull();
    expect(ctx.profile).toBeNull();
  });
});

describe('buildPersonalizationContext — d1 (default when gpc=1, no scope given)', () => {
  test('consults neither history nor profile', async () => {
    const _meta = { gpc: 1 };
    const ctx = await buildPersonalizationContext({ user_id: USER_ID, _meta, timing: [] });
    expect(ctx.historyConsulted).toBe(false);
    expect(ctx.profileConsulted).toBe(false);
  });
});

describe('buildPersonalizationContext — timing', () => {
  test('records a blocked timing entry for each skipped tool', async () => {
    const timing = [];
    await buildPersonalizationContext({ user_id: USER_ID, _meta: { gpc: 1, persistence_scope: 'd2' }, timing });
    const tools = timing.map((t) => t.tool);
    expect(tools).toContain('get_interaction_history');
    expect(tools).toContain('user_profile_lookup');
    expect(timing.every((t) => t.status === 'blocked')).toBe(true);
  });
});
