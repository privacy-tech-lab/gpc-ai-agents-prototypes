'use strict';

/**
 * Presence manifest: the user's standing decisions about AI presence.
 *
 * Two independent controls, matching the two subtypes of Category A:
 *  - enabled_ai_features / declined_ai_features (A1, integration): which AI
 *    features the user has affirmatively turned on. Anything not enabled is
 *    off by default, no matter what the platform ships.
 *  - ambient_enabled (A2, activation): whether AI may run passively at all.
 *    Off by default. Only an explicit settings change flips it.
 */

const fs = require('fs');
const path = require('path');

const MANIFEST_PATH = path.join(__dirname, 'presence_manifest.json');

const SEED = {
  manifest_version: 'v1.0',
  enabled_ai_features: [],
  declined_ai_features: [],
  ambient_enabled: false,
  decided_at: {},
};

function load() {
  if (!fs.existsSync(MANIFEST_PATH)) save(JSON.parse(JSON.stringify(SEED)));
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

function save(manifest) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
}

function reset() {
  save(JSON.parse(JSON.stringify(SEED)));
  return load();
}

function isEnabled(featureName, manifest = load()) {
  return manifest.enabled_ai_features.includes(featureName);
}

function isDeclined(featureName, manifest = load()) {
  return manifest.declined_ai_features.includes(featureName);
}

function enable(featureName, newVersion) {
  const manifest = load();
  if (!manifest.enabled_ai_features.includes(featureName)) {
    manifest.enabled_ai_features.push(featureName);
  }
  manifest.declined_ai_features = manifest.declined_ai_features.filter(f => f !== featureName);
  manifest.decided_at[featureName] = new Date().toISOString();
  if (newVersion) manifest.manifest_version = newVersion;
  save(manifest);
  return manifest;
}

function decline(featureName, newVersion) {
  const manifest = load();
  if (!manifest.declined_ai_features.includes(featureName)) {
    manifest.declined_ai_features.push(featureName);
  }
  manifest.enabled_ai_features = manifest.enabled_ai_features.filter(f => f !== featureName);
  manifest.decided_at[featureName] = new Date().toISOString();
  if (newVersion) manifest.manifest_version = newVersion;
  save(manifest);
  return manifest;
}

function setAmbient(enabled) {
  const manifest = load();
  manifest.ambient_enabled = Boolean(enabled);
  manifest.decided_at.ambient_mode = new Date().toISOString();
  save(manifest);
  return manifest;
}

module.exports = { load, save, reset, isEnabled, isDeclined, enable, decline, setAmbient };
