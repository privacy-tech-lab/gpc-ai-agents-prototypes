/**
 * Real MCP client — connects to mcp-server/server.js over stdio.
 *
 * Spawns the server as a child process and talks the actual MCP wire
 * protocol (initialize, tools/call) via @modelcontextprotocol/sdk, rather
 * than importing the tool handlers in-process. The GPC signal travels in
 * params._meta.gpc on every tools/call request, exactly as server.js reads it.
 */

const path = require('path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const SERVER_PATH = path.join(__dirname, '..', 'mcp-server', 'server.js');

let clientPromise = null;

function getClient() {
  if (!clientPromise) {
    const client = new Client({ name: 'prototype-1-orchestrator', version: '1.0.0' });
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
 * Simulate an MCP tools/call request over the real stdio transport.
 *
 * @param {string}  toolName           — maps to params.name
 * @param {object}  args               — maps to params.arguments
 * @param {object}  [_meta]            — maps to params._meta; set _meta.gpc=1 to opt out
 * @param {Array}   [timing]
 */
async function callTool(toolName, args, _meta = {}, timing = null) {
  const client = await getClient();
  const start = Date.now();

  const response = await client.callTool({ name: toolName, arguments: args, _meta });
  const [content] = response.content ?? [];
  const result = content?.type === 'text' ? JSON.parse(content.text) : response;

  const elapsed = Date.now() - start;
  if (timing) {
    timing.push({ tool: toolName, durationMs: elapsed, status: result.status });
  }

  return result;
}

module.exports = { callTool, closeClient };
