'use strict';

/**
 * Two synthetic sessions with Aria, a memory-enabled assistant, plus the
 * profile the platform would synthesize afterward. This single example
 * carries all three persistence scopes of Category D:
 *
 *  D1 (session): does anything survive once a session ends?
 *  D2 (cross-session): may past sessions inform this one?
 *  D3 (long-term profile): may retained sessions be synthesized into a
 *      behavioral model?
 *
 * Within-session context is never gated: Aria may use facts from earlier in
 * the same session in every mode, which is the operational coherence the
 * typology explicitly permits under D1.
 */

const SESSIONS = [
  {
    session_id: 's1_recipes',
    turns: [
      {
        user: 'I need a cheap dinner idea. I am vegetarian and money is tight this month.',
        assistant:
          'Here is a budget-friendly idea: chickpea and spinach curry over rice, ' +
          'about three dollars a serving.',
      },
      {
        user: 'Can you make it something under 20 minutes?',
        // This answer depends on facts from turn 1 of the SAME session
        // (vegetarian, budget). It is identical in every mode.
        assistant:
          'Then try a 15-minute white bean and tomato skillet: still vegetarian, ' +
          'still around three dollars a serving.',
      },
    ],
    facts_disclosed: { diet: 'vegetarian', budget: 'tight' },
  },
  {
    session_id: 's2_restaurants',
    turns: [
      {
        user: 'Any restaurant suggestions for Friday?',
        assistant: null, // filled by recall outcome below
      },
    ],
    facts_disclosed: { plans: 'dining_out_friday' },
    // With cross-session recall permitted, Aria remembers session 1.
    tailored_answer:
      'Since you eat vegetarian and are watching your budget this month, try ' +
      'Verde Table: fully vegetarian, mains under twelve dollars.',
    // With recall blocked (or nothing archived), Aria starts from a clean slate.
    generic_answer:
      'Happy to help. What kind of food are you in the mood for, and what price ' +
      'range works for Friday?',
  },
];

const PROFILE_SYNTHESIS = {
  dietary_pattern: 'vegetarian',
  price_sensitivity: 'high',
  planning_behavior: 'plans_meals_and_outings_weekly',
  derived_from_sessions: ['s1_recipes', 's2_restaurants'],
};

function getSessions() {
  return JSON.parse(JSON.stringify(SESSIONS));
}

function getProfileSynthesis() {
  return JSON.parse(JSON.stringify(PROFILE_SYNTHESIS));
}

module.exports = { getSessions, getProfileSynthesis };
