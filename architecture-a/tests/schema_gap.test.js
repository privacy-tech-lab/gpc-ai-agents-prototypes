/**
 * Evidence for the dedicated-field proposal (see proposal-dedicated-field/
 * and the "Proposal: a dedicated opt-out field" section of the README).
 *
 * MCP's tools/call params schema, as shipped in @modelcontextprotocol/sdk,
 * only declares name, arguments, and _meta. This test proves that a
 * privacySignals field placed alongside them is silently stripped by the
 * real SDK's request validation, while _meta survives untouched, so a
 * dedicated field cannot travel over the real protocol today: _meta is the
 * only extension point the spec actually recognises.
 */

const { CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

describe('MCP tools/call schema gap', () => {
  test('privacySignals is silently stripped; _meta survives', () => {
    const raw = {
      method: 'tools/call',
      params: {
        name: 'save_to_profile',
        arguments: { user_id: 'user-42' },
        privacySignals: { gpc: true },
        _meta: { someOtherExtension: 'value' },
      },
    };

    const parsed = CallToolRequestSchema.parse(raw);

    expect(parsed.params.privacySignals).toBeUndefined();
    expect(parsed.params._meta).toEqual({ someOtherExtension: 'value' });
  });

  test('a signal nested inside _meta survives parsing', () => {
    const raw = {
      method: 'tools/call',
      params: {
        name: 'save_to_profile',
        arguments: { user_id: 'user-42' },
        _meta: { gpc: 1 },
      },
    };

    const parsed = CallToolRequestSchema.parse(raw);

    expect(parsed.params._meta).toEqual({ gpc: 1 });
  });
});
