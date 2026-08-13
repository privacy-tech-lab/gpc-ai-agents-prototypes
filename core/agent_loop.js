/**
 * Shared LLM turn loop.
 *
 * The loop is identical in shape across arch-A, arch-C, and arch-E:
 * tool_choice stays "required" until every requiredTool has been
 * attempted at least once, then switches to "auto" so the model can
 * write a final response. arch-A, arch-C, and arch-E differ only in
 * the cosmetic nudge string used when the model returns an empty
 * response, which is exposed as `emptyResponseNudge` on the opts.
 *
 * Enforcement does NOT live here. Every tool the model calls is run
 * through the caller's executeToolFn, which is where each architecture
 * routes the call through its own enforcement layer (GPC interceptor
 * in arch-A, consent check in arch-C, inference firewall in arch-E).
 * The model only ever sees what executeToolFn returns.
 *
 * arch-B keeps its own loop because it threads a privacyContext through
 * executeToolFn and decorates each toolCallLog entry with a _meta envelope.
 * arch-D keeps its own loop because its semantics differ: it uses
 * `minToolCalls` rather than a `requiredTools` set, and it surfaces a
 * `truncated` flag in the return value.
 */

'use strict';

const { callModel } = require('./ollama');

/**
 * @param {object}   opts
 * @param {string}   opts.systemPrompt
 * @param {string}   opts.userMessage
 * @param {Array}    opts.toolDefinitions      OpenAI-format tool objects
 * @param {string[]} [opts.requiredTools]      must be attempted before finishing
 * @param {Function} opts.executeToolFn        async (name, input) => result
 * @param {number}   [opts.maxTurns=10]
 * @param {string}   [opts.emptyResponseNudge] prompt sent back to the model when it
 *                                              returns an empty content in auto mode
 * @returns {{ finalResponse: string, toolCalls: Array<{tool, input, result}> }}
 */
async function runAgentLoop({
  systemPrompt,
  userMessage,
  toolDefinitions,
  requiredTools = [],
  executeToolFn,
  maxTurns = 10,
  emptyResponseNudge = 'Please provide a brief summary.',
}) {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userMessage },
  ];
  const toolCallLog = [];
  const calledTools = new Set();
  let finalResponse = '';
  let modelCallIdx = 0;

  for (let turn = 0; turn < maxTurns; turn++) {
    const pending     = requiredTools.filter((t) => !calledTools.has(t));
    const toolChoice  = pending.length > 0 ? 'required' : 'auto';

    const completion  = await callModel(messages, toolDefinitions, toolChoice, { turn: modelCallIdx++ });
    const choice      = completion.choices[0];
    const msg         = choice.message;

    const assistantMsg = { role: 'assistant', content: msg.content ?? null };
    if (msg.tool_calls?.length) assistantMsg.tool_calls = msg.tool_calls;
    messages.push(assistantMsg);

    if (!msg.tool_calls?.length) {
      if (toolChoice === 'auto') {
        finalResponse = msg.content ?? '';
        // Model gave an empty response, ask once for a summary
        if (!finalResponse && turn < maxTurns - 1) {
          messages.push({ role: 'user', content: emptyResponseNudge });
          continue;
        }
        break;
      }
      // tool_choice="required" but model produced no tool calls, nudge it
      const stillPending = requiredTools.filter((t) => !calledTools.has(t));
      messages.push({
        role:    'user',
        content: `You still need to call: ${stillPending.join(', ')}. Please call the next required tool now.`,
      });
      continue;
    }

    for (const tc of msg.tool_calls) {
      let input;
      try {
        input = typeof tc.function.arguments === 'string'
          ? JSON.parse(tc.function.arguments)
          : (tc.function.arguments ?? {});
      } catch { input = {}; }

      const result = await executeToolFn(tc.function.name, input);
      toolCallLog.push({ tool: tc.function.name, input, result });
      calledTools.add(tc.function.name);

      messages.push({
        role:         'tool',
        tool_call_id: tc.id,
        content:      JSON.stringify(result),
      });
    }
  }

  const missed = requiredTools.filter((t) => !calledTools.has(t));
  if (missed.length > 0) {
    process.stderr.write(`[agent_loop] warning: required tools not called: ${missed.join(', ')}\n`);
  }

  return { finalResponse, toolCalls: toolCallLog };
}

module.exports = { runAgentLoop };
