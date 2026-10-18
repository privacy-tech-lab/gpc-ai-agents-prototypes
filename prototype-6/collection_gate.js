'use strict';

/**
 * collection_gate.js: the collection enforcement seam.
 *
 * Collection preferences govern what gets gathered, not what the task does. The task
 * (polishing the email) always completes; the gate decides what the platform
 * keeps from the interaction. Three checkpoints, one per preference scope:
 *
 *  collectInput: the user's submission may be used to complete the task,
 *  but with the input preference asserted it is discarded afterward instead of logged.
 *
 *  collectBehavior: telemetry the user passively generates (deletions,
 *  hesitation, rewrites) is not recorded with the behavior preference asserted.
 *
 *  deriveProfile: inferences built from input or behavior material are not written
 *  to the profile with the derived preference asserted. Ported from prototype-5's inference
 *  firewall: the run records what would have been written.
 *
 * Scopes are independently assertable: resolveOptouts() turns the GPC
 * signal (all three) or an explicit scope list (any subset) into the active
 * set.
 */

const VALID_SCOPES = ['input', 'behavior', 'derived'];

/**
 * resolveOptouts({ gpc, scope })
 *
 * A bare GPC signal asserts all three scopes. A scope list (with or
 * without the GPC flag) asserts exactly that subset, mirroring
 * prototype-2's gpc_scope semantics.
 */
function resolveOptouts({ gpc = false, scope = [] } = {}) {
  const cleaned = scope.filter(s => VALID_SCOPES.includes(s));
  if (cleaned.length > 0) return new Set(cleaned);
  if (gpc) return new Set(VALID_SCOPES);
  return new Set();
}

function collectInput(submission, stores, optouts) {
  if (optouts.has('input')) {
    stores.inputLog.incrementBlocked();
    return {
      stage: 'input',
      status: 'discarded',
      reason: 'input_optout',
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
  return { stage: 'input', status: 'stored', entry };
}

function collectBehavior(event, stores, optouts) {
  if (optouts.has('behavior')) {
    stores.behaviorLog.incrementBlocked();
    return {
      stage: 'behavior',
      status: 'suppressed',
      reason: 'behavioral_optout',
      would_have_recorded: { event: event.event, detail: event.detail },
    };
  }
  stores.behaviorLog.store(event);
  return { stage: 'behavior', status: 'recorded', event: event.event };
}

function deriveProfile(draftId, classified, stores, optouts) {
  const { inferred_attributes, attribute_sources } = classified;
  if (optouts.has('derived')) {
    stores.derivedProfile.incrementBlocked();
    return {
      stage: 'derived',
      status: 'blocked',
      reason: 'inference_firewall',
      draft_id: draftId,
      would_have_written: JSON.parse(JSON.stringify(inferred_attributes)),
      attribute_sources: JSON.parse(JSON.stringify(attribute_sources)),
    };
  }
  stores.derivedProfile.write(inferred_attributes);
  return {
    stage: 'derived',
    status: 'derived',
    draft_id: draftId,
    attributes: JSON.parse(JSON.stringify(inferred_attributes)),
    attribute_sources: JSON.parse(JSON.stringify(attribute_sources)),
  };
}

const curtain = require('../core/curtain.js');

// The checkpoint functions stay pure; the curtain wrapper renders each
// decision from the structured result they already return.
function traced(fn) {
  return (...args) => {
    const result = fn(...args);
    curtain.verdict(result, `${result.stage} checkpoint`);
    return result;
  };
}

module.exports = {
  resolveOptouts,
  collectInput: traced(collectInput),
  collectBehavior: traced(collectBehavior),
  deriveProfile: traced(deriveProfile),
  VALID_SCOPES,
};
