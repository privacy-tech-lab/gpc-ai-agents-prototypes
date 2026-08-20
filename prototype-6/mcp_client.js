'use strict';

/**
 * Real MCP client — connects to mcp-server/server.js over stdio.
 *
 * Spawns the server as a child process and talks the actual MCP wire
 * protocol. orchestrator.js and agent.js call classify() here instead of
 * requiring inference_classifier.js directly.
 */

const path = require('path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const SERVER_PATH = path.join(__dirname, 'mcp-server', 'server.js');

let clientPromise = null;

function getClient() {
  if (!clientPromise) {
    const client = new Client({ name: 'category-b-orchestrator', version: '1.0.0' });
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
 * @param {string} draftId
 * @returns {Promise<{ polished_email: string, inferred_attributes: object, attribute_sources: object }>}
 * @throws when the draft is not in the classifier's table (matches the
 *         original synchronous classify()'s throw-on-unknown contract)
 */
async function classify(draftId) {
  const client = await getClient();
  const response = await client.callTool({ name: 'classify_draft', arguments: { draft_id: draftId } });
  const [content] = response.content ?? [];
  const result = content?.type === 'text' ? JSON.parse(content.text) : response;
  if (result.error) throw new Error(result.detail ?? result.error);
  return result;
}

module.exports = { classify, closeClient };
