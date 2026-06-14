const { runAgentLoop } = require('../orchestrator/agent_loop.js');
const { get_medical_records } = require('../services/medicalRecords.js');
const { PRIMARY_PURPOSE } = require('../lib/purposeRegistry.js');

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'get_medical_records',
      description: "Retrieve a patient's health records (readings, medications).",
      parameters: {
        type: 'object',
        properties: { patient_id: { type: 'string' } },
        required: ['patient_id'],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are a medical assistant. When the patient asks about their \
health data, call get_medical_records to retrieve their records, then answer their \
question clearly and accurately using that data. Always retrieve records before answering.`;

async function executeToolFn(name, input) {
  switch (name) {
    case 'get_medical_records': return get_medical_records(input);
    default: return { error: 'unknown_tool', name };
  }
}

/**
 * @param {object} opts
 * @param {string} opts.query
 * @param {string} opts.patient_id
 * @param {object} [opts.privacyContext]
 * @returns {{ finalResponse: string, toolCalls: Array }}
 */
async function run({ query, patient_id, privacyContext = {} }) {
  return runAgentLoop({
    systemPrompt:    SYSTEM_PROMPT,
    userMessage:     query,
    toolDefinitions: TOOL_DEFINITIONS,
    requiredTools:   ['get_medical_records'],
    executeToolFn,
    privacyContext,
    purpose:         PRIMARY_PURPOSE,
  });
}

module.exports = { run };
