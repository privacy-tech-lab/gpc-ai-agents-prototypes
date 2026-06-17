# Architecture C: Consent-Scoped Tool Registry

## What it demonstrates

A user signs up for an AI productivity assistant and consents to two capability categories: `file_access` (reading documents) and `external_api` (web search). Six months later, a platform update adds two tools to the MCP server: `email_sender` (a `communication` capability) and `behavior_tracker` (an `analytics` capability). Nobody asks the user. On a platform with no registry enforcement, both tools are callable the moment the update ships — the consent given at signup is treated as if it covered them.

Architecture C puts a consent check in front of every tool call. Each call is matched against a versioned consent manifest before it runs. A tool whose category was added after the manifest version is held until the user approves or declines it, and that decision is written to disk so it survives the next update. When the user has the GPC signal set, any non-primary category is declined automatically — the signal stands in for the per-tool prompt.

The gate can be driven two ways. The **deterministic core** (`orchestrator.js`) walks a fixed tool sequence with no model — the run is reproducible and the tests need no Ollama. The optional **LLM agent** (`agent.js`, requires Ollama) gives a real model the user-facing tools (`file_read`, `web_search`, `email_sender`) and lets it decide which to call; every call still routes through `withConsentCheck()`, so a blocked or quarantined tool simply comes back to the model as that tool's result. Either way, what is under test is the consent gate, not how the tools are chosen.

`behavior_tracker` is **not** an agent tool. It is ambient analytics a platform fires around a session — a user-task agent would never choose to call its own surveillance — so in the agent path it is invoked as a platform call and gated by the same check. That is the A2 (activation) case made literal.

| Mechanism | Where | What it does |
|---|---|---|
| **Tool registry** | `tool_registry.js` | Catalog of every tool with its `capability_category` and the platform version it was `added_at`. `getCatalog(version)` returns only the tools that existed at or before a version. |
| **Consent manifest** | `consent_manifest.js` + `consent_manifest.json` | Per-user record on disk: `manifest_version`, `approved_categories`, `declined_categories`. A tool added after `manifest_version` whose category is undecided requires fresh consent. |
| **Consent interceptor** | `mcp_server.js` → `withConsentCheck()` | Every call passes through it. Decides execute / quarantine / block before the handler runs. |
| **GPC auto-decline** | `mcp_server.js` | When GPC is on and a tool's category is outside `PRIMARY_CATEGORIES` (`file_access`, `external_api`), the category is declined with no prompt. |

**Result:** in silent mode (no enforcement), `email_sender` and `behavior_tracker` run as soon as the update lands. In the consent-gated modes, both are held until the user decides, and a decline persists into a simulated v3.0 with no second prompt. With GPC on, the signal declines both non-primary categories and writes them to the manifest, exactly as an explicit decline would.

---

## GPC categories depicted

Architecture C implements **Category A (Presence)** from the opt-out typology — opting out of AI capabilities being present at all, before any question of data use arises.

### A1 — Integration opt-out

The typology's A1 is that AI features may not be added by an update without explicit affirmative consent; a disclosed feature must start off until the user opts in. That is the core of this architecture.

`run_v1.js` starts with the v1.0 catalog and a v1.0 manifest: only `file_access` and `external_api` exist, both pre-approved. `run_v2.js --mode=silent` loads the v2.0 catalog (which adds `email_sender` and `behavior_tracker`) and skips the registry — both new tools run immediately. `run_v2.js --mode=approve` loads the same catalog with the registry active — both new tools are held on first call and run only after consent resolves. The `capability_timeline` field makes the difference legible: `immediately` for silent, `after_consent` for approve.

A1 governs who authorises new capabilities. It does not govern how a signal moves through a pipeline once a capability is approved — that is Architecture A's concern.

### A2 — Activation opt-out

The typology's A2 is opting out of AI that operates passively — in the background, embedded, or as an ambient assistant — unless the user affirmatively chose it. Architecture C touches A2 through `behavior_tracker`: an analytics capability that records session behaviour on its own, with no user-facing task. Holding it until explicit consent, or declining it under GPC, is an A2 control over ambient operation.

One property is worth separating out. A declined category stays declined across platform versions (the simulated v3.0 check at the end of `decline` and `--gpc` runs). That durability is a property of the enforcement, not a typology category of its own. The typology's persistence axis (Category D) is about how long *data* survives, not how long a *consent decision* lasts.

### GPC signal integration

Without `--gpc`, the user is prompted for each new tool — the quarantine mechanism in isolation, not yet wired to a global signal. With `--gpc`, the interceptor adds a signal check: when a tool's category is outside `PRIMARY_CATEGORIES` and the tool needs fresh consent, the signal declines the category with no prompt and no `consent_request` event. The global preference becomes a specific capability decision.

```
Tool needs fresh consent
        |
        v
     GPC on?
     |     |
    yes    no
     |     |
     v     v
  category   fire consent_request,
  primary?   wait for user
   |    |
  yes   no
   |    |
   v    v
  run  auto-decline (no prompt),
       write to declined_categories
```

---

## Pipeline

```
run_v2.js --mode=approve [--gpc]
  → orchestrator.js          plain code: fixed tool sequence, filtered by platform version
      → mcp_server.js        withConsentCheck() — the enforcement point
          → event_bus.js     emits consent_request when a tool needs a decision
          → consent_prompt.js  approve / decline / interactive responder, resolves the request
      → tool_handlers.js     simulated tool implementations
```

`orchestrator.js` walks a fixed four-tool sequence (`file_read`, `web_search`, `email_sender`, `behavior_tracker`), filtered to the tools that exist at the platform version. Each call goes through `withConsentCheck()`, which decides in this order:

1. Unknown tool → throw.
2. Silent mode → run with no check.
3. Category already declined → block (`previously_declined`).
4. GPC on and category not primary and consent needed → decline with no prompt (`gpc_auto_decline`).
5. Consent needed → emit `consent_request`, pause, and wait for the prompt to resolve. Approve → run; decline → quarantine (`user_declined`).
6. Already approved → run.

`event_bus.js` is a single Node `EventEmitter`. `mcp_server.js` emits `consent_request`; `consent_prompt.js` listens and resolves. Neither imports the other, so the responder (auto-approve, auto-decline, or interactive stdin) can be swapped without touching the interceptor.

### Why the manifest version is bumped last

`run_v2.js` raises `manifest_version` to `v2.0` only after every tool in the run has been processed. If it bumped after approving `email_sender`, then `behavior_tracker`'s `requiresFreshConsent()` check would compare `v2.0` against `v2.0`, find nothing new, and skip its prompt. The version must move only once all decisions for the run are recorded.

## File map

```
architecture-c/
├── tool_registry.js       Tool catalog — name, capability_category, added_at, description
├── consent_manifest.js    Read/write consent_manifest.json; isDeclined, requiresFreshConsent,
│                          approve, decline, reset
├── consent_manifest.json  Durable per-user consent record (seeded at v1.0)
├── mcp_server.js          withConsentCheck() interceptor; PRIMARY_CATEGORIES; GPC auto-decline;
│                          Promise-based quarantine and resume
├── event_bus.js           Node EventEmitter — carries consent_request events
├── consent_prompt.js      Consent responder: approve / decline / interactive; buildPromptText()
├── tool_handlers.js       Simulated tools: file_read, web_search, email_sender, behavior_tracker
│
│  Deterministic core (no model — what the tests run):
├── orchestrator.js        Fixed tool sequence, filtered by platform version
├── run_v1.js              v1.0 baseline — consented tools only, no quarantine
├── run_v2.js              v2.0 — --mode=silent|approve|decline|interactive [--gpc]
│
│  LLM agent path (requires Ollama):
├── agent_loop.js          Shared LLM turn loop (copied from Architecture A)
├── agent.js               User-facing tools + makeExecutor (the consent seam);
│                          firePlatformTracker (ambient behavior_tracker); ask(), runSession()
├── run_agent.js           Live demo: a model drives the session, --mode / --gpc set enforcement
├── package.json
│
└── tests/
    ├── tool_registry.test.js      Catalog contents, getCatalog() version filtering, isNewerThan()
    ├── consent_manifest.test.js   reset(), isApproved/Declined, requiresFreshConsent,
    │                              approve/decline idempotency, disk persistence
    ├── mcp_server.test.js         withConsentCheck() — silent, approved, hard block,
    │                              quarantine/resume, GPC auto-decline, unknown tool
    ├── orchestrator.test.js       Full sequence per mode; A2 cross-version persistence
    └── agent.test.js              makeExecutor + firePlatformTracker route through the gate;
                                   tool defs exclude behavior_tracker
```

---

## Setup

No external dependencies. Node.js 18+.

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

99 tests across five files. They run with `--runInBand` because they share the one `consent_manifest.json` on disk. No Ollama needed — the agent's enforcement seam (`makeExecutor`, `firePlatformTracker`) is tested directly.

| Test file | What it covers |
|---|---|
| `tool_registry.test.js` | Catalog contents, version filtering, `isNewerThan()` |
| `consent_manifest.test.js` | `reset()`, `isApproved`/`isDeclined`, all `requiresFreshConsent` conditions, `approve`/`decline` idempotency, disk persistence |
| `mcp_server.test.js` | Silent bypass, approved passthrough, hard block, quarantine pause-and-resume, GPC auto-decline, primary category protection |
| `orchestrator.test.js` | Full sequence for every mode including GPC; A2 cross-version persistence |
| `agent.test.js` | `makeExecutor` routes model calls through the gate (silent / primary / GPC auto-decline); `firePlatformTracker` gating; tool defs exclude `behavior_tracker` |

### Demo runs

```bash
npm run demo
```

Runs all modes in order: v1.0 baseline → silent → approve → decline → GPC.

Individual runs:

```bash
npm run v1          # v1.0 baseline — consented tools only, no quarantine
npm run v2:silent   # v2.0, no enforcement — new tools run immediately
npm run v2:approve  # v2.0, gated — new tools prompt, then run
npm run v2:decline  # v2.0, gated — new tools prompt, then block
npm run v2:gpc      # v2.0, GPC on — non-primary categories auto-declined
```

### Run as a real agent (requires Ollama)

A live model is given `file_read`, `web_search`, and `email_sender` and decides which to call for the request; every call is gated by `withConsentCheck()`, and the platform fires `behavior_tracker` around the session. The mode and `--gpc` flag set the enforcement — the model never controls them.

```bash
ollama serve                 # start Ollama if it isn't running
ollama pull qwen2.5:14b      # once; override with OLLAMA_MODEL

npm run agent                # mode=approve — new tools prompt, then run
npm run agent:decline        # mode=decline — new tools prompt, then block
npm run agent:gpc            # mode=approve --gpc — non-primary categories auto-declined
```

---

## What the output shows

Each run prints a JSON object to stdout.

| Field | What it records |
|---|---|
| `capability_timeline` | When each tool first became callable: `immediately`, `after_consent`, `never`, or `gpc_blocked` |
| `quarantine_events` | Tools that were held — category, tool name, reason |
| `tool_invocations` | Every tool call, including `consent_required` and `prompt_text` where they apply |
| `manifest_final` | The manifest after the run — `approved_categories`, `declined_categories`, `consented_at` |

After a `decline` or `--gpc` run, `consent_manifest.json` on disk holds the decision. The simulated v3.0 check printed at the end of those runs reads that file and shows the declined categories are still blocked — no new prompt would fire.

### Capability timeline across modes

```
Tool              | silent      | approve       | decline | --gpc
------------------|-------------|---------------|---------|------------
file_read         | immediately | immediately   | immediately | immediately
web_search        | immediately | immediately   | immediately | immediately
email_sender      | immediately | after_consent | never   | gpc_blocked
behavior_tracker  | immediately | after_consent | never   | gpc_blocked
```

The gap between `immediately` under silent mode and `after_consent` / `gpc_blocked` / `never` under the gated modes is the A1 finding: with no registry, a capability becomes callable the instant it is added, and the user never sees it happen.
