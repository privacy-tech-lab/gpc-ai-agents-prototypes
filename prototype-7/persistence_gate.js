'use strict';

/**
 * persistence_gate.js: the persistence enforcement seam.
 *
 * Persistence preferences govern how far data travels through time. Three checkpoints,
 * one per scope, sitting at the three moments retention happens:
 *
 *  endSession: when a session closes, its transcript and disclosed facts
 *  either enter the archive or vanish. With the session scope asserted nothing survives;
 *  every new interaction starts from a clean slate.
 *
 *  recallForSession: when a new session starts, the system either reads
 *  the archive to build continuity or starts fresh. With the cross_session scope asserted the
 *  archive may exist (the user keeps their history) but may not inform the
 *  new session.
 *
 *  synthesizeProfile: retained sessions either get synthesized into a
 *  durable behavioral model or stay as inert transcripts. With the profile scope asserted
 *  the system may remember interactions but not compress them into a
 *  profile.
 *
 * The scopes form a hierarchy: asserting session implies cross_session and profile,
 * and asserting cross_session implies profile. resolveScope() encodes that expansion. What is
 * never gated: within-session context. Aria may always use what the user
 * said earlier in the same session; that is the operational coherence the session
 * scope explicitly permits.
 */

const VALID_SCOPES = ['session', 'cross_session', 'profile'];

const REASONS = {
  session: 'session_scope',
  cross_session: 'cross_session_scope',
  profile: 'profile_scope',
};

/**
 * resolveScope({ gpc, scope })
 *
 * Bare GPC asserts the strictest scope (session), which implies the whole
 * hierarchy. A scope list expands downward: session implies cross_session
 * and profile, cross_session implies profile.
 */
function resolveScope({ gpc = false, scope = [] } = {}) {
  const cleaned = scope.filter(s => VALID_SCOPES.includes(s));
  const seed = cleaned.length > 0 ? new Set(cleaned) : gpc ? new Set(['session']) : new Set();

  const active = new Set(seed);
  if (active.has('session')) {
    active.add('cross_session');
    active.add('profile');
  }
  if (active.has('cross_session')) {
    active.add('profile');
  }
  return active;
}

/**
 * endSession(session, memory, optouts)
 *
 * The session boundary. Clears the transient session context in every mode, then
 * either archives the transcript or discards it.
 */
function endSession(session, memory, optouts) {
  memory.clearContext();

  if (optouts.has('session')) {
    memory.archive.incrementBlocked();
    return {
      checkpoint: 'session_end',
      scope: 'session',
      session_id: session.session_id,
      status: 'discarded',
      reason: REASONS.session,
      would_have_archived: {
        turns: session.turns.length,
        facts: session.facts_disclosed,
      },
    };
  }

  memory.archive.store({
    session_id: session.session_id,
    turns: session.turns,
    facts: session.facts_disclosed,
  });
  return {
    checkpoint: 'session_end',
    scope: 'session',
    session_id: session.session_id,
    status: 'archived',
  };
}

/**
 * recallForSession(memory, optouts)
 *
 * The cross-session boundary. Returns the facts from archived sessions that may inform
 * the new session, or nothing.
 */
function recallForSession(memory, optouts) {
  if (optouts.has('cross_session')) {
    return {
      checkpoint: 'session_start',
      scope: 'cross_session',
      status: 'blocked',
      reason: REASONS.cross_session,
      archived_sessions_present: memory.archive.snapshot().entry_count,
      recalled_facts: {},
    };
  }

  const snap = memory.archive.snapshot();
  if (snap.entry_count === 0) {
    return {
      checkpoint: 'session_start',
      scope: 'cross_session',
      status: 'nothing_to_recall',
      recalled_facts: {},
    };
  }

  const facts = Object.assign({}, ...snap.entries.map(e => e.facts));
  return {
    checkpoint: 'session_start',
    scope: 'cross_session',
    status: 'recalled',
    recalled_facts: facts,
    from_sessions: snap.entries.map(e => e.session_id),
  };
}

/**
 * synthesizeProfile(candidate, memory, optouts)
 *
 * The profile boundary. Either writes the behavioral model or refuses to compress
 * the archive into one.
 */
function synthesizeProfile(candidate, memory, optouts) {
  if (optouts.has('profile')) {
    memory.profile.incrementBlocked();
    return {
      checkpoint: 'profile_synthesis',
      scope: 'profile',
      status: 'blocked',
      reason: REASONS.profile,
      would_have_synthesized: JSON.parse(JSON.stringify(candidate)),
    };
  }

  if (memory.archive.isEmpty()) {
    return {
      checkpoint: 'profile_synthesis',
      scope: 'profile',
      status: 'nothing_to_synthesize',
    };
  }

  memory.profile.store(candidate);
  return {
    checkpoint: 'profile_synthesis',
    scope: 'profile',
    status: 'synthesized',
    attributes: JSON.parse(JSON.stringify(candidate)),
  };
}

const curtain = require('../core/curtain.js');

// The checkpoint functions stay pure; the curtain wrapper renders each
// decision from the structured result they already return.
function traced(fn) {
  return (...args) => {
    const result = fn(...args);
    curtain.verdict(result, `${result.scope ?? ''} ${result.checkpoint ?? ''}`.trim());
    return result;
  };
}

module.exports = {
  resolveScope,
  endSession: traced(endSession),
  recallForSession: traced(recallForSession),
  synthesizeProfile: traced(synthesizeProfile),
  VALID_SCOPES,
  REASONS,
};
