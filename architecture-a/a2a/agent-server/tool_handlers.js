require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '..', '.env') });

const fs = require('fs');
const path = require('path');
const { searchPublisher } = require('../../../core/tavily');

const OUTPUT_DIR   = path.join(__dirname, '..', 'output');
const LOG_FILE     = path.join(OUTPUT_DIR, 'interaction_log.jsonl');
const PROFILE_FILE = path.join(OUTPUT_DIR, 'profiles.json');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function loadProfiles() {
  if (!fs.existsSync(PROFILE_FILE)) return {};
  return JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8'));
}

function saveProfiles(profiles) {
  fs.writeFileSync(PROFILE_FILE, JSON.stringify(profiles, null, 2));
}

// --- Operation implementations (raw, no GPC logic here) ---

async function user_profile_lookup({ user_id }) {
  const profiles = loadProfiles();
  const profile = profiles[user_id] ?? null;
  return { user_id, profile, found: profile !== null };
}

async function save_to_profile({ user_id, data }) {
  const profiles = loadProfiles();
  profiles[user_id] = { ...(profiles[user_id] ?? {}), ...data, updatedAt: new Date().toISOString() };
  saveProfiles(profiles);
  return { user_id, saved: true };
}

async function log_interaction({ user_id, query, response_summary }) {
  const entry = { user_id, query, response_summary, timestamp: new Date().toISOString() };
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  return { logged: true, entry };
}

async function search_web({ query }) {
  const live = await searchPublisher(query, {
    maxResults: 5,
    onError: (err) => process.stderr.write(`[search_web] Tavily error: ${err.message}, falling back to local results\n`),
  });
  if (live && live.results.length > 0) {
    const results = live.results.map((r) => ({
      title:   r.title,
      snippet: r.content,
      url:     r.url,
    }));
    return { query, results, source: live.source === 'tavily_fixture' ? 'tavily_fixture' : 'tavily' };
  }

  // Rich static fallback for the Japan trip planning demo scenario
  const results = [
    {
      title:   'Classic Japan 5-Day Itinerary: Tokyo, Kyoto, and Osaka',
      snippet: 'The most popular first-trip route covers three cities. Days 1–2: Tokyo — Shinjuku, Shibuya crossing, Senso-ji temple in Asakusa, teamLab digital art. Day 3: Kyoto by Shinkansen (2h 15min) — Fushimi Inari shrine, Arashiyama bamboo grove, Nishiki Market. Day 4: Kyoto — Kinkaku-ji (Golden Pavilion), Gion district for geisha spotting at dusk. Day 5: Osaka for street food — Dotonbori, Kuromon Ichiba market, takoyaki and okonomiyaki, then fly home from KIX or return to Tokyo via Shinkansen.',
      url:     'https://www.japan-guide.com/e/e2400.html',
    },
    {
      title:   'Japan Rail Pass: What It Covers and Whether It\'s Worth It',
      snippet: 'A 7-day JR Pass (≈¥50,000 / ~$330 USD) covers all JR Shinkansen lines including Tokyo–Kyoto–Osaka, JR local trains, and some ferries. Buy before leaving your home country — it cannot be purchased in Japan. If you\'re only doing Tokyo → Kyoto → Osaka → Tokyo, a single round-trip Shinkansen costs roughly ¥27,000 each way, so the pass pays off only if you add a side trip (Hiroshima + Miyajima is a popular one-day detour from Kyoto). IC cards (Suica or ICOCA) handle subway and local buses not covered by JR.',
      url:     'https://www.japanrailpass.net/',
    },
    {
      title:   'What to Eat in Japan: A First-Timer\'s Food Guide',
      snippet: 'Must-eat dishes by city: Tokyo — tsukiji outer market sushi, ramen at a local shop (Ichiran for solo dining), conveyor-belt sushi, tonkatsu. Kyoto — kaiseki multi-course meal (budget ¥5,000–¥15,000), matcha everything, tofu-based shojin ryori. Osaka — takoyaki (octopus balls), okonomiyaki (savory pancake), kushikatsu (fried skewers), yakitori. Across Japan — convenience store onigiri (7-Eleven level is surprisingly good), vending machine hot coffee, and seasonal wagashi sweets at any temple gate.',
      url:     'https://www.japan-guide.com/e/e2036.html',
    },
    {
      title:   'Best Time to Visit Japan + Booking Tips',
      snippet: 'Cherry blossom season (late March–early April) and autumn foliage (mid-November) are peak periods — book accommodation 3–6 months ahead and expect 20–30% price premiums. Shoulder seasons (May–June, September–October) offer mild weather, fewer crowds, and lower prices. Golden Week (late April–early May) is a Japanese national holiday week — domestic travel surges, many locals vacation, accommodation sells out. Winter (December–February) is underrated: fewer tourists, stable prices, and some Shinkansen routes have snow scenery.',
      url:     'https://www.japan-guide.com/e/e2273.html',
    },
    {
      title:   'Japan Travel Practicalities: Money, SIM, and Getting Around',
      snippet: 'Cash: Japan is still heavily cash-based. 7-Eleven ATMs reliably accept foreign cards; withdraw yen on arrival. Cards are becoming more accepted in cities but many ryokan, small restaurants, and shrines are cash-only. SIM/Wi-Fi: buy a pocket Wi-Fi or data SIM at the airport (IIJmio, HIS Mobile offer good rates). IC card: load a Suica or ICOCA card at any station — works on subways, buses, and even at convenience stores. Etiquette: no eating while walking, keep phones on silent on trains, remove shoes before entering traditional accommodations.',
      url:     'https://www.japan-guide.com/e/e2201.html',
    },
  ];
  return { query, results, source: 'local' };
}

module.exports = { user_profile_lookup, save_to_profile, log_interaction, search_web };
