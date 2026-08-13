/**
 * A2A server exposing the search agent over JSON-RPC.
 *
 * Runs in-process (app.listen(0) picks an OS-assigned port) rather than as a
 * subprocess, so tests that jest.mock() search_agent.js still see the mock:
 * this server requires the same module instance from the same Jest registry.
 */

const express = require('express');
const { DefaultRequestHandler, InMemoryTaskStore } = require('@a2a-js/sdk/server');
const { jsonRpcHandler, agentCardHandler, UserBuilder } = require('@a2a-js/sdk/server/express');

const searchAgentExecutor = require('./search_agent_executor.js');

function buildAgentCard(url) {
  return {
    name: 'search-agent',
    description: 'Gathers raw web search material for a travel-planning request.',
    supportedInterfaces: [{ url, protocolBinding: 'JSONRPC', tenant: '', protocolVersion: '1.0' }],
    provider: undefined,
    version: '1.0.0',
    documentationUrl: undefined,
    capabilities: { streaming: false, pushNotifications: false, extensions: [], extendedAgentCard: false },
    securitySchemes: {},
    securityRequirements: [],
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
    skills: [{
      id: 'search_web',
      name: 'Web search',
      description: 'Searches the web for travel information and summarizes the raw results found.',
      tags: ['search', 'travel'],
      examples: ['Find sights, food, and travel tips for a Japan trip.'],
      inputModes: ['text/plain'],
      outputModes: ['text/plain'],
      securityRequirements: [],
    }],
    signatures: [],
    iconUrl: undefined,
  };
}

/**
 * Starts the search agent's A2A server.
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
function start() {
  return new Promise((resolve) => {
    const app = express();
    app.use(express.json());

    const server = app.listen(0, () => {
      const { port } = server.address();
      const url = `http://127.0.0.1:${port}/`;
      const agentCard = buildAgentCard(url);
      const requestHandler = new DefaultRequestHandler(agentCard, new InMemoryTaskStore(), searchAgentExecutor);

      app.use('/.well-known/agent-card.json', agentCardHandler({ agentCardProvider: requestHandler }));
      app.use(jsonRpcHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication }));

      resolve({
        url,
        close: () => new Promise((res, rej) => server.close((err) => (err ? rej(err) : res()))),
      });
    });
  });
}

module.exports = { start };
