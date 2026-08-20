/**
 * Integration tests for orchestrator.js: the six-action trip run in the
 * silent baseline and every enforced configuration.
 */

const orchestrator = require('../orchestrator');
const { closeClient } = require('../mcp_client');

// Executed actions cross real MCP, which spawns mcp-server/server.js as a
// child process. Close it so jest exits cleanly.
afterAll(async () => {
  await closeClient();
});

function byAction(run, name) {
  return run.results.find(r => r.action === name);
}

describe('silent baseline', () => {
  let run;
  beforeEach(async () => {
    run = await orchestrator.run({ silent: true });
  });

  test('all six actions execute', () => {
    expect(run.tally.executed).toBe(6);
  });

  test('four E1 violations are recorded', () => {
    expect(run.violations).toEqual([
      'book_flight',
      'share_passport',
      'price_alerts_tracking',
      'newsletter_signup',
    ]);
  });
});

describe('enforced, attended, user approves', () => {
  let run;
  beforeEach(async () => {
    run = await orchestrator.run({});
  });

  test('user-granted actions run without being surfaced', () => {
    expect(byAction(run, 'search_flights').status).toBe('executed');
    expect(byAction(run, 'hold_reservation').status).toBe('executed');
  });

  test('high-stakes actions are surfaced first, then approved', () => {
    expect(byAction(run, 'book_flight').status).toBe('executed_after_approval');
    expect(byAction(run, 'share_passport').status).toBe('executed_after_approval');
  });

  test('the vendor default covers the user-silent tracking action', () => {
    const r = byAction(run, 'price_alerts_tracking');
    expect(r.status).toBe('executed');
    expect(r.tier_source).toBe('vendor_default');
  });

  test('the untiered newsletter is surfaced through the restrictive default', () => {
    const r = byAction(run, 'newsletter_signup');
    expect(r.tier_source).toBe('unassigned_default_restrictive');
    expect(r.surfaced).toBe(true);
  });

  test('no violations in enforced mode', () => {
    expect(run.violations).toEqual([]);
  });
});

describe('enforced, unattended', () => {
  let run;
  beforeEach(async () => {
    run = await orchestrator.run({ userPresent: false });
  });

  test('autonomous grants still run', () => {
    expect(byAction(run, 'search_flights').status).toBe('executed');
    expect(byAction(run, 'hold_reservation').status).toBe('executed');
    expect(byAction(run, 'price_alerts_tracking').status).toBe('executed');
  });

  test('surfaced decisions decline rather than proceed', () => {
    expect(byAction(run, 'book_flight').status).toBe('declined');
    expect(byAction(run, 'share_passport').status).toBe('declined');
    expect(byAction(run, 'newsletter_signup').status).toBe('declined');
    expect(byAction(run, 'book_flight').reason).toBe('default_restrictive_no_user');
  });
});

describe('enforced, GPC active', () => {
  test('the vendor-defaulted tracking action now surfaces', async () => {
    const run = await orchestrator.run({ gpc: true });
    const r = run.results.find(x => x.action === 'price_alerts_tracking');
    expect(r.tier_source).toBe('gpc_voided_vendor_default');
    expect(r.surfaced).toBe(true);
  });

  test('GPC plus unattended is the strictest: only user grants run', async () => {
    const run = await orchestrator.run({ gpc: true, userPresent: false });
    const executed = run.results.filter(r => r.status === 'executed').map(r => r.action);
    expect(executed).toEqual(['search_flights', 'hold_reservation']);
    expect(run.tally.declined).toBe(4);
  });
});

describe('enforced, attended, user declines', () => {
  test('surfaced decisions follow the decline', async () => {
    const run = await orchestrator.run({ respond: 'decline' });
    expect(byAction(run, 'book_flight').status).toBe('declined_by_user');
    expect(byAction(run, 'search_flights').status).toBe('executed');
  });
});
