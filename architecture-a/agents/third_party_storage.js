/**
 * Third-Party Storage Agent (Layer 3 boundary).
 *
 * Simulates a vendor service that manages a vector store for personalisation.
 * Every request MUST carry a valid signed JWT in the Authorization header.
 * If the JWT carries gpc=true the write is rejected before touching the store.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { verifyToken } = require('../mcp-server/identity_provider.js');

const VECTOR_STORE_FILE = path.join(__dirname, '..', 'output', 'vector_store.json');

function loadStore() {
  if (!fs.existsSync(VECTOR_STORE_FILE)) return [];
  return JSON.parse(fs.readFileSync(VECTOR_STORE_FILE, 'utf8'));
}

function saveStore(entries) {
  fs.writeFileSync(VECTOR_STORE_FILE, JSON.stringify(entries, null, 2));
}

const app = express();
app.use(express.json());

app.post('/store', (req, res) => {
  // --- JWT verification ---
  const authHeader = req.headers['authorization'] ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'missing_token' });
  }

  let claims;
  try {
    claims = verifyToken(token);
  } catch (err) {
    return res.status(401).json({ error: 'invalid_token', detail: err.message });
  }

  // --- GPC enforcement at the trust boundary ---
  if (claims.gpc) {
    return res.status(200).json({
      status: 'blocked',
      reason: 'gpc_opt_out',
      layer: 'trust_boundary_jwt',
      sub: claims.sub,
    });
  }

  // --- Write to simulated vector store ---
  const { user_id, content } = req.body;
  const entry = { user_id, content, storedAt: new Date().toISOString() };
  const store = loadStore();
  store.push(entry);
  saveStore(store);

  res.json({ status: 'ok', stored: true, entry });
});

function start(port) {
  const listenPort = port ?? process.env.THIRD_PARTY_PORT ?? 4001;
  return new Promise((resolve) => {
    const srv = app.listen(listenPort, () => {
      resolve(srv);
    });
  });
}

module.exports = { start };

// Allow running standalone for testing
if (require.main === module) {
  const port = process.env.THIRD_PARTY_PORT ?? 4001;
  start(port).then(() => console.log(`Third-party storage listening on :${port}`));
}
