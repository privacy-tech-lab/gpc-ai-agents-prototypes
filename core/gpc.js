'use strict';

/**
 * Shared GPC signal reader for Express-style request handlers.
 *
 * Used by arch-B and arch-D. Each architecture has its own HTTP
 * orchestrator; this module owns the header and body parsing so both
 * get the same normalization rules.
 *
 * GPC is a unary signal: the only valid Sec-GPC value is "1" (opt-out).
 * Any other header value, including "0", is treated as absent because
 * the absence of a GPC signal cannot be interpreted as the user
 * intending to not opt out.
 *
 * Precedence:
 *   1. Sec-GPC header: "1" activates GPC. Any other value is ignored.
 *      Node merges duplicate request headers into a comma-separated
 *      string, so any "1" present in that string activates GPC
 *      (most-restrictive wins).
 *   2. Otherwise body.gpc: only 1, true, or "1" activates GPC.
 *   3. Otherwise the signal is absent (gpc is undefined).
 *
 * Also reads body.gpc_scope: an optional array of purpose labels for
 * partial opt-out (arch-B feature). When absent or not an array,
 * gpc_scope is omitted from the returned context.
 *
 * @param {object} req - Express request or any { headers, body } object
 * @returns {{ gpc?: 1, gpc_scope?: string[] }}
 */
function buildPrivacyContext(req) {
  const raw    = req.headers?.['sec-gpc'];
  const values = typeof raw === 'string'
    ? raw.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  let gpc;
  if (values.includes('1')) {
    gpc = 1;
  } else {
    const bodyGpc = req.body?.gpc;
    if (bodyGpc === 1 || bodyGpc === '1' || bodyGpc === true) gpc = 1;
  }

  const ctx       = {};
  if (gpc !== undefined) ctx.gpc = gpc;
  const gpc_scope = Array.isArray(req.body?.gpc_scope) ? req.body.gpc_scope : undefined;
  if (gpc_scope !== undefined) ctx.gpc_scope = gpc_scope;
  return ctx;
}

module.exports = { buildPrivacyContext };
