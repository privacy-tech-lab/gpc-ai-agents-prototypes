const { runAgentLoop } = require('../orchestrator/agent_loop');

const DEFINITIONS = [{
  type:     'function',
  function: {
    name:        't',
    description: 'tool',
    parameters:  { type: 'object', properties: {} },
  },
}];

describe('runAgentLoop', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  test('returns truncated: true with a diagnostic message when maxTurns is exhausted without content', async () => {
    let n = 0;
    global.fetch = async () => {
      n += 1;
      return { ok: true, json: async () => ({ choices: [{ message: {
        tool_calls: [{ id: 'tc-' + n, function: { name: 't', arguments: '{}' } }],
      } }] }) };
    };

    const r = await runAgentLoop({
      systemPrompt:    '',
      userMessage:     '',
      toolDefinitions: DEFINITIONS,
      executeToolFn:   async () => ({}),
      minToolCalls:    1,
      maxTurns:        3,
    });

    expect(r.truncated).toBe(true);
    expect(r.toolCalls.length).toBe(3);
    expect(r.finalResponse).toMatch(/exhausted maxTurns=3/);
    expect(r.finalResponse).toMatch(/3 tool call/);
  });

  test('returns truncated: false when the model produces content', async () => {
    let n = 0;
    global.fetch = async () => {
      n += 1;
      if (n === 1) {
        return { ok: true, json: async () => ({ choices: [{ message: {
          tool_calls: [{ id: 'a', function: { name: 't', arguments: '{}' } }],
        } }] }) };
      }
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'final summary' } }] }) };
    };

    const r = await runAgentLoop({
      systemPrompt:    '',
      userMessage:     '',
      toolDefinitions: DEFINITIONS,
      executeToolFn:   async () => ({}),
      minToolCalls:    1,
      maxTurns:        5,
    });

    expect(r.truncated).toBe(false);
    expect(r.finalResponse).toBe('final summary');
  });

  test('throws cleanly when Ollama returns non-2xx', async () => {
    global.fetch = async () => ({ ok: false, status: 500, text: async () => 'boom' });
    await expect(runAgentLoop({
      systemPrompt:    '',
      userMessage:     '',
      toolDefinitions: DEFINITIONS,
      executeToolFn:   async () => ({}),
      minToolCalls:    1,
      maxTurns:        2,
    })).rejects.toThrow(/Model API error 500/);
  });
});
