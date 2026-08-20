'use strict';

/**
 * delegation_gate.js: the Category E enforcement seam.
 *
 * E1 (selective delegation) governs which decisions the agent may resolve
 * on its own versus which must come back to the user. Every action request
 * passes through requestAction() with the run's context:
 *
 *  mode 'silent': the violation baseline. The platform treats every vendor
 *  default as consent and runs everything. Actions that lacked an explicit
 *  autonomous grant from the user are annotated as E1 violations.
 *
 *  Enforced modes resolve the effective tier through the manifest
 *  precedence (user assignment beats vendor proposal; GPC voids vendor
 *  proposals; unassigned falls to ask_user), then:
 *   - 'autonomous' executes.
 *   - 'ask_user' with the user present surfaces the decision and follows
 *     their answer.
 *   - 'ask_user' with nobody available declines rather than proceeds: the
 *     most restrictive default E1 requires.
 *
 * Execution happens over real MCP (mcp_client.js), and only ever after the
 * gate has decided. That ordering is the point: the tool server never sees
 * a call the user did not grant standing for.
 */

const manifest = require('./delegation_manifest');
const { executeAction } = require('./mcp_client');

async function requestAction(actionDef, ctx = {}) {
  const { mode, gpc = false, userPresent = true, respond = 'approve' } = ctx;
  const { action, args, dimensions } = actionDef;

  if (mode === 'silent') {
    const userGrantedAutonomy = manifest.USER_ASSIGNMENTS[action] === 'autonomous';
    return {
      action,
      status: 'executed',
      tier: 'vendor_assumed_autonomous',
      dimensions,
      violations: userGrantedAutonomy ? [] : ['E1'],
      ...(await executeAction(action, args)),
    };
  }

  const { tier, source } = manifest.effectiveTier(action, { gpc });

  if (tier === 'autonomous') {
    return {
      action,
      status: 'executed',
      tier,
      tier_source: source,
      dimensions,
      ...(await executeAction(action, args)),
    };
  }

  // ask_user tier from here down.
  if (!userPresent) {
    return {
      action,
      status: 'declined',
      tier,
      tier_source: source,
      reason: 'default_restrictive_no_user',
      dimensions,
    };
  }

  if (respond === 'approve') {
    return {
      action,
      status: 'executed_after_approval',
      tier,
      tier_source: source,
      surfaced: true,
      dimensions,
      ...(await executeAction(action, args)),
    };
  }

  return {
    action,
    status: 'declined_by_user',
    tier,
    tier_source: source,
    surfaced: true,
    dimensions,
  };
}

module.exports = { requestAction };
