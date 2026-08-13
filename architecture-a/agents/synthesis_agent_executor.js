/**
 * A2A AgentExecutor wrapper around the synthesis agent.
 *
 * The reasoning itself lives in synthesis_agent.js, unchanged. This module
 * adapts it to the A2A protocol: the query travels in the text part, the raw
 * search results travel in message metadata (the orchestrator forwards what
 * the search agent returned), and the answer comes back as a single Message.
 */

const { randomUUID } = require('crypto');
const { AgentEvent, UnsupportedOperationError } = require('@a2a-js/sdk/server');
const { Role } = require('@a2a-js/sdk');
const synthesisAgent = require('./synthesis_agent.js');

function extractText(message) {
  const part = (message.parts || []).find((p) => p.content?.$case === 'text');
  return part?.content?.value ?? '';
}

const synthesisAgentExecutor = {
  async execute(requestContext, eventBus) {
    const { userMessage, contextId, taskId } = requestContext;
    const query = extractText(userMessage);
    const _meta = userMessage.metadata ?? {};
    const rawResults = _meta.rawResults ?? [];

    const result = await synthesisAgent.run({ query, rawResults, _meta, timing: null });

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
      metadata: {},
      extensions: [],
      referenceTaskIds: [],
    }));
    eventBus.finished();
  },

  async cancelTask() {
    throw new UnsupportedOperationError('synthesis-agent has no long-running tasks to cancel');
  },
};

module.exports = synthesisAgentExecutor;
