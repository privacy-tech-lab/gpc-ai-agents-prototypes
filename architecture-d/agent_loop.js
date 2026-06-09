'use strict';

/**
 * Shared Ollama-driven tool loop — same pattern as Architecture A / B.
 *
 * Uses tool_choice='required' until the minimum number of distinct tool
 * calls have been attempted, then switches to 'auto' so the model can
 * write a final summary response.
 */

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1';
const MODEL       = process.env.OLLAMA_MODEL    ?? 'qwen2.5:7b';

async function callModel(messages, tools, tool_choice) {
  const body = { model: MODEL, messages, stream: false };
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = tool_choice;
  }
  const res = await fetch(`${OLLAMA_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Model API error ${res.status}: ${await res.text()}`);
  return res.json();
}

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

  for (let turn = 0; turn < maxTurns; turn++) {
    const tool_choice = toolCallLog.length < minToolCalls ? 'required' : 'auto';
    const completion  = await callModel(messages, toolDefinitions, tool_choice);
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

  return { finalResponse, toolCalls: toolCallLog };
}

module.exports = { runAgentLoop, MODEL };
