/**
 * withPurposeCheck — Layer 4 policy interceptor (Data Layer enforcement).
 *
 * Wraps any "secondary purpose" side-effect function (analytics logging,
 * training-data writes, ad-platform calls, etc.) and decides — BEFORE the
 * wrapped function runs — whether the call should proceed, based on:
 *
 *   - privacyContext.gpc        — global opt-out signal (boolean-ish)
 *   - privacyContext.gpc_scope  — optional array of purposes the opt-out
 *                                  applies to (partial opt-out). If absent,
 *                                  GPC applies to ALL registry-restricted
 *                                  purposes (full opt-out).
 *   - purpose                   — the declared purpose of THIS call
 *                                  (e.g. "analytics", "model_training",
 *                                  "ad_targeting")
 *   - registry                  — Set/array of purposes this policy layer
 *                                  treats as "secondary" / GPC-restrictable.
 *                                  Purposes NOT in the registry (e.g. the
 *                                  primary "patient_response" purpose) are
 *                                  never blocked by this interceptor.
 *
 * This module is intentionally side-effect-free and synchronous in its
 * decision-making — it never performs I/O itself, so it's trivial to unit
 * test the gating logic independently of any service.
 */

function normalizeGpc(gpc) {
  return gpc === 1 || gpc === true || gpc === '1';
}

/**
 * Pure decision function. Exported separately so callers (and tests) can
 * ask "would this be blocked?" without invoking anything.
 *
 * @param {object} privacyContext
 * @param {boolean|number|string} [privacyContext.gpc]
 * @param {string[]} [privacyContext.gpc_scope]
 * @param {string} purpose          - declared purpose of this call
 * @param {string[]|Set<string>} registry - purposes this layer can restrict
 * @returns {{ allowed: boolean, reason?: string }}
 */
function evaluatePurpose(privacyContext = {}, purpose, registry) {
  const registrySet = registry instanceof Set ? registry : new Set(registry ?? []);
  const gpcActive = normalizeGpc(privacyContext.gpc);

  if (!purpose) {
    return { allowed: false, reason: 'missing_purpose_field' };
  }

  // If this purpose isn't even in the restrictable registry, GPC is
  // irrelevant — it's treated as a primary-task purpose (e.g. answering
  // the patient's question) and always proceeds.
  if (!registrySet.has(purpose)) {
    return { allowed: true, reason: 'purpose_not_restrictable' };
  }

  if (!gpcActive) {
    return { allowed: true, reason: 'gpc_not_active' };
  }

  // GPC is active. Determine the effective blocked-purpose set:
  //  - gpc_scope present  -> partial opt-out: only purposes listed there
  //                          are blocked
  //  - gpc_scope absent   -> full opt-out: every registry-restricted
  //                          purpose is blocked
  const blockedPurposes = Array.isArray(privacyContext.gpc_scope)
    ? new Set(privacyContext.gpc_scope)
    : registrySet;

  if (blockedPurposes.has(purpose)) {
    return { allowed: false, reason: 'purpose_restricted' };
  }

  return { allowed: true, reason: 'purpose_not_in_gpc_scope' };
}

/**
 * Wraps an async side-effect function `fn(input)` so it only runs when
 * `evaluatePurpose(...)` allows it. The wrapped function always resolves
 * (never throws on policy grounds) with a uniform envelope so callers
 * (e.g. the agent loop's fan-out step) can log/inspect results without
 * try/catch per-pipeline.
 *
 * @param {Function} fn        - async (input) => result
 * @param {object} opts
 * @param {string} opts.purpose   - the purpose this pipeline serves
 * @param {string[]|Set<string>} opts.registry - GPC-restrictable purposes
 * @param {string} [opts.layer]  - label for diagnostics, e.g. "analytics_log"
 * @returns {Function} async (input, privacyContext) => envelope
 */
function withPurposeCheck(fn, { purpose, registry, layer = 'unnamed_layer' }) {
  return async function guarded(input, privacyContext = {}) {
    const decision = evaluatePurpose(privacyContext, purpose, registry);

    if (!decision.allowed) {
      return {
        status: 'blocked',
        reason: decision.reason,
        purpose,
        layer,
      };
    }

    const result = await fn(input, privacyContext);
    return {
      status: 'ok',
      purpose,
      layer,
      result,
    };
  };
}

module.exports = { withPurposeCheck, evaluatePurpose, normalizeGpc };
