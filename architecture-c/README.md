# Architecture C — Consent-Scoped Tool Registry

Demonstrates how a platform update that silently adds new MCP tools can be intercepted and gated on explicit user consent. Addresses GPC categories A1 (no integration-by-update) and A2 (opt-in only).

## Scenario

A user signs up and consents to two capability categories: `file_access` and `external_api`. Six months later, a platform update (v2.0) silently adds:

- **email_sender** (`communication`) — sends emails on the user's behalf
- **behavior_tracker** (`analytics`) — logs session behavior for platform analytics

Without consent controls, both tools are immediately available to the orchestrator. With consent controls, both are quarantined until the user explicitly approves or declines each one.

## How it works

| Layer | File | Role |
|---|---|---|
| Tool registry | `tool_registry.js` | Catalog of all tools with capability category and version added |
| Consent manifest | `consent_manifest.js` + `consent_manifest.json` | Durable record of approved/declined categories per user |
| MCP interceptor | `mcp_server.js` | Wraps every tool call with `withConsentCheck()` — pauses on quarantine |
| Consent prompt | `consent_prompt.js` | Presents approve/decline UI; resolves the paused call |
| Orchestrator | `orchestrator.js` | Scripted tool call sequence (no LLM required) |

**Quarantine vs. hard block:**
- *Quarantine* — tool needs fresh consent; the call is paused (Promise awaited) until the user decides. If approved, the call resumes in the same session.
- *Hard block* — the user previously declined this category; the call is rejected immediately with no prompt.

## Setup

No dependencies. Requires Node.js 18+.

```bash
cd architecture-c
```

## Running

### v1.0 — baseline (all consented tools, no new tools)

```bash
node run_v1.js
```

All four v1.0 tools execute normally. No quarantine events.

### v2.0 — three modes

**Silent** (no consent enforcement — simulates a platform without gates):
```bash
node run_v2.js --mode=silent
```
All six tools execute immediately, including `email_sender` and `behavior_tracker`. This is the failure mode.

**Approve** (user approves both new tools):
```bash
node run_v2.js --mode=approve
```
`email_sender` and `behavior_tracker` are quarantined, consent prompts fire, user approves both. Each resumes and executes. Manifest is updated on disk.

**Decline** (user declines both new tools):
```bash
node run_v2.js --mode=decline
```
Both tools are quarantined, user declines both. They are blocked for the rest of the session and in all future sessions (written to `declined_categories` in the manifest). A simulated v3.0 persistence check prints at the end showing the declined tools remain blocked.

**Interactive** (real CLI prompt):
```bash
node run_v2.js
```
Consent prompts appear in the terminal; answer `y` or `n` for each tool.

### Full demo (all modes in sequence)

```bash
npm run demo
```

## Output

Each run prints a JSON object to stdout:

```json
{
  "platform_version": "v2.0",
  "mode": "approve",
  "tool_invocations": [...],
  "quarantine_events": [...],
  "capability_timeline": [
    { "tool": "file_read",       "callable_at": "immediately",   "final_status": "executed" },
    { "tool": "web_search",      "callable_at": "immediately",   "final_status": "executed" },
    { "tool": "email_sender",    "callable_at": "after_consent", "final_status": "executed" },
    { "tool": "behavior_tracker","callable_at": "after_consent", "final_status": "executed" }
  ],
  "manifest_final": { ... }
}
```

The `capability_timeline` is the key paper artifact: `immediately` in silent mode vs `after_consent` or `never` in approve/decline mode shows the A1 delta directly.

## Consent manifest

`consent_manifest.json` is a real file written to disk on every approve/decline. Each run resets it to v1.0 state before starting. To inspect persistent state, run `--mode=decline` and then read `consent_manifest.json` directly.

```json
{
  "manifest_version": "v1.0",
  "approved_categories": ["file_access", "external_api"],
  "declined_categories": [],
  "consented_at": { ... }
}
```
