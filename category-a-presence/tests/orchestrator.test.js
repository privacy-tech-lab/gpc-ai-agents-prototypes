/**
 * Integration tests for orchestrator.js: full scripted sessions across the
 * v1.0 install and the v2.0 update, in every enforcement mode.
 */

const orchestrator = require('../orchestrator');
const manifest = require('../presence_manifest');
const bus = require('../event_bus');

function respondApprove() {
  bus.on('opt_in_request', ({ feature, resolve }) => {
    manifest.enable(feature.name);
    resolve({ approved: true, promptText: 'test-prompt' });
  });
}

function respondDecline() {
  bus.on('opt_in_request', ({ feature, resolve }) => {
    manifest.decline(feature.name);
    resolve({ approved: false, promptText: 'test-prompt' });
  });
}

beforeEach(() => {
  manifest.reset();
  bus.removeAllListeners();
});

describe('v1.0: no AI features exist', () => {
  test('only note_read from the sequence is available and it executes', async () => {
    const { results, presenceEvents } = await orchestrator.run('v1.0', null);
    expect(results).toHaveLength(1);
    expect(results[0].feature).toBe('note_read');
    expect(results[0].status).toBe('executed');
    expect(presenceEvents).toEqual([]);
  });
});

describe('v2.0 silent: the violation baseline', () => {
  test('all three calls execute', async () => {
    const { results } = await orchestrator.run('v2.0', 'silent');
    expect(results).toHaveLength(3);
    expect(results.every(r => r.status === 'executed')).toBe(true);
  });

  test('violations are recorded for both AI features', async () => {
    const { presenceEvents } = await orchestrator.run('v2.0', 'silent');
    expect(presenceEvents).toEqual([
      { feature: 'ai_summarize', subtype: 'A1', reason: 'violated_in_silent_mode' },
      { feature: 'ai_ambient_copilot', subtype: 'A1+A2', reason: 'violated_in_silent_mode' },
    ]);
  });
});

describe('v2.0 approve: opt-in satisfies A1, ambient still blocks A2', () => {
  test('ai_summarize runs after the opt-in prompt', async () => {
    respondApprove();
    const { results } = await orchestrator.run('v2.0', 'approve');
    const summarize = results.find(r => r.feature === 'ai_summarize');
    expect(summarize.status).toBe('executed');
    expect(summarize.consent_required).toBe(true);
  });

  test('ai_ambient_copilot stays blocked on A2 without the ambient opt-in', async () => {
    respondApprove();
    const { results, presenceEvents } = await orchestrator.run('v2.0', 'approve');
    const copilot = results.find(r => r.feature === 'ai_ambient_copilot');
    expect(copilot.status).toBe('blocked');
    expect(copilot.subtype).toBe('A2');
    expect(presenceEvents).toContainEqual({
      feature: 'ai_ambient_copilot',
      subtype: 'A2',
      reason: 'ambient_not_enabled',
    });
  });

  test('ai_ambient_copilot runs when the user enabled ambient mode first', async () => {
    respondApprove();
    manifest.setAmbient(true);
    const { results } = await orchestrator.run('v2.0', 'approve');
    const copilot = results.find(r => r.feature === 'ai_ambient_copilot');
    expect(copilot.status).toBe('executed');
  });
});

describe('v2.0 decline: both AI features stay off', () => {
  test('both AI calls are blocked on A1', async () => {
    respondDecline();
    const { results } = await orchestrator.run('v2.0', 'decline');
    const summarize = results.find(r => r.feature === 'ai_summarize');
    const copilot = results.find(r => r.feature === 'ai_ambient_copilot');
    expect(summarize.status).toBe('blocked');
    expect(summarize.subtype).toBe('A1');
    expect(copilot.status).toBe('blocked');
    expect(copilot.subtype).toBe('A1');
  });

  test('note_read is unaffected', async () => {
    respondDecline();
    const { results } = await orchestrator.run('v2.0', 'decline');
    expect(results.find(r => r.feature === 'note_read').status).toBe('executed');
  });

  test('declines persist: a later session blocks without prompting', async () => {
    respondDecline();
    await orchestrator.run('v2.0', 'decline');
    bus.removeAllListeners();
    const listener = jest.fn();
    bus.on('opt_in_request', listener);
    const { results } = await orchestrator.run('v2.0', 'approve');
    const summarize = results.find(r => r.feature === 'ai_summarize');
    expect(summarize.reason).toBe('previously_declined');
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('v2.0 GPC: auto-decline with no prompts', () => {
  test('both AI features are blocked and no opt_in_request fires', async () => {
    const listener = jest.fn();
    bus.on('opt_in_request', listener);
    const { results } = await orchestrator.run('v2.0', 'approve', true);
    const summarize = results.find(r => r.feature === 'ai_summarize');
    const copilot = results.find(r => r.feature === 'ai_ambient_copilot');
    expect(summarize.reason).toBe('gpc_auto_decline');
    expect(copilot.reason).toBe('gpc_auto_decline');
    expect(listener).not.toHaveBeenCalled();
  });

  test('GPC declines persist to the manifest', async () => {
    await orchestrator.run('v2.0', 'approve', true);
    expect(manifest.isDeclined('ai_summarize')).toBe(true);
    expect(manifest.isDeclined('ai_ambient_copilot')).toBe(true);
  });
});
