'use strict';

/**
 * inference_engine.js
 *
 * The inference engine takes the output of query_classifier and writes the
 * derived attributes into the profile store.
 *
 * In a real system this module would call an embedding model, a named-entity
 * recogniser, or a rules-based tagger.  Here it is a thin pass-through that
 * trusts the classifier's output — the point of Architecture E is what happens
 * *around* this step (the firewall), not the classifier itself.
 *
 * derive(query, classifiedAttrs, store)
 *
 *   Writes classifiedAttrs.inferred_attributes into the provided profile store
 *   and returns a record describing what was written.
 *
 * Returns:
 *   {
 *     status:     'derived',
 *     query:      string,
 *     attributes: object   // the attributes that were written
 *   }
 */

function derive(query, classifiedAttrs, store) {
  const { inferred_attributes } = classifiedAttrs;
  store.write(inferred_attributes);
  return {
    status: 'derived',
    query,
    attributes: JSON.parse(JSON.stringify(inferred_attributes)),
  };
}

module.exports = { derive };
