/**
 * Integration tests for orchestrator.js: the two-session run in baseline
 * mode and under each scope of the hierarchy.
 */

const orchestrator = require('../orchestrator');

describe('baseline: no opt-outs', () => {
  let run;
  beforeEach(async () => {
    run = await orchestrator.run({});
  });

  test('both sessions are archived', () => {
    expect(run.memory_snapshot.archive.entry_count).toBe(2);
  });

  test('session 2 is tailored from session 1 disclosures', () => {
    expect(run.session2_answer).toContain('vegetarian');
    expect(run.session2_answer).toContain('Verde Table');
  });

  test('the profile is synthesized', () => {
    expect(run.memory_snapshot.profile.entry_count).toBe(1);
  });

  test('in-session context was available for the turn 2 answer', () => {
    const ctx = run.checkpoints.find(c => c.checkpoint === 'in_session_context');
    expect(ctx.status).toBe('allowed');
    expect(ctx.context_available).toBe(true);
  });
});

describe('session: nothing survives a session end', () => {
  let run;
  beforeEach(async () => {
    run = await orchestrator.run({ scope: ['session'] });
  });

  test('the whole hierarchy is active', () => {
    expect(run.optouts).toEqual(['session', 'cross_session', 'profile']);
  });

  test('the archive stays empty and both discards are counted', () => {
    expect(run.memory_snapshot.archive.entry_count).toBe(0);
    expect(run.memory_snapshot.archive.blocked_count).toBe(2);
  });

  test('session 2 starts from a clean slate', () => {
    const recall = run.checkpoints.find(c => c.checkpoint === 'session_start');
    expect(recall.status).toBe('blocked');
    expect(run.session2_answer).toContain('What kind of food');
  });

  test('same-session coherence still works: turn 2 is identical to baseline', async () => {
    const baseline = await orchestrator.run({});
    expect(run.session1_turn2_answer).toBe(baseline.session1_turn2_answer);
    const ctx = run.checkpoints.find(c => c.checkpoint === 'in_session_context');
    expect(ctx.context_available).toBe(true);
  });

  test('no profile exists', () => {
    expect(run.memory_snapshot.profile.entry_count).toBe(0);
  });
});

describe('cross_session: retained but not carried forward', () => {
  let run;
  beforeEach(async () => {
    run = await orchestrator.run({ scope: ['cross_session'] });
  });

  test('cross_session implies profile', () => {
    expect(run.optouts).toEqual(['cross_session', 'profile']);
  });

  test('the archive keeps both sessions for the user', () => {
    expect(run.memory_snapshot.archive.entry_count).toBe(2);
  });

  test('recall is blocked even though the archive has entries', () => {
    const recall = run.checkpoints.find(c => c.checkpoint === 'session_start');
    expect(recall.status).toBe('blocked');
    expect(recall.archived_sessions_present).toBe(1);
    expect(run.session2_answer).toContain('What kind of food');
  });

  test('synthesis is blocked through the implication', () => {
    expect(run.memory_snapshot.profile.entry_count).toBe(0);
    expect(run.memory_snapshot.profile.blocked_count).toBe(1);
  });
});

describe('profile: remembered but never modeled', () => {
  let run;
  beforeEach(async () => {
    run = await orchestrator.run({ scope: ['profile'] });
  });

  test('only profile is active', () => {
    expect(run.optouts).toEqual(['profile']);
  });

  test('cross-session recall still works and tailors session 2', () => {
    const recall = run.checkpoints.find(c => c.checkpoint === 'session_start');
    expect(recall.status).toBe('recalled');
    expect(run.session2_answer).toContain('Verde Table');
  });

  test('only the profile synthesis is blocked', () => {
    expect(run.memory_snapshot.archive.entry_count).toBe(2);
    expect(run.memory_snapshot.profile.entry_count).toBe(0);
    expect(run.memory_snapshot.profile.blocked_count).toBe(1);
  });
});

describe('GPC asserts the strictest scope', () => {
  test('bare GPC behaves like session', async () => {
    const run = await orchestrator.run({ gpc: true });
    expect(run.optouts).toEqual(['session', 'cross_session', 'profile']);
    expect(run.memory_snapshot.archive.entry_count).toBe(0);
  });
});
