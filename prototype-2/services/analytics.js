/**
 * Analytics logging pipeline (secondary purpose: "analytics").
 *
 * In a real system this would push to a log aggregator / event bus.
 * Here it appends to a local JSON file so the demo is inspectable.
 */
const fs = require('fs');
const path = require('path');
const { withPurposeCheck } = require('../lib/withPurposeCheck');
const { RESTRICTABLE_PURPOSES_SET } = require('../lib/purposeRegistry');

const LOG_FILE = path.join(__dirname, '..', 'output', 'analytics_log.json');
fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });

function loadLog() {
  if (!fs.existsSync(LOG_FILE)) return [];
  return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
}

function saveLog(entries) {
  fs.writeFileSync(LOG_FILE, JSON.stringify(entries, null, 2));
}

async function _writeAnalyticsEntry({ patient_id, query }) {
  const entry = {
    patient_id,
    query,
    loggedAt: new Date().toISOString(),
  };
  const log = loadLog();
  log.push(entry);
  saveLog(log);
  return entry;
}

const logInteraction = withPurposeCheck(_writeAnalyticsEntry, {
  purpose: 'analytics',
  registry: RESTRICTABLE_PURPOSES_SET,
  layer: 'analytics_pipeline',
});

module.exports = { logInteraction, loadLog };
