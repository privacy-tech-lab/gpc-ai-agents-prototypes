'use strict';

const registry = require('./tool_registry');
const manifest = require('./consent_manifest');
const bus = require('./event_bus');
const handlers = require('./tool_handlers');

async function withConsentCheck(toolName, args, mode) {
  const tool = registry.getTool(toolName);
  if (!tool) throw new Error(`Unknown tool: ${toolName}`);

  // Silent mode: no registry enforcement — tools are immediately available
  if (mode === 'silent') {
    return { status: 'executed', tool: toolName, ...handlers[toolName](args) };
  }

  const mf = manifest.load();

  // Hard block: user previously declined this category — persists across sessions
  if (manifest.isDeclined(tool.capability_category, mf)) {
    return {
      status: 'blocked',
      reason: 'previously_declined',
      tool: toolName,
      category: tool.capability_category,
    };
  }

  // Quarantine: tool was added after manifest version and category not yet decided
  if (manifest.requiresFreshConsent(tool, mf)) {
    const consentResult = await new Promise(resolve =>
      bus.emit('consent_request', { tool, resolve })
    );

    if (!consentResult.approved) {
      return {
        status: 'quarantined',
        reason: 'user_declined',
        tool: toolName,
        category: tool.capability_category,
        prompt_text: consentResult.promptText,
      };
    }

    return {
      status: 'executed',
      consent_required: true,
      tool: toolName,
      prompt_text: consentResult.promptText,
      ...handlers[toolName](args),
    };
  }

  return { status: 'executed', tool: toolName, ...handlers[toolName](args) };
}

async function invokeTool(toolName, args, mode) {
  return withConsentCheck(toolName, args, mode);
}

module.exports = { invokeTool };
