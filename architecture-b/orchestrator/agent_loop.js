/**
 * Architecture B turn loop.
 *
 * The network call lives in core/ollama.js. This file owns the per-call _meta
 * envelope construction (Layer 2) and the requiredTools nudging that are
 * specific to Architecture B.
 */

const { callModel, DEFAULT_MODEL } = require('../../core/ollama');

const MODEL = DEFAULT_MODEL;

/**
 * @param {object}   opts
 * @param {string}   opts.systemPrompt
 * @param {string}   opts.userMessage
 * @param {Array}    opts.toolDefinitions
 * @param {string[]} [opts.requiredTools]
 * @param {Function} opts.executeToolFn      (name, input, privacyContext) => Promise
 * @param {object}   [opts.privacyContext]
 * @param {string}   [opts.purpose]          label for the _meta envelope (Layer 2)
 * @param {number}   [opts.maxTurns]
 * @returns {{ finalResponse: string, toolCalls: Array }}
 */
async function runAgentLoop({
  systemPrompt,
  userMessage,
  toolDefinitions,
  requiredTools = [],
  executeToolFn,
  privacyContext = {},
  purpose = 'primary_task',
  maxTurns = 10,
}) {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userMessage  },
  ];
  const toolCallLog = [];
  const calledTools = new Set();
  let finalResponse = '';
  let modelCallIdx = 0;

  for (let turn = 0; turn < maxTurns; turn++) {
    const pending    = requiredTools.filter((t) => !calledTools.has(t));
    const toolChoice = pending.length > 0 ? 'required' : 'auto';
    const completion = await callModel(messages, toolDefinitions, toolChoice, { turn: modelCallIdx++ });
    const choice     = completion.choices[0];
    const msg        = choice.message;

    const assistantMsg = { role: 'assistant', content: msg.content ?? null };
    if (msg.tool_calls?.length) assistantMsg.tool_calls = msg.tool_calls;
    messages.push(assistantMsg);

    if (!msg.tool_calls?.length) {
      if (toolChoice === 'auto') {
        finalResponse = msg.content ?? '';
        if (!finalResponse && turn < maxTurns - 1) {
          messages.push({ role: 'user', content: 'Please provide a brief summary of what you found.' });
          continue;
        }
        break;
      }
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

      // Layer 2: _meta envelope carries the full GPC context alongside tool arguments
      const meta   = { gpc: privacyContext.gpc, gpc_scope: privacyContext.gpc_scope, purpose };
      const result = await executeToolFn(tc.function.name, input, privacyContext);
      toolCallLog.push({ tool: tc.function.name, input, result, _meta: meta });
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

module.exports = { runAgentLoop, MODEL };
