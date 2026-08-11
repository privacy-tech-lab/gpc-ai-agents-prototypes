/**
 * A2A AgentExecutor wrapper around the search agent.
 *
 * The LLM loop itself lives in search_agent.js, unchanged. This module only
 * adapts it to the A2A protocol: pull the query and GPC metadata out of the
 * incoming Message, run the existing agent, and publish the result back as
 * a Message event. There is no long-running task here, so every execute()
 * call publishes exactly one message and then finishes.
 */

const { randomUUID } = require('crypto');
const { AgentEvent, UnsupportedOperationError } = require('@a2a-js/sdk/server');
const { Role } = require('@a2a-js/sdk');
const searchAgent = require('./search_agent.js');

function extractText(message) {
  const part = (message.parts || []).find((p) => p.content?.$case === 'text');
  return part?.content?.value ?? '';
}

const searchAgentExecutor = {
  async execute(requestContext, eventBus) {
    const { userMessage, contextId, taskId } = requestContext;
    const query = extractText(userMessage);
    const _meta = userMessage.metadata ?? {};

    const timing = [];
    const result = await searchAgent.run({ query, _meta, timing });

    eventBus.publish(AgentEvent.message({
      messageId: randomUUID(),
      contextId: contextId ?? '',
      taskId: taskId ?? '',
      role: Role.ROLE_AGENT,
      parts: [{
        content: { $case: 'text', value: result.answer },
        metadata: undefined,
        filename: '',
        mediaType: 'text/plain',
      }],
      metadata: { rawResults: result.rawResults, toolCalls: result.toolCalls, timing },
      extensions: [],
      referenceTaskIds: [],
    }));
    eventBus.finished();
  },

  async cancelTask() {
    throw new UnsupportedOperationError('search-agent has no long-running tasks to cancel');
  },
};

module.exports = searchAgentExecutor;
