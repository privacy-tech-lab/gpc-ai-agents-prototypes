'use strict';

/**
 * Tool registry — the set of third-party publishers the agent can fan out
 * to during a research task. Each entry declares whether the publisher
 * honors GPC, at what enforcement level, and the domain used for live
 * web fetches via Tavily when TAVILY_API_KEY is set.
 *
 * Enforcement levels:
 *   strict   — publisher honors GPC fully: no logging, no profile write
 *   advisory — publisher logs the request but suppresses profile write
 *   none     — publisher does not honor GPC at all
 */

const PUBLISHERS = [
  { id: 'the-verge',         name: 'The Verge',         domain: 'theverge.com',         category: 'tech_review', supports_gpc: true,  enforcement: 'strict'   },
  { id: 'ars-technica',      name: 'Ars Technica',      domain: 'arstechnica.com',      category: 'tech_review', supports_gpc: true,  enforcement: 'strict'   },
  { id: 'cnet',              name: 'CNET',              domain: 'cnet.com',             category: 'tech_review', supports_gpc: true,  enforcement: 'strict'   },
  { id: 'tomsguide',         name: "Tom's Guide",       domain: 'tomsguide.com',        category: 'tech_review', supports_gpc: true,  enforcement: 'strict'   },
  { id: 'engadget',          name: 'Engadget',          domain: 'engadget.com',         category: 'tech_review', supports_gpc: true,  enforcement: 'advisory' },
  { id: 'wired',             name: 'Wired',             domain: 'wired.com',            category: 'tech_review', supports_gpc: true,  enforcement: 'strict'   },
  { id: 'android-authority', name: 'Android Authority', domain: 'androidauthority.com', category: 'tech_review', supports_gpc: false, enforcement: 'none'     },
  { id: 'techcrunch',        name: 'TechCrunch',        domain: 'techcrunch.com',       category: 'tech_review', supports_gpc: true,  enforcement: 'advisory' },
];

function getPublisher(id) {
  return PUBLISHERS.find(p => p.id === id) || null;
}

function listPublisherIds() {
  return PUBLISHERS.map(p => p.id);
}

module.exports = { PUBLISHERS, getPublisher, listPublisherIds };
