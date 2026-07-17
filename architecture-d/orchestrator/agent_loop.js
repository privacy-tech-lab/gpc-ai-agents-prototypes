/**
 * Architecture D turn loop.
 *
 * Drives the LLM through a sequence of publisher queries. Uses
 * tool_choice='required' until the minimum number of distinct tool calls have
 * been attempted, then switches to 'auto' so the model can write a final
 * summary response.
 *
 * The network call lives in core/ollama.js. This file owns only the
 * `minToolCalls` loop semantics and the truncation diagnostic that are specific
 * to Architecture D.
 */

const { callModel, DEFAULT_MODEL } = require('../../core/ollama');

const MODEL = DEFAULT_MODEL;

/**
 * Run a tool-using agent loop until the model produces a final response.
 *
 * @param {object}   opts
 * @param {string}   opts.systemPrompt
 * @param {string}   opts.userMessage
 * @param {Array}    opts.toolDefinitions    — OpenAI-format function tools
 * @param {Function} opts.executeToolFn      — async (name, input) => result
 * @param {number}   [opts.minToolCalls=3]   — required call count before model may summarise
 * @param {number}   [opts.maxTurns=10]
 * @returns {{ finalResponse: string, toolCalls: Array<{tool, input, result}> }}
 */
async function runAgentLoop({
  systemPrompt,
  userMessage,
  toolDefinitions,
  executeToolFn,
  minToolCalls = 3,
  maxTurns     = 10,
}) {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userMessage  },
  ];
  const toolCallLog = [];
  let   finalResponse = '';
  let   modelCallIdx = 0;

  for (let turn = 0; turn < maxTurns; turn++) {
    const tool_choice = toolCallLog.length < minToolCalls ? 'required' : 'auto';
    const completion  = await callModel(messages, toolDefinitions, tool_choice, { turn: modelCallIdx++, fixture: 'arch-d' });
    const choice      = completion.choices[0];
    const msg         = choice.message;

    const assistantMsg = { role: 'assistant', content: msg.content ?? null };
    if (msg.tool_calls?.length) assistantMsg.tool_calls = msg.tool_calls;
    messages.push(assistantMsg);

    if (!msg.tool_calls?.length) {
      if (tool_choice === 'auto') {
        finalResponse = msg.content ?? '';
        if (!finalResponse && turn < maxTurns - 1) {
          messages.push({ role: 'user', content: 'Please write a brief summary of what you found across the publishers.' });
          continue;
        }
        break;
      }
      messages.push({
        role:    'user',
        content: `You still need to query at least ${minToolCalls - toolCallLog.length} more publisher(s) before you can summarise.`,
      });
      continue;
    }

    for (const tc of msg.tool_calls) {
      let input;
      try { input = JSON.parse(tc.function.arguments); }
      catch { input = {}; }

      const result = await executeToolFn(tc.function.name, input);
      toolCallLog.push({ tool: tc.function.name, input, result });

      messages.push({
        role:         'tool',
        tool_call_id: tc.id,
        content:      JSON.stringify(result),
      });
    }
  }

  // If we exited the loop without ever observing a content response,
  // surface that as a diagnostic message rather than an empty string
  // so the harness output makes the truncation visible to the user.
  const truncated = finalResponse === '';
  if (truncated) {
    finalResponse = `(model exhausted maxTurns=${maxTurns} without producing a final summary; ${toolCallLog.length} tool call(s) made)`;
  }

  return { finalResponse, toolCalls: toolCallLog, truncated };
}

module.exports = { runAgentLoop, MODEL };
