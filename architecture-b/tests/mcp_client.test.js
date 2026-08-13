/**
 * Integration test for the real MCP client/server round trip that
 * medical_agent.js now depends on for get_medical_records.
 *
 * This is the piece that changed: the tool used to be called in-process;
 * now it's served by mcp-server/server.js (a real @modelcontextprotocol/sdk
 * Server) over stdio and reached through orchestrator/mcp_client.js (a real
 * Client). No Ollama needed — this only exercises the transport, not the
 * LLM's tool-selection behavior, consistent with the rest of this test
 * suite's "no model required" philosophy.
 */

const { callTool, closeClient } = require('../orchestrator/mcp_client.js');

afterAll(async () => {
  await closeClient();
});

describe('get_medical_records over real MCP', () => {
  test('returns the patient record for a known patient_id', async () => {
    const result = await callTool('get_medical_records', { patient_id: 'patient-001' });
    expect(result.patient_id).toBe('patient-001');
    expect(result.readings.length).toBeGreaterThan(0);
    expect(result.medications.length).toBeGreaterThan(0);
  });

  test('returns not_found for an unknown patient_id', async () => {
    const result = await callTool('get_medical_records', { patient_id: 'nonexistent' });
    expect(result.error).toBe('not_found');
  });
});
