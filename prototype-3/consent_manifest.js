'use strict';

const fs = require('fs');
const path = require('path');
const { isNewerThan } = require('./tool_registry');

const MANIFEST_PATH = path.join(__dirname, 'consent_manifest.json');

const SEED = {
  manifest_version: 'v1.0',
  approved_categories: ['file_access', 'external_api'],
  declined_categories: [],
  consented_at: {
    file_access: '2026-01-15T00:00:00.000Z',
    external_api: '2026-01-15T00:00:00.000Z',
  },
};

function load() {
  if (!fs.existsSync(MANIFEST_PATH)) save(JSON.parse(JSON.stringify(SEED)));
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

function save(manifest) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

function reset() {
  const fresh = JSON.parse(JSON.stringify(SEED));
  save(fresh);
  return fresh;
}

function isDeclined(category, manifest) {
  return manifest.declined_categories.includes(category);
}

function isApproved(category, manifest) {
  return manifest.approved_categories.includes(category);
}

function requiresFreshConsent(tool, manifest) {
  return (
    !isApproved(tool.capability_category, manifest) &&
    !isDeclined(tool.capability_category, manifest) &&
    isNewerThan(tool.added_at, manifest.manifest_version)
  );
}

function approve(category, newVersion) {
  const manifest = load();
  if (!manifest.approved_categories.includes(category)) {
    manifest.approved_categories.push(category);
  }
  manifest.declined_categories = manifest.declined_categories.filter(c => c !== category);
  manifest.consented_at[category] = new Date().toISOString();
  if (newVersion) manifest.manifest_version = newVersion;
  save(manifest);
  return manifest;
}

function decline(category, newVersion) {
  const manifest = load();
  if (!manifest.declined_categories.includes(category)) {
    manifest.declined_categories.push(category);
  }
  manifest.approved_categories = manifest.approved_categories.filter(c => c !== category);
  if (newVersion) manifest.manifest_version = newVersion;
  save(manifest);
  return manifest;
}

module.exports = { load, save, reset, isDeclined, isApproved, requiresFreshConsent, approve, decline };
