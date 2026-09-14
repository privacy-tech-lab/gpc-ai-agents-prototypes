'use strict';

/**
 * curtain.js: terminal "behind the curtain" renderer.
 *
 * Every prototype makes its enforcement decisions in code that returns a
 * structured result (status, reason, would_have_*). This module turns those
 * moments into a live, numbered trace on the terminal, so someone watching
 * a demo can see the signal travel and each gate decide.
 *
 * Off by default. Turn it on with CURTAIN=1 in the environment or a
 * --curtain flag on the command line. When off, every function here is a
 * no-op, so tests and normal runs are unchanged.
 *
 * All output goes to stderr. Two of the prototypes talk JSON-RPC on stdout
 * (the MCP stdio transport), so nothing here may ever write to stdout.
 */

const out = process.stderr;

function active() {
  if (process.env.CURTAIN === '1' || process.env.CURTAIN === 'true') return true;
  return process.argv.includes('--curtain');
}

const useColor = out.isTTY && !process.env.NO_COLOR;
const C = useColor
  ? { reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
      red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
      blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m' }
  : { reset: '', dim: '', bold: '', red: '', green: '', yellow: '', blue: '', magenta: '', cyan: '' };

let stepCount = 0;

function write(line) {
  out.write(line + '\n');
}

function compact(obj) {
  if (obj === undefined || obj === null) return '';
  try {
    const s = JSON.stringify(obj);
    return s === '{}' ? '(empty)' : s;
  } catch {
    return String(obj);
  }
}

function stepPrefix() {
  stepCount += 1;
  return `${C.dim}│${C.reset} ${C.bold}${String(stepCount).padStart(2, ' ')}${C.reset} `;
}

/** Header for one run. Resets step numbering. */
function banner(title, subtitle) {
  if (!active()) return;
  stepCount = 0;
  write('');
  write(`${C.dim}┌─ BEHIND THE CURTAIN ── ${C.reset}${C.bold}${title}${C.reset}`);
  if (subtitle) write(`${C.dim}│${C.reset} ${C.dim}${subtitle}${C.reset}`);
}

/** The privacy signal being read at the front door. */
function signal(text, ctx) {
  if (!active()) return;
  write(`${stepPrefix()}${C.cyan}◉ signal${C.reset}  ${text}${ctx !== undefined ? `  ${C.cyan}${compact(ctx)}${C.reset}` : ''}`);
}

/** The signal or a request crossing a boundary (A2A hop, envelope build, provider). */
function hop(protocol, target, envelope) {
  if (!active()) return;
  write(`${stepPrefix()}${C.blue}→ ${protocol}${C.reset}  ${target}  ${C.blue}${compact(envelope)}${C.reset}`);
}

/** A call about to be gated or executed. */
function call(protocol, name, envelope) {
  if (!active()) return;
  write(`${stepPrefix()}${C.yellow}▸ ${protocol}${C.reset}  ${name}  ${C.dim}${compact(envelope)}${C.reset}`);
}

const GOOD = new Set(['ok', 'executed', 'executed_after_approval', 'stored', 'recorded',
  'derived', 'archived', 'recalled', 'synthesized', 'allowed', 'logged']);
const STOPPED = new Set(['blocked', 'declined', 'declined_by_user', 'discarded',
  'suppressed', 'quarantined', 'skipped', 'error']);

/**
 * Render a gate decision from the structured result the gates already
 * return. Understands the shared vocabulary: status, reason, tier,
 * tier_source, and any would_have_* field.
 */
function verdict(result, label) {
  if (!active()) return;
  if (!result || typeof result !== 'object') return;

  const status = String(result.status ?? 'unknown');
  const name = label ?? result.tool ?? result.action ?? result.site ?? result.purpose
    ?? result.layer ?? result.stage ?? result.checkpoint ?? '';

  let icon;
  let color;
  if (GOOD.has(status)) { icon = '✓'; color = C.green; }
  else if (STOPPED.has(status)) { icon = '✗'; color = C.red; }
  else { icon = '○'; color = C.yellow; }

  const bits = [`${color}${icon} ${status.toUpperCase()}${C.reset}`, name];
  if (result.reason) bits.push(`${C.dim}reason=${result.reason}${C.reset}`);
  if (result.tier) bits.push(`${C.dim}tier=${result.tier}${result.tier_source ? ` (${result.tier_source})` : ''}${C.reset}`);
  write(`${stepPrefix()}${bits.filter(Boolean).join('  ')}`);

  for (const key of Object.keys(result)) {
    if (key.startsWith('would_have')) {
      write(`${C.dim}│      ${C.reset}${C.magenta}withheld ${key.replace('would_have_', '')}: ${compact(result[key])}${C.reset}`);
    }
  }
}

/** Plain annotation, for context an outsider needs. */
function note(text) {
  if (!active()) return;
  write(`${C.dim}│    ${text}${C.reset}`);
}

/** Warning line, for the adversarial demos (signal stripping). */
function alarm(text) {
  if (!active()) return;
  write(`${stepPrefix()}${C.red}⚠ ${text}${C.reset}`);
}

/** Footer with takeaway lines. */
function close(lines = []) {
  if (!active()) return;
  for (const l of lines) write(`${C.dim}│${C.reset} ${l}`);
  write(`${C.dim}└─${C.reset}`);
}

module.exports = { active, banner, signal, hop, call, verdict, note, alarm, close };
