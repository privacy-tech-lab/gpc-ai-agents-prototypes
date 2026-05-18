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
  // Simulated search — not GPC-sensitive (no personal data involved)
  const results = [
    { title: `Overview of "${query}"`, snippet: `Key findings about ${query} as of 2025...` },
    { title: `${query}: recent research`, snippet: `Researchers have found that ${query} impacts...` },
  ];
  return { query, results };
}

module.exports = { user_profile_lookup, save_to_profile, log_interaction, search_web };
