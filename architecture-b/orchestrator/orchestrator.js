/**
 * Entry point: reads Sec-GPC/body gpc, builds privacyContext, dispatches agent,
 * then fans out to secondary pipelines.
 */
const express = require('express');
const medicalAgent = require('../agents/medical_agent.js');
const { logInteraction } = require('../services/analytics.js');
const { addTrainingExample } = require('../services/trainingDataset.js');

const AD_PLATFORM_URL = process.env.AD_PLATFORM_URL ?? 'http://localhost:4002/target';

function buildPrivacyContext(req) {
  const headerGpc = req.headers['sec-gpc'];
  const bodyGpc   = req.body?.gpc;
  const gpc       = headerGpc === '1' ? 1 : bodyGpc;
  const gpc_scope = Array.isArray(req.body?.gpc_scope) ? req.body.gpc_scope : undefined;
  return { gpc, gpc_scope };
}

async function fanOutSecondaryPurposes({ privacyContext, patient_id, query, response }) {
  const [analyticsResult, trainingResult, adResult] = await Promise.all([
    logInteraction({ patient_id, query }, privacyContext),

    addTrainingExample({ patient_id, query, response }, privacyContext),

    fetch(AD_PLATFORM_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        patient_id,
        query,
        purpose:   'ad_targeting',
        gpc:       privacyContext.gpc,
        gpc_scope: privacyContext.gpc_scope,
      }),
    })
      .then((r) => r.json())
      .catch((err) => ({ status: 'error', layer: 'ad_platform_storage', error: String(err) })),
  ]);

  return {
    analytics:     analyticsResult,
    model_training: trainingResult,
    ad_targeting:  adResult,
  };
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
    const { finalResponse, toolCalls } = await medicalAgent.run({ query, patient_id, privacyContext });
    const secondaryEffects = await fanOutSecondaryPurposes({
      privacyContext,
      patient_id,
      query,
      response: finalResponse,
    });

    res.json({ response: finalResponse, toolCalls, privacyContext, secondaryEffects });
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

module.exports = { start, app, buildPrivacyContext, fanOutSecondaryPurposes };

if (require.main === module) {
  const port = process.env.ASSISTANT_PORT ?? 4001;
  start(port).then(() => process.stderr.write(`[orchestrator] listening on :${port}\n`));
}
