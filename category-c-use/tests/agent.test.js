/**
 * Tests for agent.js that do not need Ollama: the tool boundary and what the
 * model is allowed to see.
 */

const agent = require('../agent');

describe('agent tool surface', () => {
  test('read_reading is the only tool', () => {
    expect(agent.TOOL_DEFINITIONS.map(t => t.function.name)).toEqual(['read_reading']);
  });

  test('unknown tool names are refused', async () => {
    const exec = agent.makeExecutor();
    const result = await exec('query_ad_queue', {});
    expect(result.error).toBe('unknown_tool');
  });

  test('the model sees only the reading and question, not the health context', async () => {
    const exec = agent.makeExecutor();
    const result = await exec('read_reading', {});
    expect(Object.keys(result).sort()).toEqual(['question', 'reading']);
    expect(result.reading.systolic).toBe(158);
  });
});
