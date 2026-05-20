/**
 * Purpose Registry — single source of truth for the tool-purpose relationship.
 *
 * Each entry declares which purposes a tool can serve and which of those
 * purposes are GPC-restricted.  The key architectural insight: a tool is
 * NEVER blocked wholesale.  Only the purpose for which its output would be
 * used is blocked.  get_medical_records must run for primary_task; only its
 * personalization purpose is restricted.
 *
 * Purpose taxonomy: primary_task | analytics | model_training | ad_targeting | personalization
 */

const PURPOSE_REGISTRY = [
  {
    tool_name: 'get_medical_records',
    declared_purposes: ['primary_task', 'personalization'],
    gpc_restricted_purposes: ['personalization'],
  },
  {
    tool_name: 'answer_question',
    declared_purposes: ['primary_task'],
    gpc_restricted_purposes: [],
  },
  {
    tool_name: 'log_interaction',
    declared_purposes: ['analytics', 'model_training'],
    gpc_restricted_purposes: ['analytics', 'model_training'],
  },
  {
    tool_name: 'update_interest_profile',
    declared_purposes: ['personalization'],
    gpc_restricted_purposes: ['personalization'],
  },
  {
    tool_name: 'add_to_training_set',
    declared_purposes: ['model_training'],
    gpc_restricted_purposes: ['model_training'],
  },
];

// O(1) lookup map
const REGISTRY_MAP = Object.fromEntries(
  PURPOSE_REGISTRY.map((entry) => [entry.tool_name, entry])
);

/**
 * Wrap a tool handler with purpose-aware GPC enforcement.
 *
 * Unlike Architecture A's withGpc() which blocks a tool entirely, this
 * interceptor reads two fields from the incoming metadata:
 *   meta.gpc     — whether GPC is active (1/true/'1')
 *   meta.purpose — the declared purpose for THIS specific call
 *
 * Enforcement logic:
 *   1. If gpc is inactive: always allow.
 *   2. If meta.purpose is missing: maximally restrict — block the call.
 *      This motivates purpose declaration as a required protocol field.
 *   3. If meta.gpc_scope is present: use it as the active restriction list
 *      (enables partial opt-out — user blocks only some purposes).
 *   4. Otherwise: use the registry's gpc_restricted_purposes list.
 *
 * @param {string}   toolName
 * @param {Function} handler   async (args) => result
 * @returns {Function}         async (args, meta) => result | blocked-response
 */
function withPurposeCheck(toolName, handler) {
  return async function purposeInterceptor(args, meta = {}) {
    const gpcSignal = meta?.gpc === true || meta?.gpc === 1 || meta?.gpc === '1';

    if (gpcSignal) {
      const purpose = meta?.purpose;

      // Missing purpose → treat as maximally restricted
      if (!purpose) {
        return {
          status: 'blocked',
          reason: 'missing_purpose_field',
          tool: toolName,
          timestamp: new Date().toISOString(),
        };
      }

      const entry = REGISTRY_MAP[toolName];
      // meta.gpc_scope overrides registry defaults for partial opt-out
      const restrictedPurposes = meta.gpc_scope ?? entry?.gpc_restricted_purposes ?? [];

      if (restrictedPurposes.includes(purpose)) {
        return {
          status: 'blocked',
          reason: 'purpose_restricted',
          tool: toolName,
          purpose,
          timestamp: new Date().toISOString(),
        };
      }
    }

    const start = Date.now();
    const result = await handler(args, meta);
    const durationMs = Date.now() - start;

    return { status: 'ok', tool: toolName, purpose: meta?.purpose, result, durationMs };
  };
}

module.exports = { PURPOSE_REGISTRY, REGISTRY_MAP, withPurposeCheck };
