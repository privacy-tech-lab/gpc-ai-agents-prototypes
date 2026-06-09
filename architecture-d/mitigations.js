'use strict';

/**
 * E2 commitments — provider-side data-handling constraints.
 *
 * These do not change what the provider can see (visibility is
 * structural and unaffected by the protocol). They constrain what the
 * provider does with what it sees: train, log per-user, publish
 * aggregates. The architecture demonstrates these as the lever the
 * spec has for E, since the visibility itself cannot be designed away.
 */

/**
 * Tag every observation with a do-not-train flag. The flag is advisory
 * inside the provider's own pipeline — there is no protocol-level way
 * for the user to verify it was honored.
 */
function noTrainCommitment() {
  return {
    name: 'no_train',
    apply(observation) {
      return { ...observation, do_not_train: true };
    },
  };
}

/**
 * k-anonymity at log time: suppress the user_id field until the
 * provider has seen at least `k` distinct users sharing the same topic.
 * Simplified — real k-anon is more nuanced — but it captures the lever.
 */
function kAnonymity(k = 5) {
  const topic_users = new Map();
  return {
    name: `k_anon_${k}`,
    apply(observation) {
      const t = observation.query_topic;
      if (!topic_users.has(t)) topic_users.set(t, new Set());
      topic_users.get(t).add(observation.user_id);
      const cohort_size = topic_users.get(t).size;
      if (cohort_size < k) {
        return {
          ...observation,
          user_id: '<suppressed>',
          k_anon_suppressed: true,
          cohort_size,
        };
      }
      return { ...observation, k_anon_suppressed: false, cohort_size };
    },
  };
}

/**
 * Differential-privacy noise for aggregate publication. Per-observation
 * passes through unchanged; the `noise` method is invoked at aggregate
 * time. Laplace mechanism with scale 1/epsilon.
 */
function dpNoise(epsilon = 1.0) {
  return {
    name: `dp_eps_${epsilon}`,
    epsilon,
    apply(observation) { return observation; },
    noise(value) {
      const u = Math.random() - 0.5;
      return value - Math.sign(u) * (1 / epsilon) * Math.log(1 - 2 * Math.abs(u));
    },
  };
}

/**
 * Compose a chain. `apply` runs left-to-right; `noise` delegates to the
 * first member that provides one.
 */
function chain(...mitigations) {
  return {
    name: mitigations.map(m => m.name).join('+'),
    apply(observation) {
      return mitigations.reduce((acc, m) => m.apply(acc), observation);
    },
    noise(value) {
      const dp = mitigations.find(m => m.noise);
      return dp ? dp.noise(value) : value;
    },
  };
}

module.exports = { noTrainCommitment, kAnonymity, dpNoise, chain };
