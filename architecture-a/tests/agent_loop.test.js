/**
 * Unit tests for orchestrator/agent_loop.js.
 *
 * The Ollama API is mocked via global.fetch — no model needs to be running.
 */

// Assign mock before the module loads so agent_loop captures it
global.fetch = jest.fn();
const { runAgentLoop } = require('../orchestrator/agent_loop.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

const { ollamaOk, toolMsg, textMsg } = require('./helpers/ollama');

const SEARCH_TOOL = [{
  type: 'function',
  function: {
    name:       'search_web',
    parameters: { type: 'object', properties: { query: { type: 'string' } } },
  },
}];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runAgentLoop — basic turn flow', () => {
  beforeEach(() => global.fetch.mockReset());

  test('calls a required tool then returns the final text response', async () => {
    global.fetch
      .mockResolvedValueOnce(ollamaOk(toolMsg('search_web', { query: 'GPC' })))
      .mockResolvedValueOnce(ollamaOk(textMsg('GPC is a privacy signal.')));

    const executeToolFn = jest.fn().mockResolvedValue({ status: 'ok', results: [] });

    const result = await runAgentLoop({
      systemPrompt:    'You are a search agent.',
      userMessage:     'Research GPC.',
      toolDefinitions: SEARCH_TOOL,
      requiredTools:   ['search_web'],
      executeToolFn,
    });

    expect(executeToolFn).toHaveBeenCalledWith('search_web', { query: 'GPC' });
    expect(result.finalResponse).toBe('GPC is a privacy signal.');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({ tool: 'search_web', input: { query: 'GPC' } });
  });

  test('runs with no required tools and returns first text response', async () => {
    global.fetch.mockResolvedValueOnce(ollamaOk(textMsg('Direct answer.')));
    const executeToolFn = jest.fn();

    const result = await runAgentLoop({
      systemPrompt: '', userMessage: 'Answer.',
      toolDefinitions: [], requiredTools: [],
      executeToolFn,
    });

    expect(result.finalResponse).toBe('Direct answer.');
    expect(result.toolCalls).toHaveLength(0);
    expect(executeToolFn).not.toHaveBeenCalled();
  });

  test('handles multiple required tools across consecutive turns', async () => {
    const TOOLS = [
      { type: 'function', function: { name: 'tool_a', parameters: {} } },
      { type: 'function', function: { name: 'tool_b', parameters: {} } },
    ];

    global.fetch
      .mockResolvedValueOnce(ollamaOk(toolMsg('tool_a', {}, 'c1')))
      .mockResolvedValueOnce(ollamaOk(toolMsg('tool_b', {}, 'c2')))
      .mockResolvedValueOnce(ollamaOk(textMsg('All done.')));

    const executeToolFn = jest.fn().mockResolvedValue({ status: 'ok' });

    const result = await runAgentLoop({
      systemPrompt: '', userMessage: '',
      toolDefinitions: TOOLS,
      requiredTools:   ['tool_a', 'tool_b'],
      executeToolFn,
    });

    expect(executeToolFn).toHaveBeenCalledTimes(2);
    expect(result.toolCalls.map((tc) => tc.tool)).toEqual(['tool_a', 'tool_b']);
    expect(result.finalResponse).toBe('All done.');
  });
});

describe('runAgentLoop — tool_choice switching', () => {
  beforeEach(() => global.fetch.mockReset());

  test('sends tool_choice=required while required tools remain, auto after', async () => {
    global.fetch
      .mockResolvedValueOnce(ollamaOk(toolMsg('search_web', { query: 'test' })))
      .mockResolvedValueOnce(ollamaOk(textMsg('done')));

    await runAgentLoop({
      systemPrompt: '', userMessage: '',
      toolDefinitions: SEARCH_TOOL,
      requiredTools:   ['search_web'],
      executeToolFn: jest.fn().mockResolvedValue({ status: 'ok' }),
    });

    const body0 = JSON.parse(global.fetch.mock.calls[0][1].body);
    const body1 = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(body0.tool_choice).toBe('required');
    expect(body1.tool_choice).toBe('auto');
  });

  test('sends tool_choice=auto from the first turn when no required tools', async () => {
    global.fetch.mockResolvedValueOnce(ollamaOk(textMsg('done')));

    await runAgentLoop({
      systemPrompt: '', userMessage: '',
      toolDefinitions: SEARCH_TOOL,
      requiredTools:   [],
      executeToolFn: jest.fn(),
    });

    const body0 = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body0.tool_choice).toBe('auto');
  });
});

describe('runAgentLoop — nudge behaviour', () => {
  beforeEach(() => global.fetch.mockReset());

  test('nudges model when it returns no tool call during required phase', async () => {
    global.fetch
      .mockResolvedValueOnce(ollamaOk({ content: null, tool_calls: null }))  // model ignores required
      .mockResolvedValueOnce(ollamaOk(toolMsg('search_web', { query: 'test' })))
      .mockResolvedValueOnce(ollamaOk(textMsg('Done.')));

    const executeToolFn = jest.fn().mockResolvedValue({ status: 'ok' });

    const result = await runAgentLoop({
      systemPrompt: '', userMessage: '',
      toolDefinitions: SEARCH_TOOL,
      requiredTools:   ['search_web'],
      executeToolFn,
    });

    expect(executeToolFn).toHaveBeenCalledTimes(1);
    expect(result.finalResponse).toBe('Done.');
    // three rounds: nudge turn + tool turn + final-text turn
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  test('requests a summary when model returns empty string in auto mode', async () => {
    global.fetch
      .mockResolvedValueOnce(ollamaOk(toolMsg('search_web', { query: 'GPC' })))
      .mockResolvedValueOnce(ollamaOk(textMsg('')))          // empty auto response
      .mockResolvedValueOnce(ollamaOk(textMsg('Summary.')));

    const result = await runAgentLoop({
      systemPrompt: '', userMessage: '',
      toolDefinitions: SEARCH_TOOL,
      requiredTools:   ['search_web'],
      executeToolFn: jest.fn().mockResolvedValue({ status: 'ok' }),
    });

    expect(result.finalResponse).toBe('Summary.');
  });
});

describe('runAgentLoop — tool call logging', () => {
  beforeEach(() => global.fetch.mockReset());

  test('logs tool calls with name, parsed input, and result', async () => {
    global.fetch
      .mockResolvedValueOnce(ollamaOk(toolMsg('search_web', { query: 'log test' })))
      .mockResolvedValueOnce(ollamaOk(textMsg('done')));

    const fakeResult = { status: 'ok', data: 42 };

    const result = await runAgentLoop({
      systemPrompt: '', userMessage: '',
      toolDefinitions: SEARCH_TOOL,
      requiredTools:   ['search_web'],
      executeToolFn:   jest.fn().mockResolvedValue(fakeResult),
    });

    expect(result.toolCalls[0]).toMatchObject({
      tool:   'search_web',
      input:  { query: 'log test' },
      result: fakeResult,
    });
  });

  test('parses JSON-string tool arguments before passing to executeToolFn', async () => {
    global.fetch
      .mockResolvedValueOnce(ollamaOk({
        content:    null,
        tool_calls: [{ id: 'c1', function: { name: 'search_web', arguments: '{"query":"parsed"}' } }],
      }))
      .mockResolvedValueOnce(ollamaOk(textMsg('ok')));

    const executeToolFn = jest.fn().mockResolvedValue({ status: 'ok' });

    await runAgentLoop({
      systemPrompt: '', userMessage: '',
      toolDefinitions: SEARCH_TOOL,
      requiredTools:   ['search_web'],
      executeToolFn,
    });

    expect(executeToolFn).toHaveBeenCalledWith('search_web', { query: 'parsed' });
  });

  test('passes blocked tool results back to the model unchanged', async () => {
    const blocked = { status: 'blocked', reason: 'gpc_opt_out' };

    global.fetch
      .mockResolvedValueOnce(ollamaOk(toolMsg('save_to_profile', { user_id: 'u1', data: {} })))
      .mockResolvedValueOnce(ollamaOk(textMsg('Blocked, understood.')));

    const result = await runAgentLoop({
      systemPrompt: '', userMessage: '',
      toolDefinitions: [{ type: 'function', function: { name: 'save_to_profile', parameters: {} } }],
      requiredTools:   ['save_to_profile'],
      executeToolFn:   jest.fn().mockResolvedValue(blocked),
    });

    expect(result.toolCalls[0].result).toEqual(blocked);
    expect(result.finalResponse).toBe('Blocked, understood.');
  });
});

describe('runAgentLoop — error handling', () => {
  beforeEach(() => global.fetch.mockReset());

  test('throws when the model API returns a non-ok status', async () => {
    global.fetch.mockResolvedValueOnce({
      ok:   false,
      status: 503,
      text: () => Promise.resolve('Service Unavailable'),
    });

    await expect(
      runAgentLoop({
        systemPrompt: '', userMessage: '',
        toolDefinitions: [], requiredTools: [],
        executeToolFn: jest.fn(),
      })
    ).rejects.toThrow('Model API error 503');
  });
});
