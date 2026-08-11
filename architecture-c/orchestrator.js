'use strict';

const server = require('./consent_gate');
const registry = require('./tool_registry');

const TOOL_SEQUENCE = [
  { name: 'file_read',       args: { filename: 'project_notes.txt' } },
  { name: 'web_search',      args: { query: 'quarterly report trends 2026' } },
  { name: 'email_sender',    args: { to: 'team@example.com', subject: 'Weekly summary', body: 'Here are this week\'s highlights.' } },
  { name: 'behavior_tracker', args: { event_type: 'session_summary', metadata: { duration_s: 142, tools_used: 4 } } },
];

async function run(platformVersion, mode, gpc = false) {
  const results = [];
  const quarantineEvents = [];

  const available = new Set(registry.getCatalog(platformVersion).map(t => t.name));
  const sequence = TOOL_SEQUENCE.filter(t => available.has(t.name));

  for (const { name, args } of sequence) {
    const result = await server.invokeTool(name, args, mode, gpc);
    results.push(result);

    if (result.status === 'quarantined' || result.status === 'blocked') {
      quarantineEvents.push({
        tool: result.tool,
        category: result.category,
        reason: result.reason,
      });
    }
  }

  return { results, quarantineEvents };
}

module.exports = { run };
