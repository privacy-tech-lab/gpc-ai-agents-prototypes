'use strict';

/**
 * memory_store.js
 *
 * The three memory layers of Category D, created fresh per run via
 * createMemory() so tests stay isolated.
 *
 *  sessionContext: transient, per-session working memory. Never gated;
 *      cleared when the session ends in every mode.
 *  archive: transcripts that survived a session end (the D1 boundary).
 *  profile: the behavioral model synthesized across sessions (the D3
 *      boundary).
 *
 * Each persistent layer counts blocked writes so runs can show what the
 * opt-out stopped.
 */

function createLogStore() {
  const entries = [];
  let blocked_count = 0;

  function store(entry) {
    entries.push(JSON.parse(JSON.stringify(entry)));
  }

  function incrementBlocked() {
    blocked_count += 1;
  }

  function snapshot() {
    return {
      entries: JSON.parse(JSON.stringify(entries)),
      entry_count: entries.length,
      blocked_count,
    };
  }

  function isEmpty() {
    return entries.length === 0;
  }

  return { store, incrementBlocked, snapshot, isEmpty };
}

function createMemory() {
  let sessionContext = {};

  return {
    archive: createLogStore(),
    profile: createLogStore(),

    // Transient working memory for the active session. Never gated.
    setContext(key, value) {
      sessionContext[key] = JSON.parse(JSON.stringify(value));
    },
    getContext() {
      return JSON.parse(JSON.stringify(sessionContext));
    },
    clearContext() {
      sessionContext = {};
    },
  };
}

module.exports = { createMemory, createLogStore };
