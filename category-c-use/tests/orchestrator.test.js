/**
 * Integration tests for orchestrator.js: the full session in baseline mode,
 * under the whole-category GPC signal, and under each scope.
 */

const orchestrator = require('../orchestrator');

describe('baseline: no opt-outs', () => {
  let run;
  beforeEach(async () => {
    run = await orchestrator.run({});
  });

  test('all six use attempts are allowed', () => {
    expect(run.use_results).toHaveLength(6);
    expect(run.use_results.every(r => r.status === 'allowed')).toBe(true);
  });

  test('both chain hops receive the full payload', () => {
    expect(run.chain_results.map(r => r.status)).toEqual([
      'transferred_full',
      'transferred_full',
    ]);
  });

  test('every output store received its write', () => {
    const s = run.outputs_snapshot;
    expect(s.insurance_assessments.entry_count).toBe(1);
    expect(s.personalization_profile.entry_count).toBe(1);
    expect(s.analytics_log.entry_count).toBe(1);
    expect(s.ad_queue.entry_count).toBe(1);
    expect(s.training_set.entry_count).toBe(1);
    expect(s.chain_transfers.entry_count).toBe(2);
  });

  test('the answer is present', () => {
    expect(run.task_output).toContain('stage 2 hypertension');
  });
});

describe('GPC: the whole category asserted', () => {
  let run;
  beforeEach(async () => {
    run = await orchestrator.run({ gpc: true });
  });

  test('the primary answer is still allowed', () => {
    const primary = run.use_results.find(r => r.subtype === null);
    expect(primary.status).toBe('allowed');
  });

  test('all five downstream uses are blocked', () => {
    const gated = run.use_results.filter(r => r.subtype !== null);
    expect(gated).toHaveLength(5);
    expect(gated.every(r => r.status === 'blocked')).toBe(true);
  });

  test('the necessary hop is minimized and the unnecessary hop is refused', () => {
    expect(run.chain_results[0].status).toBe('transferred_minimized');
    expect(run.chain_results[0].fields_sent).toEqual(['medication']);
    expect(run.chain_results[1].status).toBe('blocked');
  });

  test('only the minimized transfer reached any store', () => {
    const s = run.outputs_snapshot;
    expect(s.insurance_assessments.entry_count).toBe(0);
    expect(s.personalization_profile.entry_count).toBe(0);
    expect(s.analytics_log.entry_count).toBe(0);
    expect(s.ad_queue.entry_count).toBe(0);
    expect(s.training_set.entry_count).toBe(0);
    expect(s.chain_transfers.entry_count).toBe(1);
    expect(s.chain_transfers.entries[0].minimized).toBe(true);
  });

  test('the answer is identical to baseline', async () => {
    const baseline = await orchestrator.run({});
    expect(run.task_output).toBe(baseline.task_output);
  });
});

describe('scopes', () => {
  test('c1 blocks the insurance reuse and personalization, everything else flows', async () => {
    const run = await orchestrator.run({ scope: ['c1'] });
    const s = run.outputs_snapshot;
    expect(s.insurance_assessments.entry_count).toBe(0);
    expect(s.personalization_profile.entry_count).toBe(0);
    expect(s.analytics_log.entry_count).toBe(1);
    expect(s.ad_queue.entry_count).toBe(1);
    expect(s.training_set.entry_count).toBe(1);
    expect(s.chain_transfers.entry_count).toBe(2);
  });

  test('c1a blocks only personalization', async () => {
    const run = await orchestrator.run({ scope: ['c1a'] });
    const s = run.outputs_snapshot;
    expect(s.personalization_profile.entry_count).toBe(0);
    expect(s.insurance_assessments.entry_count).toBe(1);
  });

  test('c2 blocks analytics and ad targeting', async () => {
    const run = await orchestrator.run({ scope: ['c2'] });
    const s = run.outputs_snapshot;
    expect(s.analytics_log.entry_count).toBe(0);
    expect(s.ad_queue.entry_count).toBe(0);
    expect(s.training_set.entry_count).toBe(1);
  });

  test('c2a blocks only ad targeting', async () => {
    const run = await orchestrator.run({ scope: ['c2a'] });
    const s = run.outputs_snapshot;
    expect(s.ad_queue.entry_count).toBe(0);
    expect(s.analytics_log.entry_count).toBe(1);
  });

  test('c3 blocks only the training append', async () => {
    const run = await orchestrator.run({ scope: ['c3'] });
    const s = run.outputs_snapshot;
    expect(s.training_set.entry_count).toBe(0);
    expect(s.training_set.blocked_count).toBe(1);
    expect(s.analytics_log.entry_count).toBe(1);
  });

  test('c4 leaves platform uses alone and governs only the chain', async () => {
    const run = await orchestrator.run({ scope: ['c4'] });
    const s = run.outputs_snapshot;
    expect(s.analytics_log.entry_count).toBe(1);
    expect(s.training_set.entry_count).toBe(1);
    expect(run.chain_results[0].status).toBe('transferred_minimized');
    expect(run.chain_results[1].status).toBe('blocked');
  });
});
