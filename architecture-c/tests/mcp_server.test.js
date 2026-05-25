/**
 * Unit tests for mcp_server.js — the withConsentCheck() interceptor.
 *
 * Covers:
 *  - Silent mode bypasses all consent checks
 *  - Previously approved categories execute without a consent prompt
 *  - Previously declined categories are hard-blocked with no prompt
 *  - New v2.0 tools fire a consent_request event and pause execution
 *  - Approval resumes the tool call with consent_required=true
 *  - Decline returns a quarantined status with category metadata
 *  - GPC signal auto-declines non-primary categories without prompting
 *  - GPC signal does not affect primary categories (file_access, external_api)
 *  - Unknown tool names throw
 */

const server = require('../mcp_server');
const manifest = require('../consent_manifest');
const bus = require('../event_bus');

beforeEach(() => {
  manifest.reset();
  bus.removeAllListeners();
});

describe('silent mode — no consent enforcement', () => {
  test('email_sender executes immediately with no consent_required flag', async () => {
    const result = await server.invokeTool(
      'email_sender',
      { to: 'a@b.com', subject: 'Hi', body: 'test' },
      'silent'
    );
    expect(result.status).toBe('executed');
    expect(result.consent_required).toBeUndefined();
  });

  test('behavior_tracker executes immediately in silent mode', async () => {
    const result = await server.invokeTool(
      'behavior_tracker',
      { event_type: 'test', metadata: {} },
      'silent'
    );
    expect(result.status).toBe('executed');
  });

  test('no consent_request event is emitted in silent mode', async () => {
    const listener = jest.fn();
    bus.on('consent_request', listener);
    await server.invokeTool('email_sender', { to: 'a@b.com', subject: 'Hi', body: '' }, 'silent');
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('approved category — no prompt needed', () => {
  test('file_read executes without firing a consent prompt', async () => {
    const listener = jest.fn();
    bus.on('consent_request', listener);
    const result = await server.invokeTool('file_read', { filename: 'test.txt' }, 'approve');
    expect(result.status).toBe('executed');
    expect(listener).not.toHaveBeenCalled();
  });

  test('web_search executes without consent_required flag', async () => {
    const result = await server.invokeTool('web_search', { query: 'test' }, 'approve');
    expect(result.status).toBe('executed');
    expect(result.consent_required).toBeUndefined();
  });
});

describe('previously declined — hard block', () => {
  test('blocked tool returns status=blocked and reason=previously_declined', async () => {
    manifest.decline('communication');
    const result = await server.invokeTool('email_sender', {}, 'approve');
    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('previously_declined');
  });

  test('hard block does not fire a consent_request event', async () => {
    manifest.decline('communication');
    const listener = jest.fn();
    bus.on('consent_request', listener);
    await server.invokeTool('email_sender', {}, 'approve');
    expect(listener).not.toHaveBeenCalled();
  });

  test('blocked result includes the category that was declined', async () => {
    manifest.decline('analytics');
    const result = await server.invokeTool('behavior_tracker', {}, 'approve');
    expect(result.category).toBe('analytics');
  });
});

describe('quarantine — new v2.0 tool, requires fresh consent', () => {
  test('fires a consent_request event for email_sender', async () => {
    const events = [];
    bus.on('consent_request', ({ tool, resolve }) => {
      events.push(tool.name);
      resolve({ approved: true, promptText: '' });
    });
    await server.invokeTool('email_sender', { to: 'a@b.com', subject: 'Hi', body: '' }, 'approve');
    expect(events).toContain('email_sender');
  });

  test('fires a consent_request event for behavior_tracker', async () => {
    const events = [];
    bus.on('consent_request', ({ tool, resolve }) => {
      events.push(tool.name);
      resolve({ approved: true, promptText: '' });
    });
    await server.invokeTool('behavior_tracker', { event_type: 'test', metadata: {} }, 'approve');
    expect(events).toContain('behavior_tracker');
  });

  test('after approval the tool executes with status=executed', async () => {
    bus.on('consent_request', ({ resolve }) => resolve({ approved: true, promptText: '' }));
    const result = await server.invokeTool(
      'email_sender',
      { to: 'a@b.com', subject: 'Hi', body: '' },
      'approve'
    );
    expect(result.status).toBe('executed');
  });

  test('after approval the result carries consent_required=true', async () => {
    bus.on('consent_request', ({ resolve }) => resolve({ approved: true, promptText: 'prompt' }));
    const result = await server.invokeTool(
      'email_sender',
      { to: 'a@b.com', subject: 'Hi', body: '' },
      'approve'
    );
    expect(result.consent_required).toBe(true);
  });

  test('after approval the prompt_text is included in the result', async () => {
    bus.on('consent_request', ({ resolve }) => resolve({ approved: true, promptText: 'sample prompt' }));
    const result = await server.invokeTool(
      'email_sender',
      { to: 'a@b.com', subject: 'Hi', body: '' },
      'approve'
    );
    expect(result.prompt_text).toBe('sample prompt');
  });

  test('after decline the tool returns status=quarantined', async () => {
    bus.on('consent_request', ({ tool, resolve }) => {
      manifest.decline(tool.capability_category);
      resolve({ approved: false, promptText: '' });
    });
    const result = await server.invokeTool('email_sender', {}, 'decline');
    expect(result.status).toBe('quarantined');
    expect(result.reason).toBe('user_declined');
  });

  test('after decline the result includes the category', async () => {
    bus.on('consent_request', ({ tool, resolve }) => {
      manifest.decline(tool.capability_category);
      resolve({ approved: false, promptText: '' });
    });
    const result = await server.invokeTool('email_sender', {}, 'decline');
    expect(result.category).toBe('communication');
  });
});

describe('GPC signal — auto-decline non-primary categories', () => {
  test('email_sender is blocked with reason=gpc_auto_decline when gpc=true', async () => {
    const result = await server.invokeTool(
      'email_sender',
      { to: 'a@b.com', subject: 'Hi', body: '' },
      'approve',
      true
    );
    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('gpc_auto_decline');
  });

  test('behavior_tracker is blocked with reason=gpc_auto_decline when gpc=true', async () => {
    const result = await server.invokeTool(
      'behavior_tracker',
      { event_type: 'test', metadata: {} },
      'approve',
      true
    );
    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('gpc_auto_decline');
  });

  test('GPC auto-decline does not fire a consent_request event', async () => {
    const listener = jest.fn();
    bus.on('consent_request', listener);
    await server.invokeTool('email_sender', {}, 'approve', true);
    expect(listener).not.toHaveBeenCalled();
  });

  test('GPC auto-decline writes the category to declined_categories in the manifest', async () => {
    await server.invokeTool('email_sender', {}, 'approve', true);
    const mf = manifest.load();
    expect(mf.declined_categories).toContain('communication');
  });

  test('file_read executes normally when gpc=true — primary category is unaffected', async () => {
    const result = await server.invokeTool('file_read', { filename: 'test.txt' }, 'approve', true);
    expect(result.status).toBe('executed');
  });

  test('web_search executes normally when gpc=true — primary category is unaffected', async () => {
    const result = await server.invokeTool('web_search', { query: 'test' }, 'approve', true);
    expect(result.status).toBe('executed');
  });

  test('GPC result includes the blocked category', async () => {
    const result = await server.invokeTool('email_sender', {}, 'approve', true);
    expect(result.category).toBe('communication');
  });
});

describe('unknown tool', () => {
  test('throws for an unrecognised tool name', async () => {
    await expect(
      server.invokeTool('totally_fake_tool', {}, 'approve')
    ).rejects.toThrow('Unknown tool');
  });
});
