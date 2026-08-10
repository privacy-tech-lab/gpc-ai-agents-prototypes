/**
 * Unit tests for presence_gate.js, the Category A enforcement seam.
 *
 * Covers:
 *  - Non-AI features run in every mode with no prompt (out of Category A scope)
 *  - Silent mode executes AI features but annotates A1 and A2 violations
 *  - A1: undecided AI features fire an opt_in_request and stay off on decline
 *  - A1: declined features are hard-blocked with no prompt in later sessions
 *  - A1: GPC auto-declines undecided AI features without prompting
 *  - A2: passive activation is blocked without the explicit ambient opt-in
 *  - A2: platform-initiated calls count as passive even for on-demand features
 *  - A1 and A2 are independent of each other
 *  - Unknown feature names throw
 */

const gate = require('../presence_gate');
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

describe('non-AI features are out of Category A scope', () => {
  test('note_read executes in enforced mode with no prompt', async () => {
    const listener = jest.fn();
    bus.on('opt_in_request', listener);
    const result = await gate.invokeFeature('note_read', { filename: 'a.md' }, { mode: 'approve' });
    expect(result.status).toBe('executed');
    expect(result.subtype).toBeNull();
    expect(listener).not.toHaveBeenCalled();
  });

  test('note_save executes even under GPC', async () => {
    const result = await gate.invokeFeature(
      'note_save',
      { filename: 'a.md', content: 'x' },
      { mode: 'approve', gpc: true }
    );
    expect(result.status).toBe('executed');
  });
});

describe('silent mode: the violation baseline', () => {
  test('ai_summarize executes and is annotated as an A1 violation', async () => {
    const result = await gate.invokeFeature('ai_summarize', { filename: 'a.md' }, { mode: 'silent' });
    expect(result.status).toBe('executed');
    expect(result.violations).toEqual(['A1']);
  });

  test('ai_ambient_copilot executes and is annotated as A1 and A2 violations', async () => {
    const result = await gate.invokeFeature(
      'ai_ambient_copilot',
      { event: 'typing', chars: 10 },
      { mode: 'silent', initiatedBy: 'platform' }
    );
    expect(result.status).toBe('executed');
    expect(result.violations).toEqual(['A1', 'A2']);
  });

  test('no opt_in_request fires in silent mode', async () => {
    const listener = jest.fn();
    bus.on('opt_in_request', listener);
    await gate.invokeFeature('ai_summarize', { filename: 'a.md' }, { mode: 'silent' });
    expect(listener).not.toHaveBeenCalled();
  });

  test('an enabled feature carries no violation annotation', async () => {
    manifest.enable('ai_summarize');
    const result = await gate.invokeFeature('ai_summarize', { filename: 'a.md' }, { mode: 'silent' });
    expect(result.violations).toEqual([]);
  });
});

describe('A1 integration: off by default, opt-in required', () => {
  test('undecided AI feature fires an opt_in_request', async () => {
    const listener = jest.fn(({ resolve }) => resolve({ approved: false, promptText: '' }));
    bus.on('opt_in_request', listener);
    await gate.invokeFeature('ai_summarize', { filename: 'a.md' }, { mode: 'approve' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('approval executes the feature and marks consent_required', async () => {
    respondApprove();
    const result = await gate.invokeFeature('ai_summarize', { filename: 'a.md' }, { mode: 'approve' });
    expect(result.status).toBe('executed');
    expect(result.consent_required).toBe(true);
    expect(manifest.isEnabled('ai_summarize')).toBe(true);
  });

  test('decline blocks with subtype A1 and persists the decision', async () => {
    respondDecline();
    const result = await gate.invokeFeature('ai_summarize', { filename: 'a.md' }, { mode: 'decline' });
    expect(result.status).toBe('blocked');
    expect(result.subtype).toBe('A1');
    expect(result.reason).toBe('user_declined_opt_in');
    expect(manifest.isDeclined('ai_summarize')).toBe(true);
  });

  test('a previously declined feature is blocked without a prompt', async () => {
    manifest.decline('ai_summarize');
    const listener = jest.fn();
    bus.on('opt_in_request', listener);
    const result = await gate.invokeFeature('ai_summarize', { filename: 'a.md' }, { mode: 'approve' });
    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('previously_declined');
    expect(result.subtype).toBe('A1');
    expect(listener).not.toHaveBeenCalled();
  });

  test('a previously enabled feature executes without a prompt', async () => {
    manifest.enable('ai_summarize');
    const listener = jest.fn();
    bus.on('opt_in_request', listener);
    const result = await gate.invokeFeature('ai_summarize', { filename: 'a.md' }, { mode: 'approve' });
    expect(result.status).toBe('executed');
    expect(result.consent_required).toBeUndefined();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('A1 under GPC: auto-decline without prompting', () => {
  test('undecided AI feature is blocked with gpc_auto_decline', async () => {
    const listener = jest.fn();
    bus.on('opt_in_request', listener);
    const result = await gate.invokeFeature(
      'ai_summarize',
      { filename: 'a.md' },
      { mode: 'approve', gpc: true }
    );
    expect(result.status).toBe('blocked');
    expect(result.subtype).toBe('A1');
    expect(result.reason).toBe('gpc_auto_decline');
    expect(listener).not.toHaveBeenCalled();
  });

  test('the GPC auto-decline persists to the manifest', async () => {
    await gate.invokeFeature('ai_summarize', { filename: 'a.md' }, { mode: 'approve', gpc: true });
    expect(manifest.isDeclined('ai_summarize')).toBe(true);
  });

  test('an already enabled on-demand feature still runs under GPC when the user invokes it', async () => {
    manifest.enable('ai_summarize');
    const result = await gate.invokeFeature(
      'ai_summarize',
      { filename: 'a.md' },
      { mode: 'approve', gpc: true, initiatedBy: 'user' }
    );
    expect(result.status).toBe('executed');
  });
});

describe('A2 activation: passive AI needs an explicit ambient opt-in', () => {
  test('enabled passive feature is blocked when ambient mode is off', async () => {
    manifest.enable('ai_ambient_copilot');
    const result = await gate.invokeFeature(
      'ai_ambient_copilot',
      { event: 'typing', chars: 10 },
      { mode: 'approve', initiatedBy: 'platform' }
    );
    expect(result.status).toBe('blocked');
    expect(result.subtype).toBe('A2');
    expect(result.reason).toBe('ambient_not_enabled');
  });

  test('enabled passive feature runs when the user turned ambient mode on', async () => {
    manifest.enable('ai_ambient_copilot');
    manifest.setAmbient(true);
    const result = await gate.invokeFeature(
      'ai_ambient_copilot',
      { event: 'typing', chars: 10 },
      { mode: 'approve', initiatedBy: 'platform' }
    );
    expect(result.status).toBe('executed');
  });

  test('opt-in approval alone does not activate a passive feature', async () => {
    respondApprove();
    const result = await gate.invokeFeature(
      'ai_ambient_copilot',
      { event: 'typing', chars: 10 },
      { mode: 'approve', initiatedBy: 'platform' }
    );
    // A1 was satisfied through the prompt, but A2 still blocks.
    expect(result.status).toBe('blocked');
    expect(result.subtype).toBe('A2');
    expect(manifest.isEnabled('ai_ambient_copilot')).toBe(true);
  });

  test('a platform-initiated call to an on-demand feature counts as passive', async () => {
    manifest.enable('ai_summarize');
    const result = await gate.invokeFeature(
      'ai_summarize',
      { filename: 'a.md' },
      { mode: 'approve', initiatedBy: 'platform' }
    );
    expect(result.status).toBe('blocked');
    expect(result.subtype).toBe('A2');
  });

  test('GPC blocks passive activation even when ambient mode was on', async () => {
    manifest.enable('ai_ambient_copilot');
    manifest.setAmbient(true);
    const result = await gate.invokeFeature(
      'ai_ambient_copilot',
      { event: 'typing', chars: 10 },
      { mode: 'approve', gpc: true, initiatedBy: 'platform' }
    );
    expect(result.status).toBe('blocked');
    expect(result.subtype).toBe('A2');
    expect(result.reason).toBe('gpc_ambient_optout');
  });
});

describe('A1 and A2 are independent', () => {
  test('waiving A1 (feature enabled) still leaves A2 asserted (ambient off)', async () => {
    manifest.enable('ai_ambient_copilot');
    const result = await gate.invokeFeature(
      'ai_ambient_copilot',
      { event: 'typing', chars: 10 },
      { mode: 'approve', initiatedBy: 'platform' }
    );
    expect(result.status).toBe('blocked');
    expect(result.subtype).toBe('A2');
  });

  test('ambient mode on (A2 waived) does not bypass the A1 opt-in', async () => {
    manifest.setAmbient(true);
    respondDecline();
    const result = await gate.invokeFeature(
      'ai_ambient_copilot',
      { event: 'typing', chars: 10 },
      { mode: 'decline', initiatedBy: 'platform' }
    );
    expect(result.status).toBe('blocked');
    expect(result.subtype).toBe('A1');
  });

  test('user-initiated on-demand AI needs no ambient flag once enabled', async () => {
    manifest.enable('ai_summarize');
    const result = await gate.invokeFeature(
      'ai_summarize',
      { filename: 'a.md' },
      { mode: 'approve', initiatedBy: 'user' }
    );
    expect(result.status).toBe('executed');
  });
});

describe('unknown features', () => {
  test('invoking an unknown feature throws', async () => {
    await expect(gate.invokeFeature('nope', {}, { mode: 'approve' })).rejects.toThrow('Unknown feature: nope');
  });
});
