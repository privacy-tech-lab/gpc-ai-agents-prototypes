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
  // Simulated search results — substantive enough for a model to reason about
  const results = [
    {
      title: 'Global Privacy Control (GPC): Technical Overview',
      snippet: 'Global Privacy Control (GPC) is a privacy signal transmitted as an HTTP header (Sec-GPC: 1) that communicates a user\'s preference to opt out of the sale or sharing of their personal data. It is recognized as a legally valid opt-out signal under the California Consumer Privacy Act (CCPA), the California Privacy Rights Act (CPRA), and similar laws in Colorado and Connecticut.',
    },
    {
      title: 'How GPC Works in Browsers and Applications',
      snippet: 'When a user enables GPC in a participating browser or privacy extension, the signal is attached automatically to every outbound HTTP request. Websites and services receiving the signal are required by law to treat it as equivalent to a user manually opting out of data sale and targeted advertising, without requiring the user to interact with a consent banner.',
    },
    {
      title: 'GPC in Agentic AI Pipelines: Open Research Questions',
      snippet: 'Recent work explores how GPC signals should propagate through multi-agent AI systems. Unlike single-page web requests, AI pipelines involve orchestrators, sub-agents, and third-party tool servers across multiple trust boundaries. Key open questions include how the signal survives delegation across agents, how it is enforced at the data layer, and how it is verified at vendor service boundaries.',
    },
  ];
  return { query, results };
}

module.exports = { user_profile_lookup, save_to_profile, log_interaction, search_web };
