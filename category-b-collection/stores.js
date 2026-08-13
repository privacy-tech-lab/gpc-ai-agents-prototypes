'use strict';

/**
 * stores.js
 *
 * The three collection stores of Category B, one per subtype. All in-memory
 * and created fresh per run via createStores() so tests stay isolated.
 *
 *  inputLog       (B1): raw user submissions the platform retains.
 *  behaviorLog    (B2): passively generated telemetry the platform records.
 *  derivedProfile (B3): inferences the platform writes about the user.
 *
 * Each store counts suppressed writes so runs can show what the opt-out
 * stopped, not just an empty store.
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

function createProfileStore() {
  let attributes = {};
  let blocked_count = 0;

  // Merges a flat attributes object into the profile. Arrays are merged
  // without duplicates; scalars are overwritten.
  function write(attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (Array.isArray(value)) {
        if (Array.isArray(attributes[key])) {
          attributes[key] = [...new Set([...attributes[key], ...value])];
        } else {
          attributes[key] = [...value];
        }
      } else {
        attributes[key] = value;
      }
    }
  }

  function incrementBlocked() {
    blocked_count += 1;
  }

  function snapshot() {
    return {
      attributes: JSON.parse(JSON.stringify(attributes)),
      attribute_count: Object.keys(attributes).length,
      blocked_count,
    };
  }

  function isEmpty() {
    return Object.keys(attributes).length === 0;
  }

  return { write, incrementBlocked, snapshot, isEmpty };
}

function createStores() {
  return {
    inputLog: createLogStore(),
    behaviorLog: createLogStore(),
    derivedProfile: createProfileStore(),
  };
}

module.exports = { createStores, createLogStore, createProfileStore };
