'use strict';

/**
 * collection_gate.js: the Category B enforcement seam.
 *
 * Category B governs what gets gathered, not what the task does. The task
 * (polishing the email) always completes; the gate decides what the platform
 * keeps from the interaction. Three checkpoints, one per subtype:
 *
 *  B1 collectInput: the user's submission may be used to complete the task,
 *  but with B1 asserted it is discarded afterward instead of logged.
 *
 *  B2 collectBehavior: telemetry the user passively generates (deletions,
 *  hesitation, rewrites) is not recorded with B2 asserted.
 *
 *  B3 deriveProfile: inferences built from B1 or B2 material are not written
 *  to the profile with B3 asserted. Ported from prototype-5's inference
 *  firewall: the run records what would have been written.
 *
 * Subtypes are independently assertable: resolveOptouts() turns the GPC
 * signal (all three) or an explicit scope list (any subset) into the active
 * set.
 */

const VALID_SUBTYPES = ['b1', 'b2', 'b3'];

/**
 * resolveOptouts({ gpc, scope })
 *
 * A bare GPC signal asserts the whole category. A scope list (with or
 * without the GPC flag) asserts exactly that subset, mirroring
 * prototype-2's gpc_scope semantics.
 */
function resolveOptouts({ gpc = false, scope = [] } = {}) {
  const cleaned = scope.filter(s => VALID_SUBTYPES.includes(s));
  if (cleaned.length > 0) return new Set(cleaned);
  if (gpc) return new Set(VALID_SUBTYPES);
  return new Set();
}

function collectInput(submission, stores, optouts) {
  if (optouts.has('b1')) {
    stores.inputLog.incrementBlocked();
    return {
      stage: 'B1',
      status: 'discarded',
      reason: 'b1_input_optout',
      would_have_stored: {
        instruction: submission.instruction,
        draft_text: submission.draft_text,
      },
    };
  }
  const entry = {
    draft_id: submission.draft_id,
    instruction: submission.instruction,
    draft_text: submission.draft_text,
  };
  stores.inputLog.store(entry);
  return { stage: 'B1', status: 'stored', entry };
}

function collectBehavior(event, stores, optouts) {
  if (optouts.has('b2')) {
    stores.behaviorLog.incrementBlocked();
    return {
      stage: 'B2',
      status: 'suppressed',
      reason: 'b2_behavioral_optout',
      would_have_recorded: { event: event.event, detail: event.detail },
    };
  }
  stores.behaviorLog.store(event);
  return { stage: 'B2', status: 'recorded', event: event.event };
}

function deriveProfile(draftId, classified, stores, optouts) {
  const { inferred_attributes, attribute_sources } = classified;
  if (optouts.has('b3')) {
    stores.derivedProfile.incrementBlocked();
    return {
      stage: 'B3',
      status: 'blocked',
      reason: 'b3_inference_firewall',
      draft_id: draftId,
      would_have_written: JSON.parse(JSON.stringify(inferred_attributes)),
      attribute_sources: JSON.parse(JSON.stringify(attribute_sources)),
    };
  }
  stores.derivedProfile.write(inferred_attributes);
  return {
    stage: 'B3',
    status: 'derived',
    draft_id: draftId,
    attributes: JSON.parse(JSON.stringify(inferred_attributes)),
    attribute_sources: JSON.parse(JSON.stringify(attribute_sources)),
  };
}

module.exports = { resolveOptouts, collectInput, collectBehavior, deriveProfile, VALID_SUBTYPES };
