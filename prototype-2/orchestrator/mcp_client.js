/**
 * Real MCP client — connects to mcp-server/server.js over stdio.
 *
 * Spawns the server as a child process and talks the actual MCP wire
 * protocol (initialize, tools/call) via @modelcontextprotocol/sdk, rather
 * than calling get_medical_records in-process.
 */

const path = require('path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const SERVER_PATH = path.join(__dirname, '..', 'mcp-server', 'server.js');

let clientPromise = null;

function getClient() {
  if (!clientPromise) {
    const client = new Client({ name: 'prototype-2-medical-agent', version: '1.0.0' });
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
 * @param {string} toolName
 * @param {object} args
 */
async function callTool(toolName, args) {
  const client = await getClient();
  const response = await client.callTool({ name: toolName, arguments: args });
  const [content] = response.content ?? [];
  return content?.type === 'text' ? JSON.parse(content.text) : response;
}

module.exports = { callTool, closeClient };
