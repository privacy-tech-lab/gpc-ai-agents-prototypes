/**
 * Mock Ad Platform — B2 Storage layer stub (Architecture B variant).
 *
 * Same role as Architecture A's ad_platform: a pharma ad-targeting vendor
 * with a vector store of derived patient interest profiles, enforcing
 * purpose-based GPC at its HTTP boundary (layer 3 of the table).
 *
 * Difference from Architecture A: this endpoint is now reached via the
 * agent loop's secondary-purpose fan-out (see lib/agentLoop.js), AFTER
 * get_medical_records has already run unconditionally. The GPC check here
 * is a second, independent enforcement point — defense in depth alongside
 * the data-layer withPurposeCheck() interceptor in lib/withPurposeCheck.js.
 */
const express = require('express');
const fs      = require('fs');
const path    = require('path');
const { evaluatePurpose } = require('../lib/withPurposeCheck');
const { RESTRICTABLE_PURPOSES_SET } = require('../lib/purposeRegistry');

const VECTOR_STORE_FILE = path.join(__dirname, '..', 'output', 'ad_vector_store.json');
fs.mkdirSync(path.dirname(VECTOR_STORE_FILE), { recursive: true });

function loadStore() {
  if (!fs.existsSync(VECTOR_STORE_FILE)) return [];
  return JSON.parse(fs.readFileSync(VECTOR_STORE_FILE, 'utf8'));
}
function saveStore(entries) {
  fs.writeFileSync(VECTOR_STORE_FILE, JSON.stringify(entries, null, 2));
}

const app = express();
app.use(express.json());

app.post('/target', (req, res) => {
  const { patient_id, query, gpc, purpose, gpc_scope } = req.body;

  const decision = evaluatePurpose({ gpc, gpc_scope }, purpose, RESTRICTABLE_PURPOSES_SET);

  if (!decision.allowed) {
    return res.json({
      status: 'blocked',
      reason: decision.reason,
      purpose,
      layer: 'ad_platform_storage',
    });
  }

  const entry = {
    patient_id,
    query,
    purpose,
    vector: `[mock-embedding-for:${(query ?? '').slice(0, 30)}]`,
    storedAt: new Date().toISOString(),
  };
  const store = loadStore();
  store.push(entry);
  saveStore(store);
  return res.json({ status: 'ok', stored: true, entry });
});

function start(port) {
  const listenPort = port ?? process.env.AD_PLATFORM_PORT ?? 4002;
  return new Promise((resolve) => {
    const srv = app.listen(listenPort, () => resolve(srv));
  });
}

module.exports = { start, app };

if (require.main === module) {
  const port = process.env.AD_PLATFORM_PORT ?? 4002;
  start(port).then(() => process.stderr.write(`[ad_platform] listening on :${port}\n`));
}
