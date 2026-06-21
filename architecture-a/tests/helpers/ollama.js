'use strict';

/**
 * Shared Ollama test helpers.
 *
 * These build fake responses for Ollama's /chat/completions endpoint so agent
 * tests and demos run with no model. Stub global.fetch with ollamaOk(...)
 * wrapping a message built by toolMsg() or textMsg():
 *
 *   global.fetch = jest.fn()
 *     .mockResolvedValueOnce(ollamaOk(toolMsg('search_web', { query: 'GPC' })))
 *     .mockResolvedValueOnce(ollamaOk(textMsg('Done.')));
 *
 * The other architectures copy this file into their own
 * tests/helpers/ollama.js (issues #42 through #45), so keep it dependency-free.
 */

// A successful /chat/completions response carrying one assistant message.
function ollamaOk(message) {
  return {
    ok:   true,
    json: () => Promise.resolve({ choices: [{ message }] }),
    text: () => Promise.resolve(''),
  };
}

// An assistant message that calls one tool with the given arguments.
function toolMsg(name, args, id = 'call_1') {
  return {
    content:    null,
    tool_calls: [{ id, function: { name, arguments: JSON.stringify(args) } }],
  };
}

// A plain assistant text message with no tool call.
function textMsg(content) {
  return { content, tool_calls: null };
}

module.exports = { ollamaOk, toolMsg, textMsg };
