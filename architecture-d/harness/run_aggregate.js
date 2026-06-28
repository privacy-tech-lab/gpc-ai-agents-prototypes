/**
 * Aggregate run: 80-user simulation; mixed GPC; varied queries.
 * Demonstrates the cross-user derivations that fall out of provider
 * visibility — adoption rate, topic-by-GPC matrix, publisher reach.
 * Deterministic via a seeded mulberry32 PRNG so repeated runs produce
 * identical figures for paper artifacts.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const fs   = require('fs');
const path = require('path');
const { createProvider }   = require('../provider/provider');
const { fanoutAll }        = require('../orchestrator/orchestrator');
const {
  gpcAdoptionRate, topicDistribution, publisherReach, topicByGpcMatrix,
} = require('../provider/aggregation');

const OUTPUT = path.join(__dirname, '..', 'output', 'aggregate_result.json');

// ── Deterministic PRNG ───────────────────────────────────────────────────────
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

  console.log(`Running aggregate (${USER_COUNT} users; mixed GPC; seed=${SEED})...\n`);

  for (let i = 0; i < USER_COUNT; i++) {
    const userId  = `user-${String(i).padStart(3, '0')}`;
    const gpc     = rand() < GPC_ADOPTION_TARGET ? 1 : 0;
    const qCount  = 1 + Math.floor(rand() * 3);
    for (let q = 0; q < qCount; q++) {
      const query = TOPICS[Math.floor(rand() * TOPICS.length)];
      await fanoutAll(provider, userId, query, { gpc });
    }
  }

  const providerView = provider.getProviderView();
  const out = {
    mode:                            'aggregate',
    description:                     `${USER_COUNT}-user simulation; mixed GPC; deterministic seed=${SEED}.`,
    log_size:                        providerView.length,
    configured_gpc_adoption_target:  GPC_ADOPTION_TARGET,
    derivations: {
      measured_gpc_adoption_rate: gpcAdoptionRate(providerView),
      topic_distribution:         topicDistribution(providerView),
      topic_by_gpc:               topicByGpcMatrix(providerView),
      publisher_reach:            publisherReach(providerView),
    },
    structural_finding: 'These cross-user derivations are computable only at the provider. They do not exist for any single site, and they have no precedent in the browser model where no single intermediary sees the union of user traffic across destinations.',
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2));

  console.log('[Aggregate derivations]');
  console.log('  log_size                  :', out.log_size);
  console.log('  measured_gpc_adoption_rate:', out.derivations.measured_gpc_adoption_rate);
  console.log('  topics                    :', Object.keys(out.derivations.topic_distribution).join(', '));
  console.log('\nOutput written to:', OUTPUT);
}

main().catch((err) => { console.error(err); process.exit(1); });
