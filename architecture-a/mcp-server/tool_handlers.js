const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'output', 'interaction_log.jsonl');
const PROFILE_FILE = path.join(__dirname, '..', 'output', 'profiles.json');

function loadProfiles() {
  if (!fs.existsSync(PROFILE_FILE)) return {};
  return JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8'));
}

function saveProfiles(profiles) {
  fs.writeFileSync(PROFILE_FILE, JSON.stringify(profiles, null, 2));
}

// --- Tool implementations (raw, no GPC logic here) ---

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
  const apiKey = process.env.TAVILY_API_KEY;
  if (apiKey) {
    try {
      const resp = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, query, search_depth: 'basic', max_results: 5 }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const results = (data.results ?? []).map((r) => ({
          title:   r.title,
          snippet: r.content,
          url:     r.url,
        }));
        return { query, results, source: 'tavily' };
      }
    } catch (err) {
      process.stderr.write(`[search_web] Tavily error: ${err.message} — falling back to local results\n`);
    }
  }

  // Rich static fallback — substantive enough for the model to produce a real synthesis
  const results = [
    {
      title:   'Global Privacy Control (GPC): Technical Overview',
      snippet: 'Global Privacy Control (GPC) is a browser-level privacy signal transmitted as the HTTP header Sec-GPC: 1 or exposed via the navigator.globalPrivacyControl JavaScript property. It communicates a user\'s preference to opt out of the sale or sharing of personal data. GPC is legally recognized as a valid opt-out mechanism under the California Consumer Privacy Act (CCPA), the California Privacy Rights Act (CPRA), Colorado\'s Consumer Privacy Act, and Connecticut\'s Data Privacy Act.',
      url:     'https://globalprivacycontrol.org/',
    },
    {
      title:   'How GPC Works in Browsers and Agentic AI Systems',
      snippet: 'When a user enables GPC in a participating browser (Firefox, Brave, DuckDuckGo Privacy Browser) or privacy extension, Sec-GPC: 1 is attached to every outbound HTTP request automatically. Recipients must treat it as equivalent to a manual "Do Not Sell or Share" opt-out — no additional consent banner interaction required. In multi-agent AI systems the signal must propagate through orchestrator and sub-agent layers; current standards do not yet explicitly require this propagation.',
      url:     'https://privacycg.github.io/gpc-spec/',
    },
    {
      title:   'GPC Legal Recognition: CCPA, CPRA, and State Laws',
      snippet: 'The California Privacy Protection Agency (CPPA) confirmed that GPC is a valid universal opt-out signal under CCPA/CPRA. Colorado\'s CPA explicitly mandates that businesses honor universal opt-out signals by July 2024. Connecticut\'s CTDPA includes equivalent provisions. The FTC has signaled interest in treating GPC non-compliance as an unfair or deceptive trade practice under Section 5 of the FTC Act.',
      url:     'https://cppa.ca.gov/regulations/gpc.html',
    },
    {
      title:   'GPC in Multi-Agent AI Pipelines: Propagation and Enforcement Challenges',
      snippet: 'A central open problem in AI governance is ensuring that privacy signals like GPC survive delegation across multi-agent systems. An orchestrator that receives a GPC signal must pass it to sub-agents and downstream tool servers — even across trust boundaries such as third-party vendor APIs. Without a specification-level propagation requirement, an intermediate agent can silently strip the signal, causing data writes to proceed despite the user\'s opt-out. Cryptographic approaches (JWTs carrying a signed gpc claim) provide a trust-boundary backstop independent of metadata forwarding.',
      url:     'https://arxiv.org/abs/gpc-agents',
    },
    {
      title:   'Implementing GPC: Developer Reference',
      snippet: 'To honor GPC: check the Sec-GPC HTTP request header or navigator.globalPrivacyControl. If 1 or true, do not sell or share personal data to third parties, do not use cross-context behavioral advertising, and document GPC handling in your privacy policy. For AI systems, extend enforcement to MCP _meta fields and agent task envelopes. The GPC spec (.well-known/gpc.json) lets sites declare their support status.',
      url:     'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Sec-GPC',
    },
  ];
  return { query, results, source: 'local' };
}

module.exports = { user_profile_lookup, save_to_profile, log_interaction, search_web };
