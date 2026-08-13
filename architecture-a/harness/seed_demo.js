/**
 * Seed demo output files with realistic user-42 history.
 *
 * Run this before an AI demo run so that:
 *  - Baseline: user_profile_lookup returns real history the model can reference
 *  - GPC run:  the blocked responses contrast clearly against the baseline
 *
 * Safe to re-run — overwrites previous state.
 */

const fs   = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'output');
if (!fs.existsSync(OUTPUT)) fs.mkdirSync(OUTPUT, { recursive: true });

const PROFILES_FILE = path.join(OUTPUT, 'profiles.json');
const LOG_FILE      = path.join(OUTPUT, 'interaction_log.jsonl');

// ── Existing profile for user-42 ─────────────────────────────────────────────
const profiles = {
  'user-42': {
    interests:       ['travel', 'food', 'Asia', 'culture', 'photography'],
    region:          'San Francisco, CA',
    travel_style:    'mid-range, culture-focused, solo or couple',
    previousQueries: [
      'Best street food markets in Bangkok',
      'What\'s the best time of year to visit Southeast Asia?',
      'How to get around Tokyo on public transit',
      'Affordable ryokan stays in Kyoto',
    ],
    last_query:   'Affordable ryokan stays in Kyoto',
    last_summary: 'Budget-friendly ryokan options in Kyoto include Piece Hostel Kyoto (dorms and private rooms from ¥3,500), Guesthouse Soi (near Fushimi Inari, ¥4,500/night private), and Kyoto Utano Youth Hostel (scenic, ¥4,200/night). Book 2–3 months ahead for peak cherry blossom and fall foliage seasons.',
    updatedAt:    '2026-05-01T09:45:00.000Z',
  },
};

// ── Past interactions ─────────────────────────────────────────────────────────
const interactions = [
  {
    user_id:           'user-42',
    query:             'Best street food markets in Bangkok',
    response_summary:  'Top Bangkok street food markets: Or Tor Kor Market (upscale, near Chatuchak) for fresh fruit and prepared dishes; Yaowarat Road (Chinatown) for roast duck, dim sum, and mango sticky rice after dark; Chatuchak Weekend Market for pad thai and boat noodles; Or Kor Market near Victory Monument for local worker lunch spots. Best visited in the evening when it\'s cooler.',
    timestamp:         '2026-03-12T14:20:00.000Z',
  },
  {
    user_id:           'user-42',
    query:             'What\'s the best time of year to visit Southeast Asia?',
    response_summary:  'Best time varies by country. Thailand: November–February (cool, dry). Vietnam: varies by region — north is best October–April, south is November–April. Indonesia/Bali: April–October (dry season). Avoid Southeast Asia broadly during monsoon season (May–October) unless you\'re targeting specific microclimates. November–February is the safest window for a multi-country trip.',
    timestamp:         '2026-03-28T11:00:00.000Z',
  },
  {
    user_id:           'user-42',
    query:             'How to get around Tokyo on public transit',
    response_summary:  'Tokyo transit: get a Suica or Pasmo IC card at any major station — works on subways, JR lines, buses, and even convenience stores. The Tokyo Metro Day Pass (¥600) covers all metro lines but not JR. Google Maps is reliable for routing. Avoid rush hour (7:30–9:30am, 5:30–8pm) on the Yamanote line. Taxis are expensive (¥700–¥1,000 base fare) — use for late nights when trains stop around midnight.',
    timestamp:         '2026-04-10T16:30:00.000Z',
  },
  {
    user_id:           'user-42',
    query:             'Affordable ryokan stays in Kyoto',
    response_summary:  'Budget-friendly ryokan options in Kyoto include Piece Hostel Kyoto (dorms and private rooms from ¥3,500), Guesthouse Soi (near Fushimi Inari, ¥4,500/night private), and Kyoto Utano Youth Hostel (scenic, ¥4,200/night). Book 2–3 months ahead for peak cherry blossom and fall foliage seasons.',
    timestamp:         '2026-05-01T09:45:00.000Z',
  },
];

fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2));
fs.writeFileSync(LOG_FILE,      interactions.map((e) => JSON.stringify(e)).join('\n') + '\n');

console.log('Demo data seeded for user-42 (travel enthusiast, SF-based):');
console.log('  profiles.json          — profile with Asia travel history and preferences');
console.log('  interaction_log.jsonl  — 4 past travel research interactions');
