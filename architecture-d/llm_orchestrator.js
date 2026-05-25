'use strict';

/**
 * LLM Orchestrator — Ollama-backed agent drives the fanout.
 *
 * The model receives a research-style user query and decides which
 * publishers to query and what sub-query to send to each. Every call
 * the model makes flows through the provider middleware, which logs
 * the full per-call trace exactly as the scripted runs do.
 *
 * The structural argument from the scripted runs holds here too: the
 * provider observes every model decision in addition to every site
 * call. The only difference is that the queries are now model-generated
 * rather than hard-coded, which makes the empirical demonstration of
 * provider visibility more compelling.
 */

const { runAgentLoop, MODEL } = require('./agent_loop');
const { listPublisherIds, PUBLISHERS } = require('./tool_registry');

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'query_publisher',
      description: 'Query a single tech publisher for a review snippet. Call this multiple times to gather material from different sources.',
      parameters: {
        type: 'object',
        properties: {
          publisher_id: {
            type:        'string',
            enum:        listPublisherIds(),
            description: 'The publisher to query.',
          },
          sub_query: {
            type:        'string',
            description: 'The specific question to ask this publisher. Tailor it to their typical coverage.',
          },
        },
        required: ['publisher_id', 'sub_query'],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are a research assistant. To answer the user's question you MUST:
1. Decide which publishers (from the available enum) to query — at least 3, ideally a diverse mix.
2. For each chosen publisher, call query_publisher with a sub_query tailored to what that publisher typically covers.
3. Once you have results from several publishers, write a brief consolidated summary of what they collectively say.

Available publishers and their typical coverage:
${PUBLISHERS.map(p => `  - ${p.id} (${p.name})`).join('\n')}`;

/**
 * @param {object} options
 * @param {object} options.provider         — instance from createProvider()
 * @param {string} options.user_id
 * @param {string} options.query
 * @param {0|1}    [options.gpc=0]
 */
async function handleRequest({ provider, user_id, query, gpc = 0 }) {
  const _meta = { gpc };

  const { finalResponse, toolCalls } = await runAgentLoop({
    systemPrompt:    SYSTEM_PROMPT,
    userMessage:     query,
    toolDefinitions: TOOL_DEFINITIONS,
    minToolCalls:    3,
    executeToolFn:   async (toolName, toolInput) => {
      if (toolName !== 'query_publisher') {
        return { status: 'error', reason: `unknown_tool:${toolName}` };
      }
      const { publisher_id, sub_query } = toolInput;
      // Each model decision is one site call routed through the provider.
      const r = await provider.fanout(user_id, sub_query, [publisher_id], _meta);
      return r.site_results[0];
    },
  });

  return {
    model:          MODEL,
    user_facing_summary: finalResponse,
    model_tool_calls: toolCalls.map(tc => ({
      publisher_id: tc.input.publisher_id,
      sub_query:    tc.input.sub_query,
      site_status:  tc.result.status,
      site_received_gpc: tc.result.site_received_gpc,
      tracking_decision: tc.result.tracking_decision,
    })),
  };
}

module.exports = { handleRequest, MODEL, TOOL_DEFINITIONS };
