/**
 * A2A Agent Server — illustrative only, not exercised by tests or the demo
 * (mirrors the role of mcp/mcp-server/server.js). Shows how the same
 * privacy_policy.js interceptor plugs into a real @a2a-js/sdk agent, wired
 * behind an AgentExecutor and an Express-based request handler, instead of
 * the in-process client used by harness/ and tests/.
 *
 * Every incoming Message is checked against the sensitive-operation registry
 * before its operation runs, using the same withPrivacyPolicy() interceptor
 * as the in-process demo. If gpc=1 appears in message.metadata, the caller
 * gets back a blocked response instead of the operation's result.
 */

const express = require('express');
const { DefaultRequestHandler, InMemoryTaskStore } = require('@a2a-js/sdk/server');
const { jsonRpcHandler, agentCardHandler, UserBuilder } = require('@a2a-js/sdk/server/express');

const { withPrivacyPolicy } = require('./privacy_policy.js');
const handlers = require('./tool_handlers.js');

const wrappedHandlers = {
  user_profile_lookup: withPrivacyPolicy('user_profile_lookup', handlers.user_profile_lookup),
  save_to_profile: withPrivacyPolicy('save_to_profile', handlers.save_to_profile),
  log_interaction: withPrivacyPolicy('log_interaction', handlers.log_interaction),
  search_web: withPrivacyPolicy('search_web', handlers.search_web),
};

const AGENT_CARD = {
  name: 'gpc-demo-agent',
  description: 'Reference agent for GPC enforcement over A2A (Architecture A).',
  version: '1.0.0',
  url: 'http://localhost:41241/',
  capabilities: { extensions: [] },
  defaultInputModes: ['application/json'],
  defaultOutputModes: ['application/json'],
  skills: [],
};

class GpcDemoAgentExecutor {
  async execute(requestContext, eventBus) {
    const message = requestContext.userMessage;
    const dataPart = message.parts.find((p) => p.kind === 'data');
    const { operation, ...args } = dataPart?.data ?? {};

    const handler = wrappedHandlers[operation];
    const result = handler
      ? await handler(args, message.metadata ?? {})
      : { status: 'error', reason: `unknown operation: ${operation}` };

    eventBus.publish({
      kind: 'message',
      messageId: require('crypto').randomUUID(),
      role: 'agent',
      parts: [{ kind: 'data', data: result }],
      contextId: message.contextId,
    });
    eventBus.finished();
  }

  async cancelTask(taskId, eventBus) {
    // No long-running tasks in this demo agent.
  }
}

async function main() {
  const requestHandler = new DefaultRequestHandler(
    AGENT_CARD,
    new InMemoryTaskStore(),
    new GpcDemoAgentExecutor(),
  );

  const app = express();
  app.use(express.json());
  app.use('/.well-known/agent-card.json', agentCardHandler({ agentCardProvider: requestHandler }));
  app.use(jsonRpcHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication }));

  const PORT = process.env.PORT || 41241;
  app.listen(PORT, () => {
    console.log(`GPC demo A2A agent listening on http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { GpcDemoAgentExecutor, AGENT_CARD };
