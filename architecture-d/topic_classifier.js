'use strict';

/**
 * Trivial deterministic topic classifier — the provider has the agent's
 * full query, so it can infer what the user is researching even when
 * site-level enforcement is perfect. A real LLM provider would do this
 * far more accurately; the lower bound shown here is enough to motivate
 * the structural argument.
 */

const RULES = [
  { topic: 'mobile_device', match: /\b(iphone|pixel|galaxy|android phone|smartphone)\b/i },
  { topic: 'laptop',        match: /\b(macbook|laptop|thinkpad|notebook)\b/i           },
  { topic: 'audio',         match: /\b(headphone|earbud|airpod|bose|sony wh)\b/i       },
  { topic: 'photography',   match: /\b(camera|lens|sigma|tamron|sony a|nikon|canon)\b/i },
  { topic: 'wearable',      match: /\b(watch|fitness band|wearable)\b/i                 },
];

function classifyTopic(query) {
  for (const rule of RULES) {
    if (rule.match.test(query)) return rule.topic;
  }
  return 'general_tech';
}

module.exports = { classifyTopic };
