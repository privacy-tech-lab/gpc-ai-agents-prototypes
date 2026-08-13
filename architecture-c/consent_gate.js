'use strict';

/**
 * consent_gate.js — the withConsentCheck() interceptor (formerly mcp_server.js).
 *
 * Renamed to avoid colliding with the real MCP server now in mcp-server/,
 * added so tool execution itself travels over a real MCP stdio connection
 * (mcp_client.js). The consent decision-making here stays client-side —
 * see mcp-server/server.js for why (the quarantine pause needs interactive
 * stdin, which the MCP transport itself occupies once a tool call reaches
 * the server).
 */

const registry = require('./tool_registry');
const manifest = require('./consent_manifest');
const bus = require('./event_bus');
const mcpClient = require('./mcp_client');

// Categories the user explicitly consented to at signup.
// GPC auto-decline applies only to categories outside this set.
const PRIMARY_CATEGORIES = new Set(['file_access', 'external_api']);

async function withConsentCheck(toolName, args, mode, gpc = false) {
  const tool = registry.getTool(toolName);
  if (!tool) throw new Error(`Unknown tool: ${toolName}`);

  // Silent mode: no registry enforcement — tools are immediately available
  if (mode === 'silent') {
    return { status: 'executed', tool: toolName, ...(await mcpClient.callTool(toolName, args)) };
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

  // GPC signal: auto-decline non-primary categories without prompting the user.
  // The global opt-out signal makes the decision that would otherwise require
  // a per-tool consent prompt.
  if (gpc && !PRIMARY_CATEGORIES.has(tool.capability_category) && manifest.requiresFreshConsent(tool, mf)) {
    manifest.decline(tool.capability_category);
    return {
      status: 'blocked',
      reason: 'gpc_auto_decline',
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
      ...(await mcpClient.callTool(toolName, args)),
    };
  }

  return { status: 'executed', tool: toolName, ...(await mcpClient.callTool(toolName, args)) };
}

async function invokeTool(toolName, args, mode, gpc = false) {
  return withConsentCheck(toolName, args, mode, gpc);
}

module.exports = { invokeTool, PRIMARY_CATEGORIES };
