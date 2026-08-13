'use strict';

/**
 * Real MCP client — connects to mcp-server/server.js over stdio.
 *
 * Spawns the server as a child process and talks the actual MCP wire
 * protocol. delegation_gate.js calls executeAction() here instead of
 * requiring action_handlers.js directly, so an action only reaches the
 * wire after the gate has decided the agent has standing to take it.
 */

const path = require('path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const SERVER_PATH = path.join(__dirname, 'mcp-server', 'server.js');

let clientPromise = null;

function getClient() {
  if (!clientPromise) {
    const client = new Client({ name: 'category-e-orchestrator', version: '1.0.0' });
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
 * @param {string} action  one of the six trip action names
 * @param {object} args
 * @returns {Promise<{ result: string }>}
 * @throws when the action is not on the server's tool list
 */
async function executeAction(action, args = {}) {
  const client = await getClient();
  const response = await client.callTool({ name: action, arguments: args });
  const [content] = response.content ?? [];
  const result = content?.type === 'text' ? JSON.parse(content.text) : response;
  if (result.error) throw new Error(result.detail ?? result.error);
  return result;
}

module.exports = { executeAction, closeClient };
