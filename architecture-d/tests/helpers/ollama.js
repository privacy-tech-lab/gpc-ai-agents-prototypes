/**
 * Test helpers for stubbing the Ollama chat completion endpoint.
 *
 * Use these to build a sequence of mockResolvedValueOnce(...) entries
 * against global.fetch when you want to exercise the agent loop
 * end-to-end with no model running.
 *
 * Pattern (see tests/agent_loop_fixture.test.js):
 *
 *   global.fetch = jest.fn()
 *     .mockResolvedValueOnce(ollamaOk(toolMsg('query_publisher', {...})))
 *     .mockResolvedValueOnce(ollamaOk(textMsg('summary text')));
 *
 * Shape mirrors the OpenAI-compatible response Ollama returns at
 * /v1/chat/completions.
 */

let nextCallId = 1;

function ollamaOk(message) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message }] }),
  };
}

function toolMsg(name, args, id) {
  return {
    content: null,
    tool_calls: [{
      id:   id ?? `call_${nextCallId++}`,
      type: 'function',
      function: { name, arguments: JSON.stringify(args) },
    }],
  };
}

function textMsg(content) {
  return { content };
}

module.exports = { ollamaOk, toolMsg, textMsg };
