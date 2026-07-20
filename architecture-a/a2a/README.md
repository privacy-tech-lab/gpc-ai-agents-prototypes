# Architecture A: GPC Enforcement Over A2A

## What it demonstrates

A user with GPC enabled asks an AI assistant: *"Help me plan a 5-day trip to Japan: what should I see, eat, and know before I go?"*

The assistant searches the web, synthesises an itinerary, and (in a non-GPC world) saves the results to the user's profile. This is the same scenario as [`../mcp/`](../mcp/README.md), implemented over the Agent2Agent (A2A) protocol instead: requests to the storage capability travel as A2A `Message` objects rather than MCP tool calls.

| Layer | Mechanism | Enforcement point |
|---|---|---|
| **1. Transport** | `Sec-GPC: 1` HTTP header | The orchestrator reads the header once and propagates the signal to every downstream call |
| **2. Data layer** | `withPrivacyPolicy()` policy interceptor | Wraps all operation handlers behind the A2A client. A sensitive-operation registry (`privacy_policy.js`) defines which operations touch personal data: `user_profile_lookup`, `save_to_profile`, and `log_interaction`. If `gpc` is set in `Message.metadata` and the operation is in the registry, the interceptor returns `status: blocked` without executing. `search_web` is not in the registry and always executes. |

The GPC signal travels between layers via `Message.metadata`, an open key-value bag every A2A `Message` carries, attached to each message the orchestrator sends.

**Result:** the user gets an equally good itinerary whether GPC is on or off. With GPC on, nothing is stored: no profile update, no interaction log entry.

---

## Proposal: a dedicated opt-out field

`metadata` is a generic bag, not a privacy field. A2A's `Message` type has no field meant for a signal like GPC: `metadata` (`{[k: string]: unknown}`) is open-ended, attached to any message for any purpose, with no spec guarantee about what it holds. A2A does have a more structured extension mechanism than plain metadata, a `Message.extensions: string[]` array of URIs declaring which extensions are in play, backed by declarations in the agent's `AgentCard` — but `extensions` only says *that* an extension is present, it does not carry the extension's payload. The payload still has to live somewhere, and today that somewhere is `metadata`, the same unnamespaced bag as MCP's `_meta`.

`proposal-dedicated-field/` shows what enforcement looks like if A2A carried the signal in a dedicated, top-level field instead, a sibling of `role`, `parts`, `metadata`, and `extensions`:

```json
{
  "kind": "message",
  "messageId": "...",
  "role": "user",
  "parts": [{ "kind": "data", "data": { "operation": "save_to_profile", "user_id": "user-42" } }],
  "privacySignals": { "gpc": true },
  "metadata": {}
}
```

It is a parallel implementation of just the enforcement-relevant slice of the pipeline (storage is the only place GPC blocking happens; `search_web` is not sensitive, so the retrieval agents are reused unchanged):

- `privacy_policy.js` — same interceptor pattern as `agent-server/privacy_policy.js`, but reads `privacySignals.gpc` instead of `metadata.gpc`. Imports the sensitive-operation registry rather than duplicating it.
- `a2a_client.js` — same in-process client pattern as `orchestrator/a2a_client.js`, wired to the new interceptor.
- `storage.js` — same fixed-order, double-guarded storage flow as `services/storage.js`, gated on `privacySignals.gpc` instead of `metadata.gpc`.
- `orchestrator.js` — same pipeline as `orchestrator/orchestrator.js`, building a `privacySignals` object for Layer 2 instead of a `metadata` envelope.

Run it:

```bash
npm run gpc:dedicated-field
```

**Why this cannot ship as-is — and why the evidence looks different from the MCP version.** `mcp/`'s proposal is backed by a validation-stripping test: MCP's real SDK schema silently drops an unrecognised top-level field. A2A's story is different. `@a2a-js/sdk` ships no zod/ajv and does no runtime schema validation at all, so a `privacySignals` field placed on a `Message` object simply rides along today, nothing removes it. The gap here is a **documented-contract gap**, not a validation-stripping one: the SDK's own shipped `Message` type declares exactly nine fields (`contextId`, `extensions`, `kind`, `messageId`, `metadata`, `parts`, `referenceTaskIds`, `role`, `taskId`), and `privacySignals` is not one of them. No compliant client, codegen tool, or future stricter implementation has any reason to read a field the type contract never declared — so it is invisible and non-interoperable in practice, even though nothing strips it on the wire today.

`tests/schema_gap.test.js` proves this directly: it reads the `Message` interface out of the real, installed `@a2a-js/sdk`'s own shipped type declarations and asserts `privacySignals` isn't among its fields while `metadata` is. Two different protocols, two different flavors of the same underlying hack: a privacy opt-out signal common and consequential enough across agent-to-agent calls to deserve a first-class field of its own, not a key buried in a bag meant for anything.

---

## Pipeline

```
HTTP Request (Sec-GPC: 1)
  → orchestrator.js         (reads Sec-GPC, builds metadata envelope)
      → search_agent.js     (LLM loop — decides how many searches to run)
      → synthesis_agent.js  (LLM — reasons over raw results, calls no tools)
      → storage.js          (plain code — enforces GPC before writing)
  → HTTP Response
```

### Agent roles

**Search agent** (`agents/search_agent.js`): An LLM loop with one tool (`search_web`). The model decides how many searches to make and when it has enough raw material. `search_web` is called directly against the shared handler with no A2A message wrapping — it was never privacy-gated in either protocol, so there is nothing here for a protocol client to demonstrate. Retrieval is never blocked, only storage is.

**Synthesis agent** (`agents/synthesis_agent.js`): Receives raw search results from the search agent and synthesises them into a structured itinerary. It calls no tools, so there is nothing for GPC to block here.

### Supporting services

**Storage** (`services/storage.js`): Calls three storage operations in fixed order, each as its own A2A `Message`. Sensitive writes are double-guarded: explicit code check plus `withPrivacyPolicy()` interceptor at the agent-server layer.

## File map

```
architecture-a/a2a/
├── orchestrator/
│   ├── orchestrator.js     Entry point: reads Sec-GPC, builds metadata, dispatches agents
│   ├── agent_loop.js       Shared LLM turn loop (tool_choice, nudge, required-tool tracking)
│   └── a2a_client.js       In-process A2A client; applies withPrivacyPolicy() at each call
│
├── agents/
│   ├── search_agent.js     LLM search agent (tool: search_web)
│   └── synthesis_agent.js  LLM synthesis agent (no tools)
│
├── services/
│   └── storage.js          Storage: profile, log — GPC-gated via code + agent-server layer
│
├── agent-server/
│   ├── server.js           Illustrative real @a2a-js/sdk agent server (not exercised by tests/demo)
│   ├── privacy_policy.js   withPrivacyPolicy() interceptor + sensitive-operation registry
│   └── tool_handlers.js    Raw operation implementations (search, profile, log)
│
├── proposal-dedicated-field/   Proposal: signal via a dedicated field, not metadata
│   ├── orchestrator.js         Builds privacySignals instead of metadata
│   ├── a2a_client.js           In-process A2A client; applies withPrivacySignal()
│   ├── storage.js              Storage gated on privacySignals.gpc
│   └── privacy_policy.js       withPrivacySignal() interceptor
│
├── harness/
│   ├── run_baseline.js     Demo run: GPC off, all operations execute
│   ├── run_gpc.js          Demo run: GPC on, sensitive operations blocked (metadata)
│   ├── run_gpc_dedicated_field.js  Demo run: GPC on, via privacySignals field
│   ├── compare_results.js  Diff baseline vs GPC run, print report
│   └── seed_demo.js        Seed user-42 profile and interaction log
│
├── tests/
│   ├── privacy_policy.test.js  withPrivacyPolicy() blocking, passthrough, signal formats
│   ├── privacy_signal_policy.test.js  withPrivacySignal() blocking, passthrough
│   ├── schema_gap.test.js  Proves the real @a2a-js/sdk Message type has no privacySignals field
│
└── output/                 Gitignored; created at runtime
    ├── profiles.json
    ├── interaction_log.jsonl
    ├── baseline_result.json
    └── gpc_result.json
```

---

## Setup

```bash
cd architecture-a/a2a
npm install
```

---

## How to test

### Unit tests (no model required)

```bash
npm test
```

28 tests across three files.

| Test file | What it covers |
|---|---|
| `privacy_policy.test.js` | `withPrivacyPolicy()` blocking, passthrough, all GPC signal formats (`1`, `true`, `"1"`) |
| `privacy_signal_policy.test.js` | `withPrivacySignal()` blocking, passthrough, for the dedicated-field proposal |
| `schema_gap.test.js` | Proves the real `@a2a-js/sdk` `Message` type has no `privacySignals` field, but has `metadata` |

### Demo (requires Ollama)

Seeds user-42, runs baseline and GPC runs, prints comparison report:

```bash
# 1. Start Ollama (skip if desktop app is already running)
ollama serve

# 2. Pull the model once
ollama pull qwen2.5:14b

# 3. Seed demo data and run both modes
npm run demo
```

Individual runs:

```bash
npm run seed              # Seed user-42 travel history
npm run baseline          # GPC off: all operations execute, data written to output/
npm run gpc               # GPC on: sensitive operations blocked (metadata)
npm run gpc:dedicated-field  # GPC on: sensitive operations blocked (privacySignals)
npm run compare            # Print comparison report from existing output files
```

Override the model:

```bash
OLLAMA_MODEL=llama3.1:70b npm run demo
```

Use real web search (Tavily free tier, 1000 calls/month):

```bash
TAVILY_API_KEY=tvly-... npm run demo
```

### Expected comparison report

```
Tool                     │ Baseline     │ GPC
─────────────────────────────────────────────
search_web               │ ✓ ok         │ ✓ ok
profile_lookup           │ ✓ ok         │ ✗ BLOCKED
save_to_profile          │ ✓ ok         │ ✗ BLOCKED
log_interaction          │ ✓ ok         │ ✗ BLOCKED
```

---

## What the output files show

After running the demo, `output/` contains:

| File | Baseline | GPC run |
|---|---|---|
| `profiles.json` | user-42 record updated | unchanged (write blocked) |
| `interaction_log.jsonl` | new line appended | unchanged (write blocked) |
| `baseline_result.json` | all operations `status: ok` | n/a |
| `gpc_result.json` | n/a | storage operations `status: blocked` |
