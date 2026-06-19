'use strict';

/**
 * Tests for the provider-agnostic LLM caller in core/llm.js.
 *
 * The live fetch is replaced by a stubbed global.fetch so the happy path
 * runs without any provider being reachable. The fixture-gate is tested
 * against the captured fixtures in core/fixtures/ollama/.
 */

const { callModel, DEFAULT_MODEL, toAnthropic, fromAnthropic } = require('../llm');

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

  test('OLLAMA_FIXTURE=1 defaults to tool_call and replays each turn in order', async () => {
    process.env.OLLAMA_FIXTURE = '1';
    global.fetch = jest.fn(() => { throw new Error('fetch must not be called when OLLAMA_FIXTURE is set'); });
    const t0 = await callModel([], [], 'auto', { turn: 0 });
    const t1 = await callModel([], [], 'auto', { turn: 1 });
    expect(t0.choices[0].message.tool_calls).toBeTruthy();
    expect(t1.choices[0].message.content).toMatch(/Placeholder final response/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('OLLAMA_FIXTURE=direct_answer replays the text-only fixture', async () => {
    process.env.OLLAMA_FIXTURE = 'direct_answer';
    const out = await callModel([], [], 'auto', { turn: 0 });
    expect(out.choices[0].message.content).toMatch(/direct answer/);
  });

  test('OLLAMA_FIXTURE=tool_then_text replays the multi-call variant', async () => {
    process.env.OLLAMA_FIXTURE = 'tool_then_text';
    const t0 = await callModel([], [], 'required', { turn: 0 });
    expect(t0.choices[0].message.tool_calls).toHaveLength(2);
  });

  test('overflowing the fixture array returns the last entry', async () => {
    process.env.OLLAMA_FIXTURE = 'direct_answer';
    const out = await callModel([], [], 'auto', { turn: 99 });
    expect(out.choices[0].message.content).toMatch(/direct answer/);
  });

  test('OLLAMA_FIXTURE pointing at a missing variant throws a clear error', async () => {
    process.env.OLLAMA_FIXTURE = 'no_such_variant';
    await expect(callModel([], [], 'auto', { turn: 0 })).rejects.toThrow(/no_such_variant/);
  });
});

describe('callModel with provider = openai', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.OPENAI_API_KEY;
  });

  test('posts to api.openai.com/v1/chat/completions with a Bearer token', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hi from openai' } }] }),
    });
    const out = await callModel(
      [{ role: 'user', content: 'hi' }],
      [],
      'auto',
      { provider: 'openai' },
    );
    expect(out.choices[0].message.content).toBe('hi from openai');
    const url     = global.fetch.mock.calls[0][0];
    const opts    = global.fetch.mock.calls[0][1];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(opts.headers['Authorization']).toBe('Bearer sk-test');
  });

  test('uses the model from opts.model when provided', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'x' } }] }),
    });
    await callModel([{ role: 'user', content: 'hi' }], [], 'auto', { provider: 'openai', model: 'gpt-4o' });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.model).toBe('gpt-4o');
  });
});

describe('callModel with provider = anthropic', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.ANTHROPIC_API_KEY;
  });

  test('posts to api.anthropic.com/v1/messages with x-api-key and anthropic-version', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'hi from anthropic' }] }),
    });
    const out = await callModel(
      [
        { role: 'system', content: 'be brief' },
        { role: 'user',   content: 'hi' },
      ],
      [],
      'auto',
      { provider: 'anthropic' },
    );
    expect(out.choices[0].message.content).toBe('hi from anthropic');
    const url  = global.fetch.mock.calls[0][0];
    const opts = global.fetch.mock.calls[0][1];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(opts.headers['x-api-key']).toBe('sk-ant-test');
    expect(opts.headers['anthropic-version']).toBeTruthy();
    const body = JSON.parse(opts.body);
    expect(body.system).toBe('be brief');
    expect(body.max_tokens).toBeGreaterThan(0);
  });

  test('translates a tool_use response back into the OpenAI tool_calls shape', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          { type: 'text', text: 'calling the tool' },
          { type: 'tool_use', id: 'tool_abc', name: 'lookup', input: { q: 'iphone' } },
        ],
      }),
    });
    const out = await callModel(
      [{ role: 'user', content: 'look it up' }],
      [{
        type: 'function',
        function: {
          name:        'lookup',
          description: 'lookup',
          parameters:  { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
        },
      }],
      'required',
      { provider: 'anthropic' },
    );
    const msg = out.choices[0].message;
    expect(msg.content).toContain('calling the tool');
    expect(msg.tool_calls).toHaveLength(1);
    expect(msg.tool_calls[0].function.name).toBe('lookup');
    expect(JSON.parse(msg.tool_calls[0].function.arguments)).toEqual({ q: 'iphone' });
  });

  test('throws when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(callModel([], [], 'auto', { provider: 'anthropic' })).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});

describe('toAnthropic / fromAnthropic translators', () => {
  test('toAnthropic collects system messages into a single top-level system field', () => {
    const { systemPrompt } = toAnthropic(
      [
        { role: 'system', content: 'be brief' },
        { role: 'system', content: 'be polite' },
        { role: 'user',   content: 'hi' },
      ],
      [],
    );
    expect(systemPrompt).toBe('be brief\n\nbe polite');
  });

  test('toAnthropic translates OpenAI tools to input_schema shape', () => {
    const { tools } = toAnthropic([], [{
      type: 'function',
      function: {
        name:        'lookup',
        description: 'find a thing',
        parameters:  { type: 'object', properties: { q: { type: 'string' } } },
      },
    }]);
    expect(tools).toEqual([{
      name:         'lookup',
      description:  'find a thing',
      input_schema: { type: 'object', properties: { q: { type: 'string' } } },
    }]);
  });

  test('toAnthropic translates tool result messages to a user / tool_result block', () => {
    const { messages } = toAnthropic(
      [
        { role: 'user', content: 'go' },
        { role: 'assistant', content: null, tool_calls: [{
          id: 'call_1', type: 'function', function: { name: 'lookup', arguments: '{"q":"x"}' },
        }] },
        { role: 'tool', tool_call_id: 'call_1', content: '{"ok":true}' },
      ],
      [],
    );
    // user, assistant (with tool_use), user (with tool_result)
    expect(messages).toHaveLength(3);
    expect(messages[1].content[0].type).toBe('tool_use');
    expect(messages[2].content[0].type).toBe('tool_result');
    expect(messages[2].content[0].tool_use_id).toBe('call_1');
  });

  test('fromAnthropic combines text blocks and collects tool_use blocks', () => {
    const out = fromAnthropic({
      content: [
        { type: 'text', text: 'one' },
        { type: 'text', text: 'two' },
        { type: 'tool_use', id: 'i1', name: 'lookup', input: { q: 'x' } },
      ],
    });
    expect(out.choices[0].message.content).toBe('one\ntwo');
    expect(out.choices[0].message.tool_calls[0].function.name).toBe('lookup');
  });
});

describe('callModel with an unknown provider', () => {
  test('throws a clear error', async () => {
    await expect(callModel([], [], 'auto', { provider: 'fakemodel' })).rejects.toThrow(/Unknown LLM_PROVIDER/);
  });
});
