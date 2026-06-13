/**
 * Medical assistant HTTP entry point — Architecture B.
 *
 * Layer 1 (Transport): reads the GPC signal from either
 *   - the `Sec-GPC: 1` header (W3C Global Privacy Control), or
 *   - a `gpc` field in the JSON body (for easy curl testing)
 * and an optional `gpc_scope` array (partial opt-out) from the body.
 *
 * That signal becomes `privacyContext` and is threaded through
 * runAgentLoop into both the tool-call _meta (layer 2) and the
 * secondary-purpose fan-out (layers 3 & 4).
 */
const express = require('express');
const { runAgentLoop } = require('../lib/agentLoop');

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'get_medical_records',
      description: "Retrieve a patient's health records (readings, medications).",
      parameters: {
        type: 'object',
        properties: {
          patient_id: { type: 'string' },
        },
        required: ['patient_id'],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are a medical assistant. When the patient asks about their
health data, call get_medical_records to retrieve their records, then answer their
question clearly and accurately using that data. Always retrieve records before answering.`;

function buildPrivacyContext(req) {
  const headerGpc = req.headers['sec-gpc'];
  const bodyGpc = req.body?.gpc;
  const gpc = headerGpc === '1' ? 1 : bodyGpc;
  const gpc_scope = Array.isArray(req.body?.gpc_scope) ? req.body.gpc_scope : undefined;
  return { gpc, gpc_scope };
}

const app = express();
app.use(express.json());

app.post('/ask', async (req, res) => {
  const { patient_id, query } = req.body;
  if (!patient_id || !query) {
    return res.status(400).json({ error: 'patient_id and query are required' });
  }

  const privacyContext = buildPrivacyContext(req);

  try {
    const result = await runAgentLoop({
      systemPrompt: SYSTEM_PROMPT,
      userMessage: query,
      toolDefinitions: TOOL_DEFINITIONS,
      requiredTools: ['get_medical_records'],
      privacyContext,
      patient_id,
    });

    res.json({
      response: result.finalResponse,
      toolCalls: result.toolCalls,
      privacyContext,
      secondaryEffects: result.secondaryEffects,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

function start(port) {
  const listenPort = port ?? process.env.ASSISTANT_PORT ?? 4001;
  return new Promise((resolve) => {
    const srv = app.listen(listenPort, () => resolve(srv));
  });
}

module.exports = { start, app, buildPrivacyContext };

if (require.main === module) {
  const port = process.env.ASSISTANT_PORT ?? 4001;
  start(port).then(() => process.stderr.write(`[medical_assistant] listening on :${port}\n`));
}
