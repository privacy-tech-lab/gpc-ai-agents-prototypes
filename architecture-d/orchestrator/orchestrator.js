/**
 * Entry point: reads the GPC bit (W3C baggage header or `Sec-GPC` /
 * body), constructs the `_meta` envelope, and hands the fanout to the
 * provider middleware. The orchestrator never calls a site directly;
 * every outbound publisher request goes through the provider, which is
 * the structural point of the architecture.
 *
 * Both function entry points (`handleRequest` and `handleAgentRequest`)
 * accept the GPC bit as a W3C baggage header value. The HTTP route
 * synthesizes a baggage header from `Sec-GPC` (or `body.gpc`) before
 * dispatching, so there is exactly one path into the middleware.
 */

const express                            = require('express');
const { createProvider }                 = require('../provider/provider');
const { listPublisherIds }               = require('../services/tool_registry');
const { readGpcFromBaggage, encodeBaggage } = require('./baggage');
const researchAgent                      = require('../agents/research_agent');
const { buildPrivacyContext }            = require('../../core/gpc');

/**
 * Fan a query to every publisher in the registry via the provider.
 */
async function fanoutAll(provider, userId, query, meta = {}) {
  return provider.fanout(userId, query, listPublisherIds(), meta);
}

/**
 * Fan a query to a specified subset of publishers via the provider.
 */
async function fanoutSelected(provider, userId, query, siteIds, meta = {}) {
  return provider.fanout(userId, query, siteIds, meta);
}

/**
 * Handle a scripted request end-to-end.
 *
 * @param {object} options
 * @param {string} options.user_id
 * @param {string} options.query
 * @param {string} [options.baggageHeader] — W3C baggage value (e.g. "gpc=1")
 * @param {object} [options.provider]      — bring your own (e.g. with mitm or mitigations)
 */
async function handleRequest({ user_id, query, baggageHeader = '', provider }) {
  // Layer 1: read the GPC bit from the W3C baggage value.
  const gpcActive = readGpcFromBaggage(baggageHeader);

  // Layer 2: assemble the `_meta` envelope carried into the provider.
  // gpc key is present only when the signal is active; absence means no signal.
  const meta = gpcActive ? { gpc: 1 } : {};

  // Layer 3: hand the fanout to the provider middleware.
  const p            = provider ?? createProvider();
  const fanoutResult = await fanoutAll(p, user_id, query, meta);

  return {
    gpc_active:    gpcActive,
    meta_envelope: meta,
    fanout:        fanoutResult,
    provider_view: p.getProviderView(),
  };
}

/**
 * Handle an agent-driven request. The model selects publishers and
 * sub-queries; every call routes through the provider middleware.
 */
async function handleAgentRequest({ user_id, query, baggageHeader = '', provider }) {
  const gpcActive = readGpcFromBaggage(baggageHeader);
  const meta      = gpcActive ? { gpc: 1 } : {};
  const p         = provider ?? createProvider();

  const agentResult = await researchAgent.run({ provider: p, user_id, query, meta });

  return {
    gpc_active:    gpcActive,
    meta_envelope: meta,
    agent:         agentResult,
    provider_view: p.getProviderView(),
  };
}

// ── HTTP entry ────────────────────────────────────────────────────────────────
//
// The Express app is the production-shaped entry point. It is not hardened
// beyond the body-size cap below; do not expose it on a public interface
// without a reverse proxy that adds rate limiting, auth, and request limits.

const app = express();
app.use(express.json({ limit: '10kb' }));

app.post('/ask', async (req, res) => {
  // Default to an empty object so missing / non-JSON bodies are
  // reported as a 400 from the field validation below rather than
  // crashing the route destructure and falling out as a 500.
  const body = req.body ?? {};
  const { user_id, query, mode } = body;
  if (!user_id || !query) {
    return res.status(400).json({ error: 'user_id and query are required' });
  }
  if (mode !== undefined && mode !== 'agent') {
    return res.status(400).json({ error: 'unknown_mode', detail: 'mode must be "agent" or omitted' });
  }

  const privacyContext = buildPrivacyContext(req);
  // Lift the privacy context back onto a W3C baggage header so the
  // function-level entries (handleRequest / handleAgentRequest) have a
  // single canonical input shape.
  const baggageHeader = privacyContext.gpc === 1 ? encodeBaggage({ gpc: '1' }) : '';

  try {
    const result = mode === 'agent'
      ? await handleAgentRequest({ user_id, query, baggageHeader })
      : await handleRequest({       user_id, query, baggageHeader });
    res.json({ privacy_context: privacyContext, ...result });
  } catch (err) {
    // Log the full error server-side; return a generic message so the
    // response body does not leak stack traces or internal paths.
    process.stderr.write(`[/ask] ${err?.stack ?? err}\n`);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Catchall for unhandled paths / methods. Without this Express returns
// its default HTML 404 page, which is inconsistent with the rest of
// the API and leaks internal paths in stack traces.
app.use((req, res) => {
  res.status(404).json({ error: 'not_found', method: req.method, path: req.path });
});

// Catch body-parser failures (oversized body, malformed JSON) and any
// other thrown error that escapes the route. Without this Express
// returns a default HTML stack trace, which leaks paths to the client.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large')   return res.status(413).json({ error: 'request_body_too_large' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' });
  process.stderr.write(`[express] ${err?.stack ?? err}\n`);
  res.status(500).json({ error: 'internal_error' });
});

function start(port) {
  const raw        = port ?? process.env.ASSISTANT_PORT ?? 4011;
  const listenPort = Number(raw);
  if (!Number.isInteger(listenPort) || listenPort < 0 || listenPort > 65535) {
    throw new Error(`Invalid ASSISTANT_PORT: ${raw}`);
  }
  return new Promise((resolve, reject) => {
    // Express's listen-callback path fires even on EADDRINUSE in Express 5,
    // so subscribe to the underlying 'listening' / 'error' events directly
    // and use whichever fires first.
    const srv = app.listen(listenPort);
    srv.once('listening', () => resolve(srv));
    srv.once('error',     reject);
  });
}

module.exports = {
  start,
  app,
  buildPrivacyContext,
  fanoutAll,
  fanoutSelected,
  handleRequest,
  handleAgentRequest,
};

if (require.main === module) {
  const port = process.env.ASSISTANT_PORT ?? 4011;
  start(port).then((srv) => {
    process.stderr.write(`[orchestrator] listening on :${port}\n`);

    // Graceful shutdown so in-flight `/ask` requests can drain.
    const shutdown = (signal) => {
      process.stderr.write(`\n[orchestrator] ${signal} received, closing...\n`);
      srv.close(() => process.exit(0));
      // Hard exit if a request hangs longer than 5 s.
      setTimeout(() => process.exit(1), 5000).unref();
    };
    process.on('SIGINT',  () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  });
}
