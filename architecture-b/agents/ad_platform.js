/**
 * Mock Ad Platform — B2 Storage layer stub.
 *
 * Simulates a pharmaceutical ad-targeting vendor that maintains a vector store
 * of derived patient interest profiles.  Enforces purpose-based GPC at the
 * service boundary: if gpc=1 and the declared purpose (ad_targeting) is in the
 * platform's restricted list, the vector DB write is blocked before it occurs.
 *
 * This models the Storage operation in B2's four-layer taxonomy:
 *   derived data never reaches the store when GPC is active.
 *
 * For partial opt-out: the caller may pass gpc_scope as an array.  If present,
 * the platform checks whether "ad_targeting" is in that array before blocking.
 * If absent (full GPC), any gpc=1 request with purpose=ad_targeting is blocked.
 */

const express = require('express');
const fs      = require('fs');
const path    = require('path');

const VECTOR_STORE_FILE = path.join(__dirname, '..', 'output', 'ad_vector_store.json');
fs.mkdirSync(path.dirname(VECTOR_STORE_FILE), { recursive: true });

function loadStore() {
  if (!fs.existsSync(VECTOR_STORE_FILE)) return [];
  return JSON.parse(fs.readFileSync(VECTOR_STORE_FILE, 'utf8'));
}

function saveStore(entries) {
  fs.writeFileSync(VECTOR_STORE_FILE, JSON.stringify(entries, null, 2));
}

// Purposes this platform restricts when GPC is active
const RESTRICTED_PURPOSES = ['ad_targeting'];

const app = express();
app.use(express.json());

app.post('/target', (req, res) => {
  const { patient_id, query, gpc, purpose, gpc_scope } = req.body;

  const gpcActive = gpc === 1 || gpc === true || gpc === '1';

  if (gpcActive) {
    // Determine which purposes are blocked:
    // - If caller provides gpc_scope, respect that list
    // - Otherwise, fall back to the platform's own RESTRICTED_PURPOSES
    const blockedPurposes = Array.isArray(gpc_scope) ? gpc_scope : RESTRICTED_PURPOSES;

    if (!purpose) {
      return res.json({
        status: 'blocked',
        reason: 'missing_purpose_field',
        layer: 'ad_platform_storage',
      });
    }

    if (blockedPurposes.includes(purpose)) {
      return res.json({
        status: 'blocked',
        reason: 'purpose_restricted',
        purpose,
        layer: 'ad_platform_storage',
      });
    }
  }

  // Write to simulated vector store
  const entry = {
    patient_id,
    query,
    purpose,
    vector: `[mock-embedding-for:${query.slice(0, 30)}]`,
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
    const srv = app.listen(listenPort, () => {
      resolve(srv);
    });
  });
}

module.exports = { start };

if (require.main === module) {
  const port = process.env.AD_PLATFORM_PORT ?? 4002;
  start(port).then(() => process.stderr.write(`[ad_platform] listening on :${port}\n`));
}
