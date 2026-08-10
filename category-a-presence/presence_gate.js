'use strict';

/**
 * presence_gate.js: the Category A enforcement seam.
 *
 * Every feature invocation passes through invokeFeature(). Non-AI features
 * always run; Category A governs AI presence only. For AI features, two
 * checks run in order, mirroring the two subtypes:
 *
 *  A1 (integration): an AI feature the user has not affirmatively enabled is
 *  off by default, even if the platform shipped it in an update. Undecided
 *  features fire an opt_in_request; declined features stay blocked; under
 *  GPC, undecided features are auto-declined without a prompt.
 *
 *  A2 (activation): a passive invocation (a feature marked passive, or any
 *  call initiated by the platform rather than the user) additionally needs
 *  ambient_enabled in the manifest. A user-initiated on-demand call needs no
 *  separate activation check: invoking the feature is the expressed intent.
 *
 * The two checks are independent. A user can enable an AI feature (waiving
 * A1 for it) and still keep ambient mode off (asserting A2), or the reverse.
 *
 * mode 'silent' models the violation baseline: the platform ships AI on by
 * default and runs it passively. The gate executes everything but annotates
 * which subtype each call would have violated.
 */

const registry = require('./feature_registry');
const manifest = require('./presence_manifest');
const bus = require('./event_bus');
const handlers = require('./feature_handlers');

function isPassiveActivation(feature, initiatedBy) {
  return feature.invocation === 'passive' || initiatedBy === 'platform';
}

async function invokeFeature(featureName, args, { mode, gpc = false, initiatedBy = 'user' } = {}) {
  const feature = registry.getFeature(featureName);
  if (!feature) throw new Error(`Unknown feature: ${featureName}`);

  // Category A governs AI presence. Plain features are out of scope.
  if (!feature.is_ai) {
    return { status: 'executed', feature: featureName, subtype: null, ...handlers[featureName](args) };
  }

  // Violation baseline: no enforcement, but record what was violated.
  if (mode === 'silent') {
    const mf = manifest.load();
    const violations = [];
    if (!manifest.isEnabled(featureName, mf)) violations.push('A1');
    if (isPassiveActivation(feature, initiatedBy) && !mf.ambient_enabled) violations.push('A2');
    return {
      status: 'executed',
      feature: featureName,
      subtype: null,
      violations,
      ...handlers[featureName](args),
    };
  }

  let mf = manifest.load();
  let consentRequired = false;

  // A1: previously declined stays off through every later update.
  if (manifest.isDeclined(featureName, mf)) {
    return {
      status: 'blocked',
      subtype: 'A1',
      reason: 'previously_declined',
      feature: featureName,
    };
  }

  // A1: GPC asserts the presence opt-out globally. Undecided AI features are
  // declined without prompting the user.
  if (gpc && !manifest.isEnabled(featureName, mf)) {
    manifest.decline(featureName);
    return {
      status: 'blocked',
      subtype: 'A1',
      reason: 'gpc_auto_decline',
      feature: featureName,
    };
  }

  // A1: undecided AI feature is off by default. Surface an opt-in prompt.
  if (!manifest.isEnabled(featureName, mf)) {
    const optIn = await new Promise(resolve => bus.emit('opt_in_request', { feature, resolve }));

    if (!optIn.approved) {
      return {
        status: 'blocked',
        subtype: 'A1',
        reason: 'user_declined_opt_in',
        feature: featureName,
        prompt_text: optIn.promptText,
      };
    }
    consentRequired = true;
    mf = manifest.load();
  }

  // A2: passive activation needs an explicit ambient opt-in, separate from A1.
  if (isPassiveActivation(feature, initiatedBy)) {
    if (gpc) {
      return {
        status: 'blocked',
        subtype: 'A2',
        reason: 'gpc_ambient_optout',
        feature: featureName,
      };
    }
    if (!mf.ambient_enabled) {
      return {
        status: 'blocked',
        subtype: 'A2',
        reason: 'ambient_not_enabled',
        feature: featureName,
      };
    }
  }

  const result = {
    status: 'executed',
    feature: featureName,
    subtype: null,
    ...handlers[featureName](args),
  };
  if (consentRequired) result.consent_required = true;
  return result;
}

module.exports = { invokeFeature, isPassiveActivation };
