'use strict';

require('dotenv').config();

/**
 * Mode: aggregate — multi-user simulation.
 *
 * Sweeps a population of users with mixed GPC state and varied queries.
 * Demonstrates the cross-user derivations only the provider can compute:
 * GPC adoption rate, topic-by-GPC matrix, publisher reach. None of these
 * exist for any single site, and none have a precedent in the browser
 * model where no single intermediary sees the union of user traffic
 * across destinations.
 *
 * Deterministic via a fixed seed so repeated runs produce identical
 * derivations for paper figures.
 */

const { createProvider } = require('./provider');
const { fanoutAll }       = require('./orchestrator');
const {
  gpcAdoptionRate, topicDistribution, publisherReach, topicByGpcMatrix,
} = require('./aggregation');

// --- Deterministic PRNG (mulberry32) for reproducible aggregate figures ---
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 42;
const rand = mulberry32(SEED);

const TOPICS = [
  'iPhone 17 review',
  'MacBook Pro 2026 vs ThinkPad',
  'Sony WH-1000 vs Bose QuietComfort',
  'Sigma 18mm vs Tamron review',
  'Pixel Watch 4 battery life',
  'Android flagship comparison',
  'best laptops 2026',
  'gaming headphones review',
];

const USER_COUNT          = 80;
const GPC_ADOPTION_TARGET = 0.40;

async function main() {
  const provider = createProvider();

  for (let i = 0; i < USER_COUNT; i++) {
    const user_id = `user-${String(i).padStart(3, '0')}`;
    const gpc     = rand() < GPC_ADOPTION_TARGET ? 1 : 0;
    const q_count = 1 + Math.floor(rand() * 3);
    for (let q = 0; q < q_count; q++) {
      const query = TOPICS[Math.floor(rand() * TOPICS.length)];
      await fanoutAll(provider, user_id, query, { gpc });
    }
  }

  const provider_view = provider.getProviderView();

  const out = {
    mode: 'aggregate',
    description: `${USER_COUNT}-user simulation; mixed GPC; varied queries; deterministic seed=${SEED}.`,
    log_size: provider_view.length,
    configured_gpc_adoption_target: GPC_ADOPTION_TARGET,
    derivations: {
      measured_gpc_adoption_rate: gpcAdoptionRate(provider_view),
      topic_distribution:         topicDistribution(provider_view),
      topic_by_gpc:               topicByGpcMatrix(provider_view),
      publisher_reach:            publisherReach(provider_view),
    },
    structural_finding: 'Per-call GPC enforcement at sites does not constrain these derivations. They are derivable only at the provider, and only because the provider sits at a chokepoint that does not exist in the browser model.',
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
