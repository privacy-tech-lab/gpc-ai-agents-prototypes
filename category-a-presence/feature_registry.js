'use strict';

/**
 * Feature catalog for the NoteFlow app.
 *
 * v1.0 ships with plain, non-AI features only. The v2.0 update adds two AI
 * features: one foreground on-demand feature (ai_summarize) and one passive
 * background feature (ai_ambient_copilot). Category A governs how these AI
 * features enter the app (A1) and whether they may run passively (A2).
 */

const CATALOG = [
  {
    name: 'note_read',
    is_ai: false,
    invocation: 'on_demand',
    added_in: 'v1.0',
    description: "Read a note from the user's notebook.",
  },
  {
    name: 'note_save',
    is_ai: false,
    invocation: 'on_demand',
    added_in: 'v1.0',
    description: "Save or update a note in the user's notebook.",
  },
  {
    name: 'ai_summarize',
    is_ai: true,
    invocation: 'on_demand',
    added_in: 'v2.0',
    description: 'Summarize a note with the built-in AI model when the user asks.',
  },
  {
    name: 'ai_ambient_copilot',
    is_ai: true,
    invocation: 'passive',
    added_in: 'v2.0',
    description: 'Watch typing in the background and offer AI suggestions without being asked.',
  },
];

const VERSION_ORDER = ['v1.0', 'v2.0', 'v3.0'];

function isNewerThan(addedIn, manifestVersion) {
  return VERSION_ORDER.indexOf(addedIn) > VERSION_ORDER.indexOf(manifestVersion);
}

function getFeature(name) {
  return CATALOG.find(f => f.name === name) ?? null;
}

function getCatalog(platformVersion) {
  return CATALOG.filter(
    f => VERSION_ORDER.indexOf(f.added_in) <= VERSION_ORDER.indexOf(platformVersion)
  );
}

module.exports = { CATALOG, getFeature, getCatalog, isNewerThan };
