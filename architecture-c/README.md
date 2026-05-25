# Architecture C: Consent-Scoped Tool Registry

## What it demonstrates

A user signs up for an AI productivity platform and consents to two capability categories: `file_access` (reading and writing documents) and `external_api` (web search, weather). Six months later, a platform update silently adds two new tools to the MCP server: an `email_sender` (communication category) and a `behavior_tracker` (analytics category). Without consent controls, both are immediately available to the orchestrator. The user's original consent is silently stretched to cover capabilities they never agreed to.

Architecture C introduces a **consent-scoped tool registry** that intercepts every tool invocation and checks it against a versioned consent manifest before allowing it to run. New tools discovered after the manifest version are quarantined until the user explicitly approves or declines them. When the user has set the GPC signal, non-essential capability categories are auto-declined without requiring a per-tool prompt — the signal itself makes the decision.

**Result:** in the silent (failure) mode, all six tools including `email_sender` and `behavior_tracker` execute immediately after the update. In the consent-gated modes, both new tools are held until the user decides. When GPC is on, the signal replaces the user prompt entirely and auto-declines non-primary categories, writing the decision durably to the manifest.

---

## GPC categories depicted

Architecture C is a concrete implementation of two categories from the AI integration consent taxonomy: **A1 (no integration-by-update)** and **A2 (opt-in only)**.

### Category A1: No integration-by-update

The core A1 problem is that platform updates expand orchestrator capabilities without the user's knowledge. A user who consented to file access and web search at signup never agreed to have their email account or session behaviour handed to an analytics pipeline — but a silent tool catalog update makes that happen automatically on any platform without registry enforcement.

**How it is demonstrated:** Architecture C simulates a two-version platform sequence. `run_v1.js` initialises with a v1.0 catalog and a v1.0 consent manifest — only `file_access` and `external_api` tools are present and both categories are pre-approved. `run_v2.js --mode=silent` loads the v2.0 catalog, which adds `email_sender` and `behavior_tracker`, and bypasses the registry entirely. Both new tools execute immediately. `run_v2.js --mode=approve` loads the same v2.0 catalog with the registry active — both new tools are quarantined on first invocation and only become callable after the consent prompt resolves. The `capability_timeline` in the JSON output makes the delta visible: `immediately` for silent mode versus `after_consent` for approve mode.

**What it does not cover:** A1 addresses who authorises capability additions. It does not address how the GPC signal propagates through an existing pipeline once those capabilities are approved — that is Architecture A's domain.

### Category A2: Opt-in only

A2 requires that declining a capability category is a durable decision that persists across platform updates and sessions. A user who says no to analytics tracking should not have to say no again when the platform ships v3.0.

**How it is demonstrated:** `run_v2.js --mode=decline` fires a consent prompt for each new tool and auto-declines both. The `declined_categories` entries are written to `consent_manifest.json` on disk. A simulated v3.0 persistence check runs at the end of the decline mode, showing that both categories remain blocked with no re-prompt — the v3.0 hard-block check hits `declined_categories` before `requiresFreshConsent` is even evaluated. When GPC is active (`--gpc`), the same persistence applies: the signal auto-declines non-primary categories and writes them to `declined_categories`, so the decision carries forward exactly as a user-explicit decline would.

**What it does not cover:** A2 addresses the durability of opt-out decisions. It does not address what happens if the user changes their GPC preference mid-session while a long-running task is in flight — that is the signal expiry problem, which none of the three architectures currently models.

### GPC signal integration

Without the `--gpc` flag, Architecture C demonstrates consent-gating in isolation: the user is prompted for each new tool and makes a per-tool decision. This shows the quarantine mechanism working but does not connect it to the global GPC opt-out signal.

With `--gpc`, the consent manifest check is augmented by a signal check. When a tool's category is outside the set of primary categories (`file_access`, `external_api`) and the tool requires fresh consent, the GPC signal bypasses the user prompt entirely and issues an auto-decline. The category is written to `declined_categories` and the tool returns `status: blocked, reason: gpc_auto_decline`. No `consent_request` event is emitted. The user's global preference is translated directly into a specific capability decision without requiring them to respond to individual prompts.

```
Tool requires fresh consent
        |
        v
  Is GPC on?
  |          |
 yes         no
  |          |
  v          v
Is category  Fire consent_request event
primary?     Wait for user response
  |    |
 yes   no
  |    |
  v    v
Run  Auto-decline
     (no prompt)
     Write to declined_categories
```

---

## Pipeline diagram

### v1.0 — baseline

```
run_v1.js
  |
  |--> manifest.reset()         restore to v1.0 seed state
  |
  `--> orchestrator.run('v1.0')
         |
         |--> invokeTool('file_read')
         |      withConsentCheck() -> file_access in approved_categories -> executed
         |
         `--> invokeTool('web_search')
                withConsentCheck() -> external_api in approved_categories -> executed

Output: all tools status=executed, quarantine_events=[]
```

### v2.0 — silent (failure case)

```
run_v2.js --mode=silent
  |
  `--> orchestrator.run('v2.0', 'silent')
         |
         |--> invokeTool('file_read',        mode='silent') -> executed (no check)
         |--> invokeTool('web_search',       mode='silent') -> executed (no check)
         |--> invokeTool('email_sender',     mode='silent') -> executed (no check)
         `--> invokeTool('behavior_tracker', mode='silent') -> executed (no check)

Output: all tools status=executed, capability_timeline all 'immediately'
Manifest: unchanged at v1.0
```

### v2.0 — approve (consent-gated)

```
run_v2.js --mode=approve
  |
  |--> consent_prompt.register('approve')
  |
  `--> orchestrator.run('v2.0', 'approve')
         |
         |--> invokeTool('file_read')   -> file_access approved    -> executed
         |--> invokeTool('web_search')  -> external_api approved   -> executed
         |
         |--> invokeTool('email_sender')
         |      withConsentCheck() -> requiresFreshConsent=true
         |      emit consent_request -> [PAUSED]
         |      consent_prompt resolves -> approved
         |      manifest.approve('communication')
         |      -> executed, consent_required=true
         |
         `--> invokeTool('behavior_tracker')
                withConsentCheck() -> requiresFreshConsent=true
                emit consent_request -> [PAUSED]
                consent_prompt resolves -> approved
                manifest.approve('analytics')
                -> executed, consent_required=true

Output: new tools callable_at='after_consent'
Manifest: communication + analytics added to approved_categories
```

### v2.0 — GPC signal active

```
run_v2.js --mode=approve --gpc
  |
  |--> [GPC on] non-primary categories will be auto-declined without prompting
  |
  `--> orchestrator.run('v2.0', 'approve', gpc=true)
         |
         |--> invokeTool('file_read',   gpc=true) -> primary category -> executed
         |--> invokeTool('web_search',  gpc=true) -> primary category -> executed
         |
         |--> invokeTool('email_sender', gpc=true)
         |      withConsentCheck() -> requiresFreshConsent=true
         |      gpc=true, 'communication' not in PRIMARY_CATEGORIES
         |      manifest.decline('communication')    [no prompt emitted]
         |      -> blocked, reason=gpc_auto_decline
         |
         `--> invokeTool('behavior_tracker', gpc=true)
                withConsentCheck() -> requiresFreshConsent=true
                gpc=true, 'analytics' not in PRIMARY_CATEGORIES
                manifest.decline('analytics')        [no prompt emitted]
                -> blocked, reason=gpc_auto_decline

Output: new tools callable_at='gpc_blocked'
Manifest: communication + analytics written to declined_categories
```

---

## Capability timeline

The `capability_timeline` field in the JSON output is the key paper artifact for the A1 argument. It shows when each tool first became callable across all four run modes:

| Tool | silent | approve | decline | --gpc |
|---|---|---|---|---|
| `file_read` | immediately | immediately | immediately | immediately |
| `web_search` | immediately | immediately | immediately | immediately |
| `email_sender` | **immediately** | after_consent | never | **gpc_blocked** |
| `behavior_tracker` | **immediately** | after_consent | never | **gpc_blocked** |

The gap between `immediately` (silent) and `after_consent` / `gpc_blocked` / `never` is the empirical A1 finding: without registry enforcement, capability expansion is invisible and instant.

---

## File map

```
architecture-c/
|
|-- tool_registry.js       Tool catalog — name, capability_category, added_at, description
|-- consent_manifest.js    Read/write consent_manifest.json; isDeclined, requiresFreshConsent,
|                          approve, decline, reset
|-- consent_manifest.json  Durable per-user consent record (seeded at v1.0)
|-- mcp_server.js          withConsentCheck() interceptor; PRIMARY_CATEGORIES constant;
|                          GPC auto-decline logic; Promise-based quarantine/resume
|-- event_bus.js           Node.js EventEmitter singleton — carries consent_request events
|-- consent_prompt.js      Consent UI: approve/decline/interactive modes; buildPromptText()
|-- tool_handlers.js       Simulated tool implementations (file_read, web_search, email_sender,
|                          behavior_tracker, file_write, weather_lookup)
|-- orchestrator.js        Scripted tool call sequence filtered by platform version
|-- run_v1.js              v1.0 platform baseline — all consented tools, no quarantine
|-- run_v2.js              v2.0 platform — --mode=silent|approve|decline [--gpc]
|-- package.json
|
`-- tests/
    |-- tool_registry.test.js      Catalog contents, getCatalog() version filtering, isNewerThan()
    |-- consent_manifest.test.js   reset(), isApproved/Declined, requiresFreshConsent,
    |                              approve/decline idempotency, disk persistence
    |-- mcp_server.test.js         withConsentCheck() — silent, approved, hard block,
    |                              quarantine/resume, GPC auto-decline, unknown tool
    `-- orchestrator.test.js       Full pipeline — v1.0, silent, approve, decline, GPC,
                                   A2 cross-session persistence
```

---

## Setup

No external dependencies. Requires Node.js 18+.

```bash
cd architecture-c
npm install
```

---

## How to test

### Unit and integration tests

```bash
npm test
```

93 tests across four files. Tests run sequentially (`--runInBand`) because all four files share the same `consent_manifest.json` on disk.

| Test file | What it covers |
|---|---|
| `tool_registry.test.js` | Catalog contents, version filtering, `isNewerThan()` in all directions |
| `consent_manifest.test.js` | `reset()`, `isApproved`/`isDeclined`, all three `requiresFreshConsent` conditions, `approve`/`decline` idempotency, disk persistence |
| `mcp_server.test.js` | Silent bypass, approved passthrough, hard block, quarantine pause-and-resume, GPC auto-decline, primary category protection |
| `orchestrator.test.js` | Full pipeline for all modes including GPC; A2 cross-session persistence |

### Demo runs

```bash
npm run demo
```

Runs all four modes in sequence: v1.0 baseline → silent → approve → decline → GPC.

Individual runs:

```bash
npm run v1             # v1.0 baseline — only consented tools, no quarantine
npm run v2:silent      # v2.0, no enforcement — all tools execute immediately
npm run v2:approve     # v2.0, consent-gated — new tools prompt then execute
npm run v2:decline     # v2.0, consent-gated — new tools prompt then block
npm run v2:gpc         # v2.0, GPC on — non-primary categories auto-declined
```

---

## What the output shows

Each run prints a JSON object to stdout. The fields relevant to the paper:

| Field | What it records |
|---|---|
| `capability_timeline` | When each tool first became callable: `immediately`, `after_consent`, `never`, or `gpc_blocked` |
| `quarantine_events` | Tools that were held — includes the category, tool name, and reason |
| `tool_invocations` | Full result of every tool call including `consent_required` and `prompt_text` where applicable |
| `manifest_final` | State of the consent manifest after the run — shows `approved_categories`, `declined_categories`, and `consented_at` timestamps |

After a decline or GPC run, `consent_manifest.json` on disk reflects the durable decision. The simulated v3.0 persistence check that prints at the end of those runs reads directly from that file and shows the declined categories are still blocked — no new prompt would fire.

### Expected comparison across modes

```
Tool              | silent      | approve       | decline | --gpc
------------------|-------------|---------------|---------|------------
file_read         | immediately | immediately   | immediately | immediately
web_search        | immediately | immediately   | immediately | immediately
email_sender      | immediately | after_consent | never   | gpc_blocked
behavior_tracker  | immediately | after_consent | never   | gpc_blocked
```
