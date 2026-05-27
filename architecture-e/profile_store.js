'use strict';

/**
 * profile_store.js
 *
 * In-memory shadow profile that accumulates inferred attributes over the course
 * of a session.  A new store is created for each run via createProfileStore() so
 * tests are fully isolated.
 *
 * The store tracks:
 *   attributes    — key/value map of everything the inference engine has derived
 *   blocked_count — how many inference attempts were intercepted by the firewall
 *
 * Design note: the store is deliberately simple — no persistence between runs —
 * because Architecture E's point is to show what accumulates *within* a session
 * when B3 is off vs. what is suppressed when B3 is on.
 */

function createProfileStore() {
  let attributes = {};
  let blocked_count = 0;

  /**
   * write(attrs)
   *
   * Merges a flat or nested attributes object into the profile.
   * Arrays are concatenated; scalars are overwritten.
   *
   * @param {object} attrs
   */
  function write(attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (Array.isArray(value)) {
        if (Array.isArray(attributes[key])) {
          // Merge arrays without duplicates
          const merged = new Set([...attributes[key], ...value]);
          attributes[key] = [...merged];
        } else {
          attributes[key] = [...value];
        }
      } else {
        attributes[key] = value;
      }
    }
  }

  /**
   * incrementBlocked()
   *
   * Records that one inference attempt was stopped by the firewall.
   */
  function incrementBlocked() {
    blocked_count += 1;
  }

  /**
   * snapshot()
   *
   * Returns a point-in-time copy of the current profile state.
   *
   * @returns {{ attributes: object, blocked_count: number }}
   */
  function snapshot() {
    return {
      attributes: JSON.parse(JSON.stringify(attributes)),
      blocked_count,
    };
  }

  /**
   * isEmpty()
   *
   * Returns true when no attributes have been written.
   *
   * @returns {boolean}
   */
  function isEmpty() {
    return Object.keys(attributes).length === 0;
  }

  /**
   * attributeCount()
   *
   * Returns the number of top-level keys currently in the profile.
   *
   * @returns {number}
   */
  function attributeCount() {
    return Object.keys(attributes).length;
  }

  return { write, incrementBlocked, snapshot, isEmpty, attributeCount };
}

module.exports = { createProfileStore };
