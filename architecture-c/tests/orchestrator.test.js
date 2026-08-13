/**
 * Integration tests for orchestrator.js
 *
 * Covers:
 *  - v1.0 run: only v1.0 tools are called, all execute, no quarantine events
 *  - v2.0 silent: all 4 tools execute immediately, no quarantine events
 *  - v2.0 approve: new tools execute with consent_required=true, v1.0 tools are unaffected
 *  - v2.0 decline: new tools are quarantined, quarantine events recorded, manifest updated
 *  - v2.0 GPC: non-primary categories auto-blocked by signal, primary categories unaffected
 *  - A2 persistence: a declined tool is hard-blocked in a subsequent invocation
 */

const orchestrator = require('../orchestrator');
const manifest = require('../consent_manifest');
const bus = require('../event_bus');
const server = require('../consent_gate');
const { closeClient } = require('../mcp_client');

beforeEach(() => {
  manifest.reset();
  bus.removeAllListeners();
});

// Allowed tool calls spawn a real MCP child process (mcp-server/server.js);
// close it so Jest can exit cleanly.
afterAll(async () => {
  await closeClient();
});

describe('v1.0 run — baseline', () => {
  test('does not invoke email_sender or behavior_tracker', async () => {
    const { results } = await orchestrator.run('v1.0', null);
    const names = results.map(r => r.tool);
    expect(names).not.toContain('email_sender');
    expect(names).not.toContain('behavior_tracker');
  });

  test('all invoked tools execute successfully', async () => {
    const { results } = await orchestrator.run('v1.0', null);
    for (const r of results) {
      expect(r.status).toBe('executed');
    }
  });

  test('produces no quarantine events', async () => {
    const { quarantineEvents } = await orchestrator.run('v1.0', null);
    expect(quarantineEvents).toHaveLength(0);
  });

  test('manifest is unchanged after a v1.0 run', async () => {
    await orchestrator.run('v1.0', null);
    const mf = manifest.load();
    expect(mf.manifest_version).toBe('v1.0');
    expect(mf.approved_categories).toHaveLength(2);
    expect(mf.declined_categories).toHaveLength(0);
  });
});

describe('v2.0 — silent mode (failure case)', () => {
  test('runs all 4 tools in the sequence', async () => {
    const { results } = await orchestrator.run('v2.0', 'silent');
    expect(results).toHaveLength(4);
  });

  test('all tools have status=executed', async () => {
    const { results } = await orchestrator.run('v2.0', 'silent');
    for (const r of results) {
      expect(r.status).toBe('executed');
    }
  });

  test('email_sender executes without a consent_required flag', async () => {
    const { results } = await orchestrator.run('v2.0', 'silent');
    const r = results.find(r => r.tool === 'email_sender');
    expect(r.status).toBe('executed');
    expect(r.consent_required).toBeUndefined();
  });

  test('behavior_tracker executes without a consent_required flag', async () => {
    const { results } = await orchestrator.run('v2.0', 'silent');
    const r = results.find(r => r.tool === 'behavior_tracker');
    expect(r.status).toBe('executed');
    expect(r.consent_required).toBeUndefined();
  });

  test('produces no quarantine events', async () => {
    const { quarantineEvents } = await orchestrator.run('v2.0', 'silent');
    expect(quarantineEvents).toHaveLength(0);
  });

  test('manifest remains at v1.0 — silent mode never updates it', async () => {
    await orchestrator.run('v2.0', 'silent');
    const mf = manifest.load();
    expect(mf.manifest_version).toBe('v1.0');
    expect(mf.approved_categories).not.toContain('communication');
  });
});

describe('v2.0 — approve mode', () => {
  beforeEach(() => {
    bus.on('consent_request', ({ tool, resolve }) => {
      manifest.approve(tool.capability_category);
      resolve({ approved: true, promptText: 'test prompt' });
    });
  });

  test('email_sender executes with consent_required=true', async () => {
    const { results } = await orchestrator.run('v2.0', 'approve');
    const r = results.find(r => r.tool === 'email_sender');
    expect(r.status).toBe('executed');
    expect(r.consent_required).toBe(true);
  });

  test('behavior_tracker executes with consent_required=true', async () => {
    const { results } = await orchestrator.run('v2.0', 'approve');
    const r = results.find(r => r.tool === 'behavior_tracker');
    expect(r.status).toBe('executed');
    expect(r.consent_required).toBe(true);
  });

  test('v1.0 tools do not have a consent_required flag', async () => {
    const { results } = await orchestrator.run('v2.0', 'approve');
    const fileResult = results.find(r => r.tool === 'file_read');
    expect(fileResult.consent_required).toBeUndefined();
  });

  test('produces no quarantine events when user approves', async () => {
    const { quarantineEvents } = await orchestrator.run('v2.0', 'approve');
    expect(quarantineEvents).toHaveLength(0);
  });

  test('approved categories are written to the manifest', async () => {
    await orchestrator.run('v2.0', 'approve');
    const mf = manifest.load();
    expect(mf.approved_categories).toContain('communication');
    expect(mf.approved_categories).toContain('analytics');
  });
});

describe('v2.0 — decline mode', () => {
  beforeEach(() => {
    bus.on('consent_request', ({ tool, resolve }) => {
      manifest.decline(tool.capability_category);
      resolve({ approved: false, promptText: 'test prompt' });
    });
  });

  test('email_sender is quarantined', async () => {
    const { results } = await orchestrator.run('v2.0', 'decline');
    const r = results.find(r => r.tool === 'email_sender');
    expect(r.status).toBe('quarantined');
  });

  test('behavior_tracker is quarantined', async () => {
    const { results } = await orchestrator.run('v2.0', 'decline');
    const r = results.find(r => r.tool === 'behavior_tracker');
    expect(r.status).toBe('quarantined');
  });

  test('produces exactly 2 quarantine events', async () => {
    const { quarantineEvents } = await orchestrator.run('v2.0', 'decline');
    expect(quarantineEvents).toHaveLength(2);
  });

  test('quarantine events carry the correct categories', async () => {
    const { quarantineEvents } = await orchestrator.run('v2.0', 'decline');
    const categories = quarantineEvents.map(e => e.category);
    expect(categories).toContain('communication');
    expect(categories).toContain('analytics');
  });

  test('declined categories are written to the manifest', async () => {
    await orchestrator.run('v2.0', 'decline');
    const mf = manifest.load();
    expect(mf.declined_categories).toContain('communication');
    expect(mf.declined_categories).toContain('analytics');
  });

  test('v1.0 tools still execute even when new tools are declined', async () => {
    const { results } = await orchestrator.run('v2.0', 'decline');
    const fileResult = results.find(r => r.tool === 'file_read');
    const searchResult = results.find(r => r.tool === 'web_search');
    expect(fileResult.status).toBe('executed');
    expect(searchResult.status).toBe('executed');
  });
});

describe('v2.0 — GPC mode (signal auto-declines non-primary categories)', () => {
  test('email_sender is blocked with reason=gpc_auto_decline', async () => {
    const { results } = await orchestrator.run('v2.0', 'approve', true);
    const r = results.find(r => r.tool === 'email_sender');
    expect(r.status).toBe('blocked');
    expect(r.reason).toBe('gpc_auto_decline');
  });

  test('behavior_tracker is blocked with reason=gpc_auto_decline', async () => {
    const { results } = await orchestrator.run('v2.0', 'approve', true);
    const r = results.find(r => r.tool === 'behavior_tracker');
    expect(r.status).toBe('blocked');
    expect(r.reason).toBe('gpc_auto_decline');
  });

  test('no consent_request events fire — GPC bypasses the prompt', async () => {
    const listener = jest.fn();
    bus.on('consent_request', listener);
    await orchestrator.run('v2.0', 'approve', true);
    expect(listener).not.toHaveBeenCalled();
  });

  test('primary category tools still execute normally with GPC on', async () => {
    const { results } = await orchestrator.run('v2.0', 'approve', true);
    const fileResult = results.find(r => r.tool === 'file_read');
    const searchResult = results.find(r => r.tool === 'web_search');
    expect(fileResult.status).toBe('executed');
    expect(searchResult.status).toBe('executed');
  });

  test('GPC auto-decline writes non-primary categories to declined_categories', async () => {
    await orchestrator.run('v2.0', 'approve', true);
    const mf = manifest.load();
    expect(mf.declined_categories).toContain('communication');
    expect(mf.declined_categories).toContain('analytics');
  });

  test('GPC-blocked tools appear in quarantine_events', async () => {
    const { quarantineEvents } = await orchestrator.run('v2.0', 'approve', true);
    expect(quarantineEvents).toHaveLength(2);
    const reasons = quarantineEvents.map(e => e.reason);
    expect(reasons.every(r => r === 'gpc_auto_decline')).toBe(true);
  });
});

describe('A2 — persistence across sessions', () => {
  test('a declined tool is hard-blocked in a subsequent invocation with no prompt', async () => {
    // Session 1: decline the communication category
    bus.on('consent_request', ({ tool, resolve }) => {
      manifest.decline(tool.capability_category);
      resolve({ approved: false, promptText: '' });
    });
    await orchestrator.run('v2.0', 'decline');
    bus.removeAllListeners();

    // Session 2: simulate a new session — consent prompt should not fire
    const listener = jest.fn();
    bus.on('consent_request', listener);

    const result = await server.invokeTool('email_sender', {}, 'decline');

    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('previously_declined');
    expect(listener).not.toHaveBeenCalled();
  });

  test('a declined category stays blocked even when a different category is approved', async () => {
    manifest.decline('communication');
    manifest.approve('analytics');

    const result = await server.invokeTool('email_sender', {}, 'approve');
    expect(result.status).toBe('blocked');
  });
});
