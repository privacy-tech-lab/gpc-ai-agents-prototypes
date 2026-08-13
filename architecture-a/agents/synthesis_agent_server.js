/**
 * A2A server exposing the synthesis agent over JSON-RPC.
 *
 * Runs in-process (app.listen(0) picks an OS-assigned port) rather than as a
 * subprocess, so tests that jest.mock() synthesis_agent.js still see the
 * mock: this server requires the same module instance from the same Jest
 * registry.
 */

const express = require('express');
const { DefaultRequestHandler, InMemoryTaskStore } = require('@a2a-js/sdk/server');
const { jsonRpcHandler, agentCardHandler, UserBuilder } = require('@a2a-js/sdk/server/express');

const synthesisAgentExecutor = require('./synthesis_agent_executor.js');

function buildAgentCard(url) {
  return {
    name: 'synthesis-agent',
    description: 'Synthesizes raw search results into a structured travel itinerary.',
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
      id: 'synthesize_itinerary',
      name: 'Itinerary synthesis',
      description: 'Turns raw search results into a day-by-day itinerary. Calls no tools.',
      tags: ['synthesis', 'travel'],
      examples: ['Turn these search results into a 5-day Japan itinerary.'],
      inputModes: ['text/plain'],
      outputModes: ['text/plain'],
      securityRequirements: [],
    }],
    signatures: [],
    iconUrl: undefined,
  };
}

/**
 * Starts the synthesis agent's A2A server.
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
      const requestHandler = new DefaultRequestHandler(agentCard, new InMemoryTaskStore(), synthesisAgentExecutor);

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
