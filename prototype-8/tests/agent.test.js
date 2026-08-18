/**
 * Tests for agent.js that do not need Ollama: the tool surface and the gate
 * behind it.
 */

const agent = require('../agent');
const { closeClient } = require('../mcp_client');

// Executed actions cross real MCP, which spawns mcp-server/server.js as a
// child process. Close it so jest exits cleanly.
afterAll(async () => {
  await closeClient();
});

describe('agent tool surface', () => {
  test('the platform actions are not agent tools', () => {
    const names = agent.TOOL_DEFINITIONS.map(t => t.function.name);
    expect(names).toEqual(['search_flights', 'hold_reservation', 'book_flight', 'share_passport']);
  });

  test('unknown tool names are refused', async () => {
    const exec = agent.makeExecutor({ mode: 'enforced' }, []);
    const result = await exec('newsletter_signup', {});
    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('tool_not_in_agent_surface');
  });
});

describe('the executor routes calls through the delegation gate', () => {
  test('a user-granted action executes', async () => {
    const log = [];
    const exec = agent.makeExecutor({ mode: 'enforced' }, log);
    const result = await exec('search_flights', { route: 'BKK-ORD', dates: 'friday' });
    expect(result.status).toBe('executed');
    expect(log).toHaveLength(1);
  });

  test('a high-stakes action is declined when nobody is available', async () => {
    const exec = agent.makeExecutor({ mode: 'enforced', userPresent: false }, []);
    const result = await exec('book_flight', { flight: 'UA123', fare: 412.5 });
    expect(result.status).toBe('declined');
    expect(result.reason).toBe('default_restrictive_no_user');
  });

  test('the model cannot reassign a tier through its input', async () => {
    const exec = agent.makeExecutor({ mode: 'enforced', userPresent: false }, []);
    const result = await exec('share_passport', { recipient: 'anywhere', tier: 'autonomous' });
    expect(result.status).toBe('declined');
  });
});
