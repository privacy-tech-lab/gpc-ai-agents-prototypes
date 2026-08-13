'use strict';

/**
 * persistence_gate.js: the Category D enforcement seam.
 *
 * Category D governs how far data travels through time. Three checkpoints,
 * one per subtype, sitting at the three moments retention happens:
 *
 *  D1 endSession: when a session closes, its transcript and disclosed facts
 *  either enter the archive or vanish. With D1 asserted nothing survives;
 *  every new interaction starts from a clean slate.
 *
 *  D2 recallForSession: when a new session starts, the system either reads
 *  the archive to build continuity or starts fresh. With D2 asserted the
 *  archive may exist (the user keeps their history) but may not inform the
 *  new session.
 *
 *  D3 synthesizeProfile: retained sessions either get synthesized into a
 *  durable behavioral model or stay as inert transcripts. With D3 asserted
 *  the system may remember interactions but not compress them into a
 *  profile.
 *
 * The subtypes form a hierarchy: asserting D1 implies D2 and D3, and
 * asserting D2 implies D3. resolveScope() encodes that expansion. What is
 * never gated: within-session context. Aria may always use what the user
 * said earlier in the same session; that is the operational coherence D1
 * explicitly permits.
 */

const VALID_SUBTYPES = ['d1', 'd2', 'd3'];

const REASONS = {
  d1: 'd1_session_scope',
  d2: 'd2_cross_session_scope',
  d3: 'd3_profile_scope',
};

/**
 * resolveScope({ gpc, scope })
 *
 * Bare GPC asserts the strictest subtype (D1), which implies the whole
 * hierarchy. A scope list expands downward: d1 implies d2 and d3, d2
 * implies d3.
 */
function resolveScope({ gpc = false, scope = [] } = {}) {
  const cleaned = scope.filter(s => VALID_SUBTYPES.includes(s));
  const seed = cleaned.length > 0 ? new Set(cleaned) : gpc ? new Set(['d1']) : new Set();

  const active = new Set(seed);
  if (active.has('d1')) {
    active.add('d2');
    active.add('d3');
  }
  if (active.has('d2')) {
    active.add('d3');
  }
  return active;
}

/**
 * endSession(session, memory, optouts)
 *
 * The D1 boundary. Clears the transient session context in every mode, then
 * either archives the transcript or discards it.
 */
function endSession(session, memory, optouts) {
  memory.clearContext();

  if (optouts.has('d1')) {
    memory.archive.incrementBlocked();
    return {
      checkpoint: 'session_end',
      subtype: 'D1',
      session_id: session.session_id,
      status: 'discarded',
      reason: REASONS.d1,
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
    subtype: 'D1',
    session_id: session.session_id,
    status: 'archived',
  };
}

/**
 * recallForSession(memory, optouts)
 *
 * The D2 boundary. Returns the facts from archived sessions that may inform
 * the new session, or nothing.
 */
function recallForSession(memory, optouts) {
  if (optouts.has('d2')) {
    return {
      checkpoint: 'session_start',
      subtype: 'D2',
      status: 'blocked',
      reason: REASONS.d2,
      archived_sessions_present: memory.archive.snapshot().entry_count,
      recalled_facts: {},
    };
  }

  const snap = memory.archive.snapshot();
  if (snap.entry_count === 0) {
    return {
      checkpoint: 'session_start',
      subtype: 'D2',
      status: 'nothing_to_recall',
      recalled_facts: {},
    };
  }

  const facts = Object.assign({}, ...snap.entries.map(e => e.facts));
  return {
    checkpoint: 'session_start',
    subtype: 'D2',
    status: 'recalled',
    recalled_facts: facts,
    from_sessions: snap.entries.map(e => e.session_id),
  };
}

/**
 * synthesizeProfile(candidate, memory, optouts)
 *
 * The D3 boundary. Either writes the behavioral model or refuses to compress
 * the archive into one.
 */
function synthesizeProfile(candidate, memory, optouts) {
  if (optouts.has('d3')) {
    memory.profile.incrementBlocked();
    return {
      checkpoint: 'profile_synthesis',
      subtype: 'D3',
      status: 'blocked',
      reason: REASONS.d3,
      would_have_synthesized: JSON.parse(JSON.stringify(candidate)),
    };
  }

  if (memory.archive.isEmpty()) {
    return {
      checkpoint: 'profile_synthesis',
      subtype: 'D3',
      status: 'nothing_to_synthesize',
    };
  }

  memory.profile.store(candidate);
  return {
    checkpoint: 'profile_synthesis',
    subtype: 'D3',
    status: 'synthesized',
    attributes: JSON.parse(JSON.stringify(candidate)),
  };
}

module.exports = {
  resolveScope,
  endSession,
  recallForSession,
  synthesizeProfile,
  VALID_SUBTYPES,
  REASONS,
};
