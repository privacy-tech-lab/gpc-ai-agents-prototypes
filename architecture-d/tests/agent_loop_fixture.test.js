'use strict';

/**
 * Happy-path tests for the Ollama agent loop with the live network
 * replaced by either a stubbed global.fetch (unit-test style) or the
 * OLLAMA_FIXTURE flag (dev-iteration style). Both paths share the same
 * end-to-end assertion: the loop emits the expected tool calls and the
 * expected final summary, with no live model running.
 */

const { runAgentLoop, loadOllamaFixture } = require('../orchestrator/agent_loop');
const { ollamaOk, toolMsg, textMsg }      = require('./helpers/ollama');

const TOOL_DEFS = [{
  type: 'function',
  function: {
    name: 'query_publisher',
    description: 'Stubbed publisher query.',
    parameters: {
      type: 'object',
      properties: {
        publisher_id: { type: 'string' },
        sub_query:    { type: 'string' },
      },
      required: ['publisher_id', 'sub_query'],
    },
  },
}];

describe('runAgentLoop with stubbed global.fetch', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  test('emits the staged tool calls then the final summary', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(ollamaOk(toolMsg('query_publisher', { publisher_id: 'the-verge', sub_query: 'review' })))
      .mockResolvedValueOnce(ollamaOk(toolMsg('query_publisher', { publisher_id: 'cnet',      sub_query: 'build'  })))
      .mockResolvedValueOnce(ollamaOk(toolMsg('query_publisher', { publisher_id: 'wired',     sub_query: 'software' })))
      .mockResolvedValueOnce(ollamaOk(textMsg('Three publishers agree.')));

    const executeToolFn = jest.fn().mockResolvedValue({ status: 'ok', site: 'mock' });

    const out = await runAgentLoop({
      systemPrompt:    'sys',
      userMessage:     'research iPhone 17',
      toolDefinitions: TOOL_DEFS,
      executeToolFn,
      minToolCalls:    3,
    });

    expect(out.toolCalls).toHaveLength(3);
    expect(out.toolCalls.map(c => c.input.publisher_id)).toEqual(['the-verge', 'cnet', 'wired']);
    expect(out.finalResponse).toBe('Three publishers agree.');
    expect(out.truncated).toBe(false);
  });
});

describe('runAgentLoop with OLLAMA_FIXTURE', () => {
  afterEach(() => { delete process.env.OLLAMA_FIXTURE; });

  test('OLLAMA_FIXTURE=tool_call drives three calls and a final summary, no fetch needed', async () => {
    process.env.OLLAMA_FIXTURE = 'tool_call';
    const realFetch = global.fetch;
    global.fetch = jest.fn(() => { throw new Error('fetch must not be called when OLLAMA_FIXTURE is set'); });

    const executeToolFn = jest.fn().mockResolvedValue({ status: 'ok', site: 'mock' });

    try {
      const out = await runAgentLoop({
        systemPrompt:    'sys',
        userMessage:     'research iPhone 17',
        toolDefinitions: TOOL_DEFS,
        executeToolFn,
        minToolCalls:    3,
      });
      expect(out.toolCalls).toHaveLength(3);
      expect(out.toolCalls.map(c => c.input.publisher_id)).toEqual(['the-verge', 'cnet', 'wired']);
      expect(out.finalResponse).toMatch(/consensus/i);
      expect(global.fetch).not.toHaveBeenCalled();
    } finally {
      global.fetch = realFetch;
    }
  });

  test('OLLAMA_FIXTURE=1 defaults to the tool_call variant', () => {
    process.env.OLLAMA_FIXTURE = '1';
    const fx = loadOllamaFixture();
    expect(Array.isArray(fx)).toBe(true);
    expect(fx[0].choices[0].message.tool_calls[0].function.name).toBe('query_publisher');
  });

  test('OLLAMA_FIXTURE pointing at a missing variant throws a useful error', () => {
    process.env.OLLAMA_FIXTURE = 'this_variant_does_not_exist';
    expect(() => loadOllamaFixture()).toThrow(/this_variant_does_not_exist/);
  });
});
