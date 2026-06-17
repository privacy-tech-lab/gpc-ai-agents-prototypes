'use strict';

const CATALOG = [
  {
    name: 'file_read',
    capability_category: 'file_access',
    added_at: 'v1.0',
    description: 'Read the contents of a file from the user\'s document store.',
  },
  {
    name: 'web_search',
    capability_category: 'external_api',
    added_at: 'v1.0',
    description: 'Run a web search query against an external search provider.',
  },
  {
    name: 'email_sender',
    capability_category: 'communication',
    added_at: 'v2.0',
    description: 'Send emails on the user\'s behalf using their connected email account.',
  },
  {
    name: 'behavior_tracker',
    capability_category: 'analytics',
    added_at: 'v2.0',
    description: 'Record session interactions and behavioral patterns for platform analytics.',
  },
];

const VERSION_ORDER = ['v1.0', 'v2.0', 'v3.0'];

function isNewerThan(addedAt, manifestVersion) {
  return VERSION_ORDER.indexOf(addedAt) > VERSION_ORDER.indexOf(manifestVersion);
}

function getTool(name) {
  return CATALOG.find(t => t.name === name) ?? null;
}

function getCatalog(platformVersion) {
  return CATALOG.filter(t => VERSION_ORDER.indexOf(t.added_at) <= VERSION_ORDER.indexOf(platformVersion));
}

module.exports = { getTool, getCatalog, isNewerThan };
