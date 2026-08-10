'use strict';

const gate = require('./presence_gate');
const registry = require('./feature_registry');

/**
 * Scripted session. note_read and ai_summarize are user actions; the ambient
 * copilot call is fired by the platform around the session, not chosen by
 * the user. That platform-initiated call is exactly the A2 case.
 */
const FEATURE_SEQUENCE = [
  { name: 'note_read', args: { filename: 'meeting_notes.md' }, initiatedBy: 'user' },
  { name: 'ai_summarize', args: { filename: 'meeting_notes.md' }, initiatedBy: 'user' },
  { name: 'ai_ambient_copilot', args: { event: 'typing_burst', chars: 214 }, initiatedBy: 'platform' },
];

async function run(platformVersion, mode, gpc = false) {
  const results = [];
  const presenceEvents = [];

  const available = new Set(registry.getCatalog(platformVersion).map(f => f.name));
  const sequence = FEATURE_SEQUENCE.filter(f => available.has(f.name));

  for (const { name, args, initiatedBy } of sequence) {
    const result = await gate.invokeFeature(name, args, { mode, gpc, initiatedBy });
    results.push({ ...result, initiated_by: initiatedBy });

    if (result.status === 'blocked') {
      presenceEvents.push({
        feature: result.feature,
        subtype: result.subtype,
        reason: result.reason,
      });
    }
    if (result.violations?.length) {
      presenceEvents.push({
        feature: result.feature,
        subtype: result.violations.join('+'),
        reason: 'violated_in_silent_mode',
      });
    }
  }

  return { results, presenceEvents };
}

module.exports = { run, FEATURE_SEQUENCE };
