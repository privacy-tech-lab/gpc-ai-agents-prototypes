/**
 * Shared LLM turn loop (copied from Architecture A).
 *
 * The model is given a system prompt and a tool set and decides which tools to
 * call. tool_choice stays "required" until every required tool has been attempted
 * at least once, then switches to "auto" so the model can write a final response.
 *
 * Enforcement does NOT live here. Every tool the model calls is run through the
 * caller's executeToolFn, for Architecture C that routes the call through
 * withConsentCheck(). The model only ever sees what executeToolFn returns, so a
 * blocked or quarantined tool simply comes back as that tool's result.
 *
 * The network call lives in core/ollama.js. This file owns only the per-arch
 * loop semantics.
 */

const { callModel, DEFAULT_MODEL } = require('../core/ollama');

const MODEL = DEFAULT_MODEL;

/**
 * @param {object}   opts
 * @param {string}   opts.systemPrompt
 * @param {string}   opts.userMessage
 * @param {Array}    opts.toolDefinitions   — OpenAI-format tool objects
 * @param {string[]} [opts.requiredTools]   — must be attempted before finishing
 * @param {Function} opts.executeToolFn    — async (name, input) => result
 * @param {number}   [opts.maxTurns=10]
 * @returns {{ finalResponse: string, toolCalls: Array<{tool, input, result}> }}
 */
async function runAgentLoop({
  systemPrompt,
  userMessage,
  toolDefinitions,
  requiredTools = [],
  executeToolFn,
  maxTurns = 10,
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
        if (!finalResponse && turn < maxTurns - 1) {
          messages.push({ role: 'user', content: 'Please give a brief summary of what you did.' });
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

module.exports = { runAgentLoop, MODEL };
