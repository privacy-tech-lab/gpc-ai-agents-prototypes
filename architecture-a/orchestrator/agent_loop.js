/**
 * Shared LLM turn loop for all agents.
 *
 * Each agent (search, data, orchestrator) runs its own instance of this loop
 * with its own system prompt and tool set. The loop uses tool_choice="required"
 * until every required tool has been attempted at least once, then switches to
 * "auto" so the model can write a final response.
 */

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1';
const MODEL = process.env.OLLAMA_MODEL ?? 'llama3.1';

async function callModel(messages, tools, toolChoice) {
  const body = { model: MODEL, messages, stream: false };
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = toolChoice;
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

  for (let turn = 0; turn < maxTurns; turn++) {
    const pending     = requiredTools.filter((t) => !calledTools.has(t));
    const toolChoice  = pending.length > 0 ? 'required' : 'auto';

    const completion  = await callModel(messages, toolDefinitions, toolChoice);
    const choice      = completion.choices[0];
    const msg         = choice.message;

    const assistantMsg = { role: 'assistant', content: msg.content ?? null };
    if (msg.tool_calls?.length) assistantMsg.tool_calls = msg.tool_calls;
    messages.push(assistantMsg);

    if (!msg.tool_calls?.length) {
      if (toolChoice === 'auto') {
        finalResponse = msg.content ?? '';
        // Model gave empty response — ask once for a summary
        if (!finalResponse && turn < maxTurns - 1) {
          messages.push({ role: 'user', content: 'Please provide a brief summary of what you found and what was stored.' });
          continue;
        }
        break;
      }
      // tool_choice="required" but model produced no tool calls — nudge it
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
