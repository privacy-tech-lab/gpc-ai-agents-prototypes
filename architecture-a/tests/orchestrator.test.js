/**
 * Integration tests for the Orchestrator (Layers 1 + 2).
 *
 * These tests spin up the third-party storage HTTP server and run the full
 * orchestrator pipeline.  They verify the observable contract of each layer
 * rather than mocking internals.
 */

// Set port BEFORE any module is required so the constant is captured correctly
process.env.THIRD_PARTY_PORT = '4099';

const thirdParty = require('../agents/third_party_storage.js');
const { handleRequest } = require('../orchestrator/orchestrator.js');
const { encodeBaggage } = require('../orchestrator/baggage.js');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'output', 'interaction_log.jsonl');
const PROFILE_FILE = path.join(__dirname, '..', 'output', 'profiles.json');
const VECTOR_FILE = path.join(__dirname, '..', 'output', 'vector_store.json');

let server;

beforeAll(async () => {
  server = await thirdParty.start(4099);
  // Clear persistent state before the suite
  [LOG_FILE, PROFILE_FILE, VECTOR_FILE].forEach((f) => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
});

afterAll(() => server?.close());

describe('Layer 1 — W3C Baggage propagation', () => {
  test('gpc=0 in Baggage → gpc_active is false', async () => {
    const result = await handleRequest({
      query: 'test query',
      user_id: 'test-user',
      baggageHeader: encodeBaggage({ gpc: '0' }),
    });
    expect(result.gpc_active).toBe(false);
  });

  test('gpc=1 in Baggage → gpc_active is true', async () => {
    const result = await handleRequest({
      query: 'test query',
      user_id: 'test-user',
      baggageHeader: encodeBaggage({ gpc: '1' }),
    });
    expect(result.gpc_active).toBe(true);
  });

  test('absent Baggage header → gpc_active is false', async () => {
    const result = await handleRequest({
      query: 'test query',
      user_id: 'test-user',
    });
    expect(result.gpc_active).toBe(false);
  });
});

describe('Layer 2 — MCP _meta envelope', () => {
  test('meta_envelope carries gpc=0 when GPC is off', async () => {
    const result = await handleRequest({
      query: 'test',
      user_id: 'u1',
      baggageHeader: encodeBaggage({ gpc: '0' }),
    });
    expect(result.meta_envelope.gpc).toBe(0);
  });

  test('meta_envelope carries gpc=1 when GPC is on', async () => {
    const result = await handleRequest({
      query: 'test',
      user_id: 'u1',
      baggageHeader: encodeBaggage({ gpc: '1' }),
    });
    expect(result.meta_envelope.gpc).toBe(1);
  });
});

describe('Layer 4 — MCP tool enforcement', () => {
  test('baseline: all tools return status=ok', async () => {
    const result = await handleRequest({
      query: 'baseline test',
      user_id: 'u-baseline',
      baggageHeader: encodeBaggage({ gpc: '0' }),
    });

    expect(result.data.profile_lookup.status).toBe('ok');
    expect(result.data.log_interaction.status).toBe('ok');
    expect(result.data.save_to_profile.status).toBe('ok');
    expect(result.search.search.status).toBe('ok');
  });

  test('GPC run: sensitive MCP tools are blocked', async () => {
    const result = await handleRequest({
      query: 'gpc test',
      user_id: 'u-gpc',
      baggageHeader: encodeBaggage({ gpc: '1' }),
    });

    expect(result.data.profile_lookup.status).toBe('blocked');
    expect(result.data.log_interaction.status).toBe('blocked');
    expect(result.data.save_to_profile.status).toBe('blocked');
  });

  test('GPC run: search_web still executes', async () => {
    const result = await handleRequest({
      query: 'search still works',
      user_id: 'u-gpc',
      baggageHeader: encodeBaggage({ gpc: '1' }),
    });
    expect(result.search.search.status).toBe('ok');
  });
});

describe('Layer 3 — JWT trust boundary', () => {
  test('baseline: third-party store writes succeed', async () => {
    const result = await handleRequest({
      query: 'store test',
      user_id: 'u-store',
      baggageHeader: encodeBaggage({ gpc: '0' }),
    });
    expect(result.data.third_party_store.status).toBe('ok');
  });

  test('GPC run: third-party store is blocked via JWT claim', async () => {
    const result = await handleRequest({
      query: 'store blocked test',
      user_id: 'u-store-gpc',
      baggageHeader: encodeBaggage({ gpc: '1' }),
    });
    expect(result.data.third_party_store.status).toBe('blocked');
    expect(result.data.third_party_store.layer).toBe('trust_boundary_jwt');
  });
});

describe('Signal-drop experiment', () => {
  test('with dropSignal=true, MCP tools execute despite gpc=1', async () => {
    const result = await handleRequest({
      query: 'drop test',
      user_id: 'u-drop',
      baggageHeader: encodeBaggage({ gpc: '1' }),
      dropSignal: true,
    });

    // Layer 4 fails — MCP tools run
    expect(result.data.profile_lookup.status).toBe('ok');
    expect(result.data.log_interaction.status).toBe('ok');
    expect(result.data.save_to_profile.status).toBe('ok');
  });

  test('with dropSignal=true, JWT still blocks third-party store', async () => {
    const result = await handleRequest({
      query: 'drop test jwt',
      user_id: 'u-drop',
      baggageHeader: encodeBaggage({ gpc: '1' }),
      dropSignal: true,
    });

    // Layer 3 holds — JWT is issued by orchestrator before agents run
    expect(result.data.third_party_store.status).toBe('blocked');
  });
});

describe('Timing instrumentation', () => {
  test('timing array is populated for all tool calls', async () => {
    const timing = [];
    await handleRequest({
      query: 'timing test',
      user_id: 'u-timing',
      baggageHeader: encodeBaggage({ gpc: '0' }),
      timing,
    });
    expect(timing.length).toBeGreaterThanOrEqual(4);
    timing.forEach((t) => {
      expect(typeof t.durationMs).toBe('number');
      expect(typeof t.tool).toBe('string');
      expect(typeof t.status).toBe('string');
    });
  });
});
