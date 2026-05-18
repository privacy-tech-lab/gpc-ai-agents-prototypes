/**
 * Diff the baseline and GPC run outputs and print a human-readable report.
 *
 * Checks:
 *  - Which tools executed (status=ok) vs were blocked (status=blocked)
 *  - Whether the interaction log grew between runs
 *  - Whether the vector store grew between runs
 *  - Per-tool timing overhead
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const USE_AI     = process.argv.includes('--ai');

function loadJson(file) {
  const p = path.join(OUTPUT_DIR, file);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// Scripted orchestrator output shape: result.search.search, result.data.*
function collectToolStatuses(result) {
  const statuses = {};
  if (!result) return statuses;

  const { search, data } = result;

  if (search?.search) statuses['search_web'] = search.search.status;

  const d = data ?? {};
  if (d.profile_lookup)    statuses['user_profile_lookup'] = d.profile_lookup.status;
  if (d.log_interaction)   statuses['log_interaction']     = d.log_interaction.status;
  if (d.save_to_profile)   statuses['save_to_profile']     = d.save_to_profile.status;
  if (d.third_party_store) statuses['third_party_store']   = d.third_party_store.status;

  return statuses;
}

// LLM orchestrator output shape: result.search_agent.toolCalls[], result.data_agent.toolCalls[]
function collectAiToolStatuses(result) {
  const statuses = {};
  if (!result) return statuses;

  for (const tc of (result.search_agent?.toolCalls ?? [])) {
    statuses[tc.tool] = tc.result?.status ?? 'unknown';
  }
  for (const tc of (result.data_agent?.toolCalls ?? [])) {
    statuses[tc.tool] = tc.result?.status ?? 'unknown';
  }

  return statuses;
}

function countLines(file) {
  if (!fs.existsSync(file)) return 0;
  const content = fs.readFileSync(file, 'utf8').trim();
  return content ? content.split('\n').length : 0;
}

function countEntries(file) {
  if (!fs.existsSync(file)) return 0;
  return JSON.parse(fs.readFileSync(file, 'utf8')).length;
}

function main() {
  let baseline, gpc, signalDrop, bStatuses, gStatuses, sdStatuses;

  if (USE_AI) {
    baseline   = loadJson('ai_baseline_result.json');
    gpc        = loadJson('ai_gpc_result.json');
    signalDrop = loadJson('ai_signal_drop_result.json');   // may not exist yet
    bStatuses  = collectAiToolStatuses(baseline);
    gStatuses  = collectAiToolStatuses(gpc);
    sdStatuses = collectAiToolStatuses(signalDrop);
  } else {
    baseline   = loadJson('baseline_result.json');
    gpc        = loadJson('gpc_result.json');
    signalDrop = loadJson('signal_drop_result.json');
    bStatuses  = collectToolStatuses(baseline);
    gStatuses  = collectToolStatuses(gpc);
    sdStatuses = collectToolStatuses(signalDrop);
  }

  const allTools = [...new Set([
    ...Object.keys(bStatuses),
    ...Object.keys(gStatuses),
    ...Object.keys(sdStatuses),
  ])];

  const mode = USE_AI ? 'AI (multi-agent LLM)' : 'Scripted';
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║     GPC Propagation Report — Architecture A [${mode.padEnd(19)}]║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  if (USE_AI && baseline?.model) console.log('Model:', baseline.model, '\n');

  // ── Tool execution table ──
  const COL = 28;
  const header = [
    'Tool'.padEnd(COL),
    'Baseline'.padEnd(12),
    'GPC'.padEnd(12),
    'Signal-drop'.padEnd(14),
  ].join(' │ ');
  const sep = '─'.repeat(header.length);

  console.log(header);
  console.log(sep);

  for (const tool of allTools) {
    const b  = bStatuses[tool]  ?? '—';
    const g  = gStatuses[tool]  ?? '—';
    const sd = sdStatuses[tool] ?? '—';

    const fmt = (s) => {
      if (s === 'ok')      return '✓ ok        ';
      if (s === 'blocked') return '✗ BLOCKED   ';
      return (s + '        ').slice(0, 12);
    };

    console.log([
      tool.padEnd(COL),
      fmt(b).padEnd(12),
      fmt(g).padEnd(12),
      fmt(sd).padEnd(14),
    ].join(' │ '));
  }

  // ── Storage state ──
  const logLines  = countLines(path.join(OUTPUT_DIR, 'interaction_log.jsonl'));
  const storeSize = countEntries(path.join(OUTPUT_DIR, 'vector_store.json'));

  console.log('\n── Storage state after runs ──');
  console.log(`  interaction_log.jsonl : ${logLines} entries`);
  console.log(`  vector_store.json     : ${storeSize} entries`);

  // ── Timing ──
  if (baseline?.timing?.length) {
    console.log('\n── Per-tool timing (baseline) ──');
    for (const t of baseline.timing) {
      console.log(`  ${t.tool.padEnd(COL)} ${t.durationMs} ms`);
    }
  }

  if (gpc?.timing?.length) {
    console.log('\n── Per-tool timing (GPC run) ──');
    for (const t of gpc.timing) {
      console.log(`  ${t.tool.padEnd(COL)} ${t.durationMs} ms`);
    }
  }

  // ── Signal-drop finding ──
  if (signalDrop) {
    // Layer 4 (MCP metadata) dropped if sensitive MCP tools ran despite gpc=1
    const mcpSensitiveTools = ['user_profile_lookup', 'log_interaction', 'save_to_profile'];
    const mcpLayerDropped = mcpSensitiveTools.some((t) => sdStatuses[t] === 'ok');
    // Layer 3 (JWT) held if the third-party store was still blocked
    const jwtLayerHeld = sdStatuses['third_party_store'] === 'blocked';

    console.log('\n── Signal-drop experiment ──');
    if (mcpLayerDropped) {
      console.log('  ⚠  Layer 4 (MCP metadata) FAILED: stripping _meta caused sensitive');
      console.log('     MCP tools to execute despite gpc=1 in the Baggage header.');
      const ran = mcpSensitiveTools.filter((t) => sdStatuses[t] === 'ok');
      console.log(`     Tools that ran: ${ran.join(', ')}`);
    }
    if (jwtLayerHeld) {
      console.log('  ✓  Layer 3 (JWT trust boundary) held: third_party_store still blocked');
      console.log('     because the JWT is issued by the Orchestrator before the drop,');
      console.log('     and the vendor verifies it independently.');
    }
    if (mcpLayerDropped && jwtLayerHeld) {
      console.log('\n  Finding: without a spec-level requirement to forward _meta, an');
      console.log('  intermediate agent can silently nullify consent for all MCP-layer');
      console.log('  enforcement. Only the signed JWT provides a trust-boundary backstop.');
    }
  }

  console.log();
}

main();
