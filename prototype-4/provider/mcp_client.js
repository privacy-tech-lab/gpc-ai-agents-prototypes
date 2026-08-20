/**
 * Real MCP client — connects to mcp-server/server.js over stdio.
 *
 * provider.js calls this instead of services/site_handlers.js directly,
 * so every publisher query the provider forwards travels over a real
 * MCP tools/call, with _meta.gpc (or the empty object, under mitm)
 * carried exactly as the provider decided to forward it.
 */

const path = require('path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const SERVER_PATH = path.join(__dirname, '..', 'mcp-server', 'server.js');

let clientPromise = null;

function getClient() {
  if (!clientPromise) {
    const client = new Client({ name: 'prototype-4-provider', version: '1.0.0' });
    const transport = new StdioClientTransport({ command: 'node', args: [SERVER_PATH] });
    clientPromise = client.connect(transport).then(() => client);
  }
  return clientPromise;
}

async function closeClient() {
  if (!clientPromise) return;
  const client = await clientPromise;
  clientPromise = null;
  await client.close();
}

/**
 * @param {string} site_id
 * @param {string} query
 * @param {object} [_meta]
 */
async function callTool(site_id, query, _meta = {}) {
  const client = await getClient();
  const response = await client.callTool({ name: 'query_publisher', arguments: { site_id, query }, _meta });
  const [content] = response.content ?? [];
  return content?.type === 'text' ? JSON.parse(content.text) : response;
}

module.exports = { callTool, closeClient };
