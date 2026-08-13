/**
 * Tests for the LLM-agent layer (agent.js).
 *
 * These test the enforcement seam directly — makeExecutor() and
 * firePlatformTracker(), both of which route through withConsentCheck — so the
 * gating is verified deterministically without Ollama or the model. The agent loop
 * itself (agent_loop.js) is the same loop already used by Architectures A and B.
 *
 * Only paths that need no consent prompt are exercised here (silent, primary
 * category, GPC auto-decline), so nothing waits on the event bus. The prompt-driven
 * quarantine/resume path is already covered by consent_gate.test.js.
 */

const agent = require('../agent');
const manifest = require('../consent_manifest');
const { closeClient } = require('../mcp_client');

beforeEach(() => manifest.reset());

// Allowed tool calls spawn a real MCP child process; close it so Jest exits cleanly.
afterAll(async () => {
  await closeClient();
});

describe('tool definitions', () => {
  test('exposes only the user-facing tools — behavior_tracker is platform-fired', () => {
    const names = agent.TOOL_DEFINITIONS.map((t) => t.function.name);
    expect(names).toEqual(['file_read', 'web_search', 'email_sender']);
    expect(names).not.toContain('behavior_tracker');
  });
});

describe('makeExecutor — routes model tool calls through withConsentCheck', () => {
  test('silent mode executes with no check', async () => {
    const exec = agent.makeExecutor('silent', false);
    const r = await exec('file_read', { filename: 'notes.txt' });
    expect(r.status).toBe('executed');
    expect(r.tool).toBe('file_read');
  });

  test('a primary category runs (approved at signup) with no prompt', async () => {
    const exec = agent.makeExecutor('approve', false);
    const r = await exec('file_read', { filename: 'notes.txt' });
    expect(r.status).toBe('executed');
  });

  test('GPC auto-declines a new non-primary tool with no prompt', async () => {
    const exec = agent.makeExecutor('approve', true);
    const r = await exec('email_sender', { to: 'team@example.com', subject: 'Update' });
    expect(r.status).toBe('blocked');
    expect(r.reason).toBe('gpc_auto_decline');
    expect(r.category).toBe('communication');
  });

  // Regression. The executor used to forward any tool name straight
  // to server.invokeTool, so a model could fabricate a call to
  // behavior_tracker (intentionally absent from the agent surface)
  // and have it run in silent mode.
  test('blocks a fabricated tool name (behavior_tracker) before reaching the MCP layer', async () => {
    const exec = agent.makeExecutor('silent', false);
    const r = await exec('behavior_tracker', { event_type: 'session' });
    expect(r.status).toBe('blocked');
    expect(r.reason).toBe('tool_not_in_agent_surface');
    expect(r.tool).toBe('behavior_tracker');
  });

  test('blocks any tool name the model invents (not in TOOL_DEFINITIONS)', async () => {
    const exec = agent.makeExecutor('silent', false);
    const r = await exec('delete_account', {});
    expect(r.status).toBe('blocked');
    expect(r.reason).toBe('tool_not_in_agent_surface');
  });
});

describe('firePlatformTracker — ambient analytics, gated like any tool', () => {
  test('executes in silent mode', async () => {
    const r = await agent.firePlatformTracker('silent', false);
    expect(r.status).toBe('executed');
    expect(r.tool).toBe('behavior_tracker');
  });

  test('GPC auto-declines the tracker (the A2 case)', async () => {
    const r = await agent.firePlatformTracker('approve', true);
    expect(r.status).toBe('blocked');
    expect(r.reason).toBe('gpc_auto_decline');
    expect(r.category).toBe('analytics');
  });
});
