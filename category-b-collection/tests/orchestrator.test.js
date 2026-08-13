/**
 * Integration tests for orchestrator.js: the full session in baseline mode,
 * under the whole-category GPC signal, and under each single-subtype scope.
 */

const orchestrator = require('../orchestrator');
const { closeClient } = require('../mcp_client');

// The orchestrator reaches the classifier over real MCP, which spawns
// mcp-server/server.js as a child process. Close it so jest exits cleanly.
afterAll(async () => {
  await closeClient();
});

describe('baseline: no opt-outs', () => {
  let run;
  beforeEach(async () => {
    run = await orchestrator.run({});
  });

  test('produces five stage records: one B1, three B2, one B3', async () => {
    const stages = run.stages.map(s => s.stage);
    expect(stages).toEqual(['B1', 'B2', 'B2', 'B2', 'B3']);
  });

  test('everything is collected', () => {
    expect(run.stages.map(s => s.status)).toEqual([
      'stored', 'recorded', 'recorded', 'recorded', 'derived',
    ]);
  });

  test('stores hold the submission, three events, and four attributes', () => {
    const s = run.stores_snapshot;
    expect(s.input_log.entry_count).toBe(1);
    expect(s.behavior_log.entry_count).toBe(3);
    expect(s.derived_profile.attribute_count).toBe(4);
  });

  test('the task output is the polished email', () => {
    expect(run.task_output).toContain('compensation');
  });
});

describe('GPC: the whole category asserted', () => {
  let run;
  beforeEach(async () => {
    run = await orchestrator.run({ gpc: true });
  });

  test('all three subtypes are active', () => {
    expect(run.optouts).toEqual(['b1', 'b2', 'b3']);
  });

  test('nothing is collected', () => {
    expect(run.stages.map(s => s.status)).toEqual([
      'discarded', 'suppressed', 'suppressed', 'suppressed', 'blocked',
    ]);
    const s = run.stores_snapshot;
    expect(s.input_log.entry_count).toBe(0);
    expect(s.behavior_log.entry_count).toBe(0);
    expect(s.derived_profile.attribute_count).toBe(0);
  });

  test('blocked counts record what was stopped', () => {
    const s = run.stores_snapshot;
    expect(s.input_log.blocked_count).toBe(1);
    expect(s.behavior_log.blocked_count).toBe(3);
    expect(s.derived_profile.blocked_count).toBe(1);
  });

  test('the task output is identical to baseline', async () => {
    const baseline = await orchestrator.run({});
    expect(run.task_output).toBe(baseline.task_output);
  });
});

describe('single-subtype scopes', () => {
  test('b1 only: submission discarded, behavior and profile still collected', async () => {
    const run = await orchestrator.run({ scope: ['b1'] });
    const s = run.stores_snapshot;
    expect(s.input_log.entry_count).toBe(0);
    expect(s.behavior_log.entry_count).toBe(3);
    expect(s.derived_profile.attribute_count).toBe(4);
  });

  test('b2 only: telemetry suppressed, submission and profile still collected', async () => {
    const run = await orchestrator.run({ scope: ['b2'] });
    const s = run.stores_snapshot;
    expect(s.input_log.entry_count).toBe(1);
    expect(s.behavior_log.entry_count).toBe(0);
    expect(s.behavior_log.blocked_count).toBe(3);
    expect(s.derived_profile.attribute_count).toBe(4);
  });

  test('b3 only: profile empty, submission and telemetry still collected', async () => {
    const run = await orchestrator.run({ scope: ['b3'] });
    const s = run.stores_snapshot;
    expect(s.input_log.entry_count).toBe(1);
    expect(s.behavior_log.entry_count).toBe(3);
    expect(s.derived_profile.attribute_count).toBe(0);
    expect(s.derived_profile.blocked_count).toBe(1);
  });

  test('b3 blocked record names the behavior-sourced attributes it stopped', async () => {
    const run = await orchestrator.run({ scope: ['b3'] });
    const b3 = run.stages.find(s => s.stage === 'B3');
    expect(b3.would_have_written.undisclosed_health_severity).toBe(true);
    expect(b3.attribute_sources.undisclosed_health_severity).toBe('behavior');
  });

  test('b1 and b2 together still allow B3 derivation', async () => {
    const run = await orchestrator.run({ scope: ['b1', 'b2'] });
    const s = run.stores_snapshot;
    expect(s.derived_profile.attribute_count).toBe(4);
    expect(s.input_log.entry_count).toBe(0);
    expect(s.behavior_log.entry_count).toBe(0);
  });
});
