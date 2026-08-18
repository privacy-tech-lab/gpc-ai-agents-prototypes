/**
 * Tests for agent.js that do not need Ollama: the recall tool boundary and
 * what the model is allowed to remember.
 */

const agent = require('../agent');
const gate = require('../persistence_gate');
const fixture = require('../session_fixture');
const { createMemory } = require('../memory_store');

describe('agent tool surface', () => {
  test('recall_memory is the only tool', () => {
    expect(agent.TOOL_DEFINITIONS.map(t => t.function.name)).toEqual(['recall_memory']);
  });

  test('unknown tool names are refused', async () => {
    const exec = agent.makeExecutor(createMemory(), new Set(), []);
    const result = await exec('dump_archive', {});
    expect(result.error).toBe('unknown_tool');
  });
});

describe('the recall_memory boundary', () => {
  test('returns the archived facts when nothing is asserted', async () => {
    const memory = createMemory();
    const [s1] = fixture.getSessions();
    gate.endSession(s1, memory, new Set());
    const checkpoints = [];
    const exec = agent.makeExecutor(memory, new Set(), checkpoints);
    const result = await exec('recall_memory', {});
    expect(result.known_facts.diet).toBe('vegetarian');
    expect(checkpoints[0].status).toBe('recalled');
  });

  test('returns nothing under D2 even with an archived session', async () => {
    const memory = createMemory();
    const [s1] = fixture.getSessions();
    gate.endSession(s1, memory, new Set());
    const checkpoints = [];
    const exec = agent.makeExecutor(memory, gate.resolveScope({ scope: ['d2'] }), checkpoints);
    const result = await exec('recall_memory', {});
    expect(result.known_facts).toEqual({});
    expect(checkpoints[0].status).toBe('blocked');
    expect(checkpoints[0].archived_sessions_present).toBe(1);
  });

  test('the model never sees the archive itself, only released facts', async () => {
    const memory = createMemory();
    const [s1] = fixture.getSessions();
    gate.endSession(s1, memory, new Set());
    const exec = agent.makeExecutor(memory, new Set(), []);
    const result = await exec('recall_memory', {});
    expect(Object.keys(result)).toEqual(['known_facts']);
  });
});
