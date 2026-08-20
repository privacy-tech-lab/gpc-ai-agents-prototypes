/**
 * Unit tests for delegation_manifest.js and delegation_gate.js, the
 * Category E enforcement seam.
 *
 * Covers:
 *  - effectiveTier precedence: user assignment beats vendor proposal; the
 *    vendor proposal applies where the user is silent; GPC voids vendor
 *    proposals; unassigned actions fall to the restrictive default
 *  - requestAction: autonomous grants execute over real MCP; ask_user tiers
 *    surface and follow the user's answer; without a user available they
 *    decline before anything reaches the wire
 *  - silent baseline: everything executes, and actions without an explicit
 *    user autonomous grant are annotated as E1 violations
 */

const manifest = require('../delegation_manifest');
const gate = require('../delegation_gate');
const fixture = require('../trip_fixture');
const { closeClient } = require('../mcp_client');

// Executed actions cross real MCP, which spawns mcp-server/server.js as a
// child process. Close it so jest exits cleanly.
afterAll(async () => {
  await closeClient();
});

function actionDef(name) {
  return fixture.getActions().find(a => a.action === name);
}

describe('effectiveTier precedence', () => {
  test('user assignment beats the vendor proposal', () => {
    // Vendor proposes autonomous booking; the user said ask first.
    expect(manifest.VENDOR_PROPOSAL.book_flight).toBe('autonomous');
    expect(manifest.effectiveTier('book_flight')).toEqual({
      tier: 'ask_user',
      source: 'user_assignment',
    });
  });

  test('the vendor proposal applies where the user is silent', () => {
    expect(manifest.effectiveTier('price_alerts_tracking')).toEqual({
      tier: 'autonomous',
      source: 'vendor_default',
    });
  });

  test('GPC voids vendor proposals for user-silent actions', () => {
    expect(manifest.effectiveTier('price_alerts_tracking', { gpc: true })).toEqual({
      tier: 'ask_user',
      source: 'gpc_voided_vendor_default',
    });
  });

  test('GPC does not touch explicit user assignments', () => {
    expect(manifest.effectiveTier('search_flights', { gpc: true })).toEqual({
      tier: 'autonomous',
      source: 'user_assignment',
    });
  });

  test('an action nobody tiered falls to the restrictive default', () => {
    expect(manifest.effectiveTier('newsletter_signup')).toEqual({
      tier: 'ask_user',
      source: 'unassigned_default_restrictive',
    });
  });
});

describe('requestAction: enforced modes', () => {
  const enforced = { mode: 'enforced' };

  test('a user-granted autonomous action executes over MCP', async () => {
    const r = await gate.requestAction(actionDef('search_flights'), enforced);
    expect(r.status).toBe('executed');
    expect(r.tier_source).toBe('user_assignment');
    expect(r.result).toContain('[simulated]');
  });

  test('an ask_user action is surfaced and follows an approval', async () => {
    const r = await gate.requestAction(actionDef('book_flight'), { ...enforced, respond: 'approve' });
    expect(r.status).toBe('executed_after_approval');
    expect(r.surfaced).toBe(true);
  });

  test('an ask_user action follows a decline, and nothing reaches the wire', async () => {
    const r = await gate.requestAction(actionDef('share_passport'), { ...enforced, respond: 'decline' });
    expect(r.status).toBe('declined_by_user');
    expect(r.result).toBeUndefined();
  });

  test('with nobody available, a surfaced decision declines rather than proceeds', async () => {
    const r = await gate.requestAction(actionDef('book_flight'), { ...enforced, userPresent: false });
    expect(r.status).toBe('declined');
    expect(r.reason).toBe('default_restrictive_no_user');
    expect(r.result).toBeUndefined();
  });

  test('unattended does not touch autonomous grants', async () => {
    const r = await gate.requestAction(actionDef('hold_reservation'), { ...enforced, userPresent: false });
    expect(r.status).toBe('executed');
  });

  test('under GPC a vendor-defaulted action surfaces instead of executing', async () => {
    const r = await gate.requestAction(actionDef('price_alerts_tracking'), { ...enforced, gpc: true });
    expect(r.status).toBe('executed_after_approval');
    expect(r.tier_source).toBe('gpc_voided_vendor_default');
  });
});

describe('requestAction: silent baseline', () => {
  test('everything executes', async () => {
    for (const a of fixture.getActions()) {
      const r = await gate.requestAction(a, { mode: 'silent' });
      expect(r.status).toBe('executed');
    }
  });

  test('actions without a user autonomous grant carry an E1 violation', async () => {
    const violating = [];
    for (const a of fixture.getActions()) {
      const r = await gate.requestAction(a, { mode: 'silent' });
      if (r.violations.length > 0) violating.push(r.action);
    }
    expect(violating).toEqual([
      'book_flight',
      'share_passport',
      'price_alerts_tracking',
      'newsletter_signup',
    ]);
  });

  test('user-granted actions carry no violation', async () => {
    const r = await gate.requestAction(actionDef('search_flights'), { mode: 'silent' });
    expect(r.violations).toEqual([]);
  });
});
