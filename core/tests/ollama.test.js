'use strict';

/**
 * Tests for the shared Ollama caller in core/ollama.js.
 *
 * The live fetch is replaced by a stubbed global.fetch so the happy path
 * runs without a model running. The fixture-gate is tested against the
 * placeholder fixtures in core/fixtures/ollama/.
 */

const { callModel, DEFAULT_MODEL } = require('../ollama');

describe('callModel with stubbed global.fetch', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.OLLAMA_FIXTURE;
  });

  test('posts a chat-completion body and returns the parsed response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hello' } }] }),
    });
    const out = await callModel(
      [{ role: 'user', content: 'hi' }],
      [{ type: 'function', function: { name: 'noop', parameters: { type: 'object' } } }],
      'auto',
    );
    expect(out.choices[0].message.content).toBe('hello');
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.model).toBe(DEFAULT_MODEL);
    expect(body.stream).toBe(false);
    expect(body.tools).toHaveLength(1);
    expect(body.tool_choice).toBe('auto');
  });

  test('opts.model overrides the default model', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'x' } }] }),
    });
    await callModel([{ role: 'user', content: 'hi' }], [], 'auto', { model: 'qwen2.5:7b' });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.model).toBe('qwen2.5:7b');
  });

  test('throws on a non-2xx response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'boom',
    });
    await expect(callModel([], [], 'auto')).rejects.toThrow(/Model API error 500/);
  });

  test('omits tool fields when no tools given', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'no tools' } }] }),
    });
    await callModel([{ role: 'user', content: 'hi' }], [], 'auto');
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
  });
});

describe('callModel with OLLAMA_FIXTURE', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.OLLAMA_FIXTURE;
  });

  test('OLLAMA_FIXTURE=1 defaults to the arch-a capture and the fixture contains at least one tool-call turn', async () => {
    process.env.OLLAMA_FIXTURE = '1';
    global.fetch = jest.fn(() => { throw new Error('fetch must not be called when OLLAMA_FIXTURE is set'); });
    const fixture = require('../fixtures/ollama/arch-a.json');
    const hasToolCall = fixture.some((turn) =>
      Array.isArray(turn?.choices?.[0]?.message?.tool_calls) &&
      turn.choices[0].message.tool_calls.length > 0
    );
    expect(hasToolCall).toBe(true);
    const t0 = await callModel([], [], 'auto', { turn: 0 });
    expect(t0).toEqual(fixture[0]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('OLLAMA_FIXTURE=arch-d replays a real arch-D research run', async () => {
    process.env.OLLAMA_FIXTURE = 'arch-d';
    const fixture = require('../fixtures/ollama/arch-d.json');
    // arch-D's fanout pattern: at least one turn with multiple tool calls (the multi-call variant),
    // and a final turn with text content (the summary).
    const hasMultiCall  = fixture.some((turn) =>
      Array.isArray(turn?.choices?.[0]?.message?.tool_calls) &&
      turn.choices[0].message.tool_calls.length > 1
    );
    const hasTextTurn = fixture.some((turn) => {
      const msg = turn?.choices?.[0]?.message;
      return msg?.content && (!msg.tool_calls || msg.tool_calls.length === 0);
    });
    expect(hasMultiCall).toBe(true);
    expect(hasTextTurn).toBe(true);
    const t0 = await callModel([], [], 'auto', { turn: 0 });
    expect(t0).toEqual(fixture[0]);
  });

  test('OLLAMA_FIXTURE=arch-c replays a real arch-C productivity run', async () => {
    process.env.OLLAMA_FIXTURE = 'arch-c';
    const t0 = await callModel([], [], 'auto', { turn: 0 });
    expect(t0).toEqual(require('../fixtures/ollama/arch-c.json')[0]);
  });

  test('overflowing the fixture array returns the last entry', async () => {
    process.env.OLLAMA_FIXTURE = 'arch-d';
    const fixture = require('../fixtures/ollama/arch-d.json');
    const out = await callModel([], [], 'auto', { turn: 999 });
    expect(out).toEqual(fixture[fixture.length - 1]);
  });

  test('OLLAMA_FIXTURE pointing at a missing variant throws a clear error', async () => {
    process.env.OLLAMA_FIXTURE = 'no_such_variant';
    await expect(callModel([], [], 'auto', { turn: 0 })).rejects.toThrow(/no_such_variant/);
  });
});
