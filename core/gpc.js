'use strict';

/**
 * Shared GPC signal reader for Express-style request handlers.
 *
 * Used by arch-B and arch-D. Each architecture has its own HTTP
 * orchestrator; this module owns the header and body parsing so both
 * get the same normalization rules.
 *
 * Precedence:
 *   1. Sec-GPC header wins when set to "1" (opt-out) or an all-zero
 *      value (explicit opt-in). Node merges duplicate request headers
 *      into a comma-separated string, so "1, 0" means opt-out
 *      (most-restrictive wins).
 *   2. Otherwise body.gpc (numeric 1/0, string "1"/"0", boolean).
 *   3. Otherwise undefined (signal absent).
 *
 * Also reads body.gpc_scope: an optional array of purpose labels for
 * partial opt-out (arch-B feature). When absent or not an array,
 * gpc_scope is omitted from the returned context.
 *
 * @param {object} req - Express request or any { headers, body } object
 * @returns {{ gpc: 1|0|undefined, gpc_scope?: string[] }}
 */
function buildPrivacyContext(req) {
  const raw    = req.headers?.['sec-gpc'];
  const values = typeof raw === 'string'
    ? raw.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  let gpc;
  if (values.includes('1')) {
    gpc = 1;
  } else if (values.length > 0 && values.every((v) => v === '0')) {
    gpc = 0;
  } else {
    const bodyGpc = req.body?.gpc;
    if (bodyGpc === 1 || bodyGpc === '1' || bodyGpc === true)      gpc = 1;
    else if (bodyGpc === 0 || bodyGpc === '0' || bodyGpc === false) gpc = 0;
  }

  const ctx       = { gpc };
  const gpc_scope = Array.isArray(req.body?.gpc_scope) ? req.body.gpc_scope : undefined;
  if (gpc_scope !== undefined) ctx.gpc_scope = gpc_scope;
  return ctx;
}

module.exports = { buildPrivacyContext };
