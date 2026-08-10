/**
 * Tests for agent.js that do not need Ollama: the tool surface guard and the
 * platform-fired ambient copilot path.
 */

const agent = require('../agent');
const manifest = require('../presence_manifest');
const bus = require('../event_bus');

beforeEach(() => {
  manifest.reset();
  bus.removeAllListeners();
});

describe('agent tool surface', () => {
  test('ai_ambient_copilot is not among the agent tool definitions', () => {
    const names = agent.TOOL_DEFINITIONS.map(t => t.function.name);
    expect(names).toEqual(['note_read', 'note_save', 'ai_summarize']);
  });

  test('the executor refuses a tool name outside the agent surface', async () => {
    const exec = agent.makeExecutor('approve', false);
    const result = await exec('ai_ambient_copilot', { event: 'x' });
    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('tool_not_in_agent_surface');
  });

  test('the executor routes an in-surface non-AI tool through the gate', async () => {
    const exec = agent.makeExecutor('approve', false);
    const result = await exec('note_read', { filename: 'a.md' });
    expect(result.status).toBe('executed');
  });

  test('the executor routes ai_summarize through the A1 gate', async () => {
    bus.on('opt_in_request', ({ feature, resolve }) => {
      manifest.decline(feature.name);
      resolve({ approved: false, promptText: '' });
    });
    const exec = agent.makeExecutor('decline', false);
    const result = await exec('ai_summarize', { filename: 'a.md' });
    expect(result.status).toBe('blocked');
    expect(result.subtype).toBe('A1');
  });
});

describe('platform-fired ambient copilot (the A2 case)', () => {
  test('is blocked on A2 even when the opt-in responder approves A1', async () => {
    bus.on('opt_in_request', ({ feature, resolve }) => {
      manifest.enable(feature.name);
      resolve({ approved: true, promptText: '' });
    });
    const result = await agent.firePlatformCopilot('approve', false);
    expect(result.status).toBe('blocked');
    expect(result.subtype).toBe('A2');
    expect(result.reason).toBe('ambient_not_enabled');
  });

  test('runs when the user explicitly enabled ambient mode', async () => {
    bus.on('opt_in_request', ({ feature, resolve }) => {
      manifest.enable(feature.name);
      resolve({ approved: true, promptText: '' });
    });
    manifest.setAmbient(true);
    const result = await agent.firePlatformCopilot('approve', false);
    expect(result.status).toBe('executed');
  });

  test('is auto-declined under GPC', async () => {
    const result = await agent.firePlatformCopilot('approve', true);
    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('gpc_auto_decline');
  });
});
