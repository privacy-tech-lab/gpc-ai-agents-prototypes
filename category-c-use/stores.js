'use strict';

/**
 * stores.js
 *
 * The downstream output stores of Category C, one per use surface. All
 * in-memory and created fresh per run via createOutputs() so tests stay
 * isolated. Each store counts blocked writes so runs can show what the
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

function createOutputs() {
  return {
    insurance_assessments: createLogStore(), // C1: same-platform reuse beyond the task
    personalization_profile: createLogStore(), // C1a
    analytics_log: createLogStore(), // C2
    ad_queue: createLogStore(), // C2a
    training_set: createLogStore(), // C3
    chain_transfers: createLogStore(), // C4
  };
}

function snapshotAll(outputs) {
  const snap = {};
  for (const [name, store] of Object.entries(outputs)) {
    snap[name] = store.snapshot();
  }
  return snap;
}

module.exports = { createOutputs, createLogStore, snapshotAll };
