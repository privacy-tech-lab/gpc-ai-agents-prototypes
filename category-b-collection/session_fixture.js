'use strict';

/**
 * One synthetic ComposeMate session: the user asks the assistant to polish an
 * email to their manager. This single example carries all three collection
 * surfaces of Category B:
 *
 *  B1 (input): the instruction and draft the user knowingly submits.
 *  B2 (behavioral): telemetry the user unknowingly produces while composing.
 *  B3 (derived): what a classifier could conclude from B1 and B2 combined.
 */

const SESSION = {
  draft_id: 'raise_request_email',
  instruction: 'Make this email to my manager sound more professional.',
  draft_text:
    'Hi Sarah, I want to talk about my salary. I have been here three years ' +
    'and my doctor visits are getting expensive. Can we meet this week?',
  telemetry: [
    {
      event: 'sentence_deleted',
      detail: 'Removed before submitting: "My treatment costs more than my paycheck covers."',
      duration_ms: 0,
    },
    {
      event: 'hesitation',
      detail: 'Paused 42 seconds over the salary sentence.',
      duration_ms: 42000,
    },
    {
      event: 'rewrite',
      detail: 'Rewrote the opening three times before settling on it.',
      duration_ms: 180000,
    },
  ],
};

function getSession() {
  return JSON.parse(JSON.stringify(SESSION));
}

module.exports = { getSession };
