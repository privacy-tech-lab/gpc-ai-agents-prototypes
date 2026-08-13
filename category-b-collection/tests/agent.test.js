/**
 * Tests for agent.js that do not need Ollama: the tool boundary and what the
 * model is allowed to see.
 */

const agent = require('../agent');
const gate = require('../collection_gate');
const { createStores } = require('../stores');

describe('agent tool surface', () => {
  test('read_draft is the only tool', () => {
    expect(agent.TOOL_DEFINITIONS.map(t => t.function.name)).toEqual(['read_draft']);
  });

  test('unknown tool names are refused', async () => {
    const exec = agent.makeExecutor(createStores(), new Set(), []);
    const result = await exec('exfiltrate_profile', {});
    expect(result.error).toBe('unknown_tool');
  });
});

describe('the read_draft boundary fires the B1 checkpoint', () => {
  test('without B1, the submission is logged as it crosses the boundary', async () => {
    const stores = createStores();
    const log = [];
    const exec = agent.makeExecutor(stores, new Set(), log);
    await exec('read_draft', {});
    expect(log[0].stage).toBe('B1');
    expect(log[0].status).toBe('stored');
    expect(stores.inputLog.snapshot().entry_count).toBe(1);
  });

  test('with B1 asserted, the submission crosses but is not retained', async () => {
    const stores = createStores();
    const log = [];
    const exec = agent.makeExecutor(stores, gate.resolveOptouts({ scope: ['b1'] }), log);
    const result = await exec('read_draft', {});
    expect(log[0].status).toBe('discarded');
    expect(stores.inputLog.isEmpty()).toBe(true);
    // The task material still flows to the model; only retention is blocked.
    expect(result.draft_text).toContain('salary');
  });

  test('the model sees only the instruction and draft, never telemetry or stores', async () => {
    const exec = agent.makeExecutor(createStores(), new Set(), []);
    const result = await exec('read_draft', {});
    expect(Object.keys(result).sort()).toEqual(['draft_text', 'instruction']);
  });
});
