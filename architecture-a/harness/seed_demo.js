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
const VECTOR_FILE   = path.join(OUTPUT, 'vector_store.json');

// ── Existing profile for user-42 ─────────────────────────────────────────────
const profiles = {
  'user-42': {
    interests:       ['privacy', 'data protection', 'AI ethics', 'browser security'],
    region:          'California',
    expertise_level: 'intermediate',
    previousQueries: [
      'What is GDPR and how does it differ from CCPA?',
      'How does browser fingerprinting work?',
      'Best privacy-focused browsers 2025',
      'What are the best privacy browser extensions?',
    ],
    last_query:   'What are the best privacy browser extensions?',
    last_summary: 'Top privacy browser extensions: uBlock Origin (ad/tracker blocking), Privacy Badger (adaptive tracking protection), HTTPS Everywhere (enforces TLS). Together these tools significantly reduce third-party data collection and cross-site tracking.',
    updatedAt:    '2026-05-10T14:23:00.000Z',
  },
};

// ── Past interactions ─────────────────────────────────────────────────────────
const interactions = [
  {
    user_id:           'user-42',
    query:             'What is GDPR and how does it differ from CCPA?',
    response_summary:  'GDPR (EU) requires opt-in consent and applies globally for EU residents. CCPA (California) offers opt-out rights rather than opt-in consent. Key differences: GDPR has broader scope, stricter consent requirements, and higher fines (up to 4% of global annual revenue). CCPA applies to for-profit businesses meeting revenue/data thresholds.',
    timestamp:         '2026-04-08T10:15:00.000Z',
  },
  {
    user_id:           'user-42',
    query:             'How does browser fingerprinting work?',
    response_summary:  'Browser fingerprinting identifies users by collecting device/browser characteristics: screen resolution, installed fonts, WebGL renderer, canvas rendering, timezone, language, and plugin list. This combination is often unique enough to identify individuals without cookies. Unlike cookies, fingerprints cannot be cleared and persist across private browsing sessions.',
    timestamp:         '2026-04-22T11:30:00.000Z',
  },
  {
    user_id:           'user-42',
    query:             'Best privacy-focused browsers 2025',
    response_summary:  'Leading privacy browsers: Firefox (enhanced tracking protection, large ecosystem), Brave (built-in ad/tracker blocking, fingerprint randomization), Tor Browser (onion routing, maximum anonymity). For daily use, Brave or Firefox with uBlock Origin offer the best privacy-usability balance.',
    timestamp:         '2026-05-02T16:45:00.000Z',
  },
  {
    user_id:           'user-42',
    query:             'What are the best privacy browser extensions?',
    response_summary:  'Top privacy extensions: uBlock Origin (blocks ads and trackers), Privacy Badger (adaptive tracker blocking), HTTPS Everywhere (enforces TLS). Advanced options: NoScript (JavaScript origin control), Decentraleyes (local CDN resources to prevent tracking).',
    timestamp:         '2026-05-10T14:23:00.000Z',
  },
];

// ── Past vector store entries ─────────────────────────────────────────────────
const vectorStore = [
  {
    user_id:  'user-42',
    content:  'User researched GDPR vs CCPA. Located in California — CCPA applies directly. Interested in understanding legal bases for data processing across jurisdictions.',
    storedAt: '2026-04-08T10:15:00.000Z',
  },
  {
    user_id:  'user-42',
    content:  'User researched browser fingerprinting techniques. Intermediate expertise. Concerned about persistent tracking that bypasses cookie deletion.',
    storedAt: '2026-04-22T11:30:00.000Z',
  },
  {
    user_id:  'user-42',
    content:  'User interested in privacy browser comparison. Prefers balance of privacy and usability; not using Tor for daily browsing. Likely migrating from Chrome.',
    storedAt: '2026-05-02T16:45:00.000Z',
  },
  {
    user_id:  'user-42',
    content:  'User actively uses privacy browser extensions. Likely runs Firefox or Brave with uBlock Origin. Interested in tracking-protection mechanisms at the extension layer.',
    storedAt: '2026-05-10T14:23:00.000Z',
  },
];

fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2));
fs.writeFileSync(VECTOR_FILE,   JSON.stringify(vectorStore, null, 2));
fs.writeFileSync(LOG_FILE,      interactions.map((e) => JSON.stringify(e)).join('\n') + '\n');

console.log('Demo data seeded for user-42:');
console.log('  profiles.json          — profile with 4 past queries and interests');
console.log('  interaction_log.jsonl  — 4 past interactions');
console.log('  vector_store.json      — 4 past vendor-side entries');
