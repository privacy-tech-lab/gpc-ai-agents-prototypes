/**
 * A2A client — sends a message to an agent's A2A server and unpacks the reply.
 *
 * The GPC signal travels in Message.metadata.gpc, the A2A analogue of MCP's
 * params._meta.gpc: both are free-form per-call metadata bags, and both
 * agents/tools read the same key name out of them.
 */

const { randomUUID } = require('crypto');
const { ClientFactory, JsonRpcTransportFactory } = require('@a2a-js/sdk/client');
const { Role } = require('@a2a-js/sdk');

const factory = new ClientFactory({ transports: [new JsonRpcTransportFactory()] });

function extractText(message) {
  const part = (message.parts || []).find((p) => p.content?.$case === 'text');
  return part?.content?.value ?? '';
}

/**
 * @param {object} opts
 * @param {string} opts.baseUrl   — the agent server's base URL
 * @param {string} opts.text      — the query text, sent as the message's text part
 * @param {object} [opts.metadata] — sent as Message.metadata (carries _meta.gpc, rawResults, ...)
 * @returns {Promise<{ text: string, metadata: object }>}
 */
async function callAgent({ baseUrl, text, metadata = {} }) {
  const client = await factory.createFromUrl(baseUrl);

  const message = {
    messageId: randomUUID(),
    contextId: '',
    taskId: '',
    role: Role.ROLE_USER,
    parts: [{
      content: { $case: 'text', value: text },
      metadata: undefined,
      filename: '',
      mediaType: 'text/plain',
    }],
    metadata,
    extensions: [],
    referenceTaskIds: [],
  };

  const result = await client.sendMessage({
    tenant: '',
    message,
    configuration: undefined,
    metadata: undefined,
  });

  // Our executors always reply with a bare Message (no task lifecycle).
  return { text: extractText(result), metadata: result.metadata ?? {} };
}

module.exports = { callAgent };
