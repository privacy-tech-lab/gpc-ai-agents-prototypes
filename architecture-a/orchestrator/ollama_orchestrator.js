/**
 * Ollama AI Orchestrator
 *
 * Uses a locally-running Ollama model as the AI agent. Ollama exposes an
 * OpenAI-compatible API at http://localhost:11434/v1, so no external API key
 * or network access is required.
 *
 * Recommended models (must support tool use):
 *   ollama pull llama3.1        (8 B, default)
 *   ollama pull qwen2.5         (7 B, strong alternative)
 *
 * Set the model with the OLLAMA_MODEL env var:
 *   OLLAMA_MODEL=qwen2.5 npm run ai-gpc
 *
 * The GPC enforcement layer is identical to the scripted pipeline — the same
 * withGpc() interceptors and JWT trust-boundary checks apply. The model
 * decides at runtime which tools to call; when a tool returns a blocked
 * response the model must acknowledge it cannot store data.
 *
 * To ensure local models complete the full tool sequence, the loop uses
 * tool_choice="required" until every required tool has been attempted at
 * least once (executed or blocked), then switches to "auto" for the final
 * response turn.
 */

const { withGpc } = require('../mcp-server/gpc_policy.js');
const handlers    = require('../mcp-server/tool_handlers.js');
const { readGpcFromBaggage } = require('./baggage.js');
const { issueToken }         = require('../mcp-server/identity_provider.js');

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1';
const MODEL       = process.env.OLLAMA_MODEL    ?? 'llama3.1';
const MAX_TURNS   = 12;

// Every tool the agent is expected to attempt during a run
const REQUIRED_TOOLS = [
  'search_web',
  'user_profile_lookup',
  'save_to_profile',
  'log_interaction',
  'store_to_third_party',
];

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Search the web for information on a topic.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'user_profile_lookup',
      description: 'Look up stored preferences and history for a user.',
      parameters: {
        type: 'object',
        properties: { user_id: { type: 'string' } },
        required: ['user_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_to_profile',
      description: 'Save a summary of this interaction to the user profile for future personalisation.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string' },
          data: {
            type: 'object',
            description: 'Key/value pairs to save, e.g. { "last_query": "...", "last_summary": "..." }',
          },
        },
        required: ['user_id', 'data'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'log_interaction',
      description: 'Append a record of this query and a brief response summary to the interaction log.',
      parameters: {
        type: 'object',
        properties: {
          user_id:          { type: 'string' },
          query:            { type: 'string' },
          response_summary: { type: 'string' },
        },
        required: ['user_id', 'query', 'response_summary'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'store_to_third_party',
      description: 'Send the response summary to the third-party personalisation vendor for future retrieval.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['user_id', 'content'],
      },
    },
  },
];

const wrappedHandlers = {
  search_web:          withGpc('search_web',          handlers.search_web),
  user_profile_lookup: withGpc('user_profile_lookup', handlers.user_profile_lookup),
  save_to_profile:     withGpc('save_to_profile',     handlers.save_to_profile),
  log_interaction:     withGpc('log_interaction',      handlers.log_interaction),
};

async function executeToolCall(toolName, toolInput, meta, timing) {
  const start = Date.now();
  let result;

  if (toolName === 'store_to_third_party') {
    const port = process.env.THIRD_PARTY_PORT ?? 4001;
    try {
      const resp = await fetch(`http://localhost:${port}/store`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${meta.jwt ?? ''}`,
        },
        body: JSON.stringify({ user_id: toolInput.user_id, content: toolInput.content }),
      });
      result = await resp.json();
    } catch (err) {
      result = { status: 'error', reason: err.message };
    }
  } else {
    const handler = wrappedHandlers[toolName];
    result = handler
      ? await handler(toolInput, meta)
      : { status: 'error', reason: `unknown tool: ${toolName}` };
  }

  const elapsed = Date.now() - start;
  if (timing) timing.push({ tool: toolName, durationMs: elapsed, status: result.status });
  return result;
}

async function callOllama(messages, toolChoice = 'auto') {
  const body = {
    model: MODEL,
    messages,
    tools: TOOL_DEFINITIONS,
    tool_choice: toolChoice,
    stream: false,
  };

  const response = await fetch(`${OLLAMA_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama API error ${response.status}: ${text}`);
  }

  return response.json();
}

/**
 * @param {object} options
 * @param {string}  options.query
 * @param {string}  options.user_id
 * @param {string}  [options.baggageHeader]
 * @param {boolean} [options.dropSignal]
 * @param {Array}   [options.timing]
 */
async function handleRequest(options) {
  const { query, user_id, baggageHeader = '', dropSignal = false, timing = [] } = options;

  const gpc = readGpcFromBaggage(baggageHeader);
  const jwt = issueToken('orchestrator', gpc);
  const meta = dropSignal ? {} : { gpc: gpc ? 1 : 0, jwt };

  const systemPrompt = `You are a helpful AI research assistant with access to five tools.

For every user research request you MUST call ALL of the following tools, in this order:
1. search_web          — find information on the topic
2. user_profile_lookup — check whether the user has saved context
3. save_to_profile     — save the query and a short summary to the user profile
4. log_interaction     — log the query and summary to the interaction record
5. store_to_third_party — send the summary to the personalisation vendor

Call each tool exactly once. Do not skip any tool. Do not write a final answer until all five tools have been called.

If a tool returns { "status": "blocked", "reason": "gpc_opt_out" }, the user has exercised their privacy opt-out for that operation. Accept the blocked response, do not retry the tool, and continue to the next one. After all tools have been attempted, write a final response that acknowledges which operations were blocked.

Current user ID: ${user_id}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: query },
  ];

  const toolCallLog  = [];
  const calledTools  = new Set();
  let finalResponse  = '';
  let turns          = 0;

  while (turns < MAX_TURNS) {
    turns++;

    // Use tool_choice="required" until every required tool has been attempted
    const pending     = REQUIRED_TOOLS.filter((t) => !calledTools.has(t));
    const toolChoice  = pending.length > 0 ? 'required' : 'auto';

    const completion  = await callOllama(messages, toolChoice);
    const choice      = completion.choices[0];
    const message     = choice.message;

    // Build assistant message, stripping undefined fields to keep history clean
    const assistantMsg = { role: 'assistant', content: message.content ?? null };
    if (message.tool_calls?.length) assistantMsg.tool_calls = message.tool_calls;
    messages.push(assistantMsg);

    const finishedCalling = !message.tool_calls?.length;

    if (toolChoice === 'auto' && (choice.finish_reason === 'stop' || finishedCalling)) {
      finalResponse = message.content ?? '';
      break;
    }

    if (!message.tool_calls?.length) continue;

    for (const tc of message.tool_calls) {
      let toolInput;
      try {
        toolInput = typeof tc.function.arguments === 'string'
          ? JSON.parse(tc.function.arguments)
          : tc.function.arguments ?? {};
      } catch {
        toolInput = {};
      }

      const result = await executeToolCall(tc.function.name, toolInput, meta, timing);
      toolCallLog.push({ tool: tc.function.name, input: toolInput, result });
      calledTools.add(tc.function.name);

      messages.push({
        role:         'tool',
        tool_call_id: tc.id,
        content:      JSON.stringify(result),
      });
    }
  }

  return {
    model: MODEL,
    gpc_active: gpc,
    baggage_header: baggageHeader,
    meta_envelope: { gpc: meta.gpc ?? '(dropped)' },
    final_response: finalResponse,
    tool_calls: toolCallLog,
    timing,
  };
}

module.exports = { handleRequest };
