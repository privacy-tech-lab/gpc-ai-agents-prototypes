# Architecture A: GPC Enforcement in a Multi-Agent Pipeline

## What it demonstrates

A user with GPC enabled asks an AI assistant: *"Help me plan a 5-day trip to Japan: what should I see, eat, and know before I go?"*

The assistant searches the web, synthesises an itinerary, and (in a non-GPC world) saves the results to the user's profile. This request exercises two enforcement layers:

| Layer | Mechanism | Enforcement point |
|---|---|---|
| **1. Transport** | `Sec-GPC: 1` HTTP header | The orchestrator reads the header once and propagates the signal to every downstream call |
| **2. Data layer** | `withGpc()` policy interceptor | Wraps all tool handlers in the MCP client. A sensitive-tool registry (`gpc_policy.js`) defines which tools touch personal data: `user_profile_lookup`, `save_to_profile`, and `log_interaction`. If `gpc=1` is present in `_meta` and the tool is in the registry, the interceptor returns `status: blocked` without executing. `search_web` is not in the registry and always executes. |

The GPC signal travels between layers via the MCP `_meta` envelope, which is attached to every tool call.

**Result:** the user gets an equally good itinerary whether GPC is on or off. With GPC on, nothing is stored: no profile update, no interaction log entry.

---

## Proposal: a dedicated opt-out field

`_meta` is a generic bag, not a privacy field. MCP's `tools/call` request has no field meant for a signal like GPC: `_meta` is open-ended metadata attached to any call, for any purpose, with no spec guarantee about what it holds. The key `gpc: 1` used above is unnamespaced and easy to collide with some other extension using the same envelope. It also does not show up anywhere in a tool's schema or definition, so nothing about the protocol tells an implementer this signal exists or that it should be checked before a sensitive tool runs.

`proposal-dedicated-field/` shows what enforcement looks like if MCP carried the signal in a dedicated, top-level field instead, a sibling of `name`, `arguments`, and `_meta`:

```json
{
  "name": "save_to_profile",
  "arguments": { "user_id": "user-42", "data": { "...": "..." } },
  "privacySignals": { "gpc": true },
  "_meta": {}
}
```

It is a parallel implementation of just the enforcement-relevant slice of the pipeline (storage is the only place GPC blocking happens; `search_web` is not sensitive, so the retrieval agents are reused unchanged):

- `privacy_signal_policy.js` — same interceptor pattern as `mcp-server/gpc_policy.js`, but reads `privacySignals.gpc` instead of `_meta.gpc`. Imports the sensitive-tool registry from `gpc_policy.js` rather than duplicating it.
- `mcp_client.js` — same in-process client pattern as `orchestrator/mcp_client.js`, wired to the new interceptor.
- `storage.js` — same fixed-order, double-guarded storage flow as `services/storage.js`, gated on `privacySignals.gpc` instead of `_meta.gpc`.
- `orchestrator.js` — same pipeline as `orchestrator/orchestrator.js`, building a `privacySignals` object for Layer 2 instead of a `_meta` envelope.

Run it:

```bash
npm run gpc:dedicated-field
```

**Why this cannot ship as-is.** The pipeline above only works because our in-process demo client skips real MCP wire validation. Put the same payload through the actual `@modelcontextprotocol/sdk` request schema and `privacySignals` disappears silently, while `_meta` survives:

```js
const { CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

CallToolRequestSchema.parse({
  method: 'tools/call',
  params: {
    name: 'save_to_profile',
    arguments: { user_id: 'user-42' },
    privacySignals: { gpc: true },
    _meta: {},
  },
});
// → parsed.params.privacySignals is undefined
// → parsed.params._meta survives
```

`tests/schema_gap.test.js` runs this against the real installed SDK. MCP's `tools/call` params schema (`BaseRequestParamsSchema` → `CallToolRequestParamsSchema`) declares exactly three fields: `name`, `arguments`, `_meta`. Anything else placed alongside them is silently dropped, not rejected, not preserved. `_meta` is the only extension point the spec actually recognizes today. That is the gap this proposal argues MCP should close: a privacy opt-out signal is common and consequential enough across tool calls to deserve a first-class field of its own, the same way HTTP got `Sec-GPC` rather than everyone agreeing on a `X-Custom-Headers` convention.

---

## Pipeline

```
HTTP Request (Sec-GPC: 1)
  → orchestrator.js         (reads Sec-GPC, builds _meta envelope)
      → search_agent.js     (LLM loop — decides how many searches to run)
      → synthesis_agent.js  (LLM — reasons over raw results, calls no tools)
      → storage.js          (plain code — enforces GPC before writing)
  → HTTP Response
```

### Agent roles

**Search agent** (`agents/search_agent.js`): An LLM loop with one tool (`search_web`). The model decides how many searches to make and when it has enough raw material. The GPC `_meta` envelope is forwarded on every call, but `search_web` is not sensitive so the `withGpc()` interceptor always passes it through. Retrieval is never blocked, only storage is.

**Synthesis agent** (`agents/synthesis_agent.js`): Receives raw search results from the search agent and synthesises them into a structured itinerary. It calls no tools, so there is nothing for GPC to block here.

### Supporting services

**Storage** (`services/storage.js`): Calls three storage operations in fixed order. MCP-sensitive writes are double-guarded: explicit code check plus `withGpc()` interceptor at the MCP layer.

## File map

```
architecture-a/
├── orchestrator/
│   ├── orchestrator.js     Entry point: reads Sec-GPC, builds _meta, dispatches agents
│   ├── agent_loop.js       Shared LLM turn loop (tool_choice, nudge, required-tool tracking)
│   └── mcp_client.js       In-process MCP client; applies withGpc() at each call
│
├── agents/
│   ├── search_agent.js     LLM search agent (tool: search_web)
│   └── synthesis_agent.js  LLM synthesis agent (no tools)
│
├── services/
│   └── storage.js          Storage: profile, log — GPC-gated via code + MCP
│
├── mcp-server/
│   ├── server.js           MCP server entry point
│   ├── gpc_policy.js       withGpc() interceptor + sensitive-tool registry
│   └── tool_handlers.js    Raw tool implementations (search, profile, log)
│
├── proposal-dedicated-field/   Proposal: signal via a dedicated field, not _meta
│   ├── orchestrator.js         Builds privacySignals instead of _meta
│   ├── mcp_client.js           In-process MCP client; applies withPrivacySignal()
│   ├── storage.js              Storage gated on privacySignals.gpc
│   └── privacy_signal_policy.js  withPrivacySignal() interceptor
│
├── harness/
│   ├── run_baseline.js     Demo run: GPC off, all tools execute
│   ├── run_gpc.js          Demo run: GPC on, sensitive tools blocked (_meta)
│   ├── run_gpc_dedicated_field.js  Demo run: GPC on, via privacySignals field
│   ├── compare_results.js  Diff baseline vs GPC run, print report
│   └── seed_demo.js        Seed user-42 profile and interaction log
│
├── tests/
│   ├── gpc_policy.test.js  withGpc() blocking, passthrough, signal formats
│   ├── privacy_signal_policy.test.js  withPrivacySignal() blocking, passthrough
│   ├── schema_gap.test.js  Proves the real MCP SDK strips privacySignals, keeps _meta
│   ├── orchestrator.test.js  Full pipeline integration; LLM agents mocked
│   └── agent_loop.test.js  LLM loop: tool_choice, nudge, arg parsing, errors
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
cd architecture-a/mcp
npm install
```

---

## How to test

### Unit and integration tests (no model required)

```bash
npm test
```

52 tests across five files. LLM agents are mocked in `orchestrator.test.js` so no Ollama instance is needed.

| Test file | What it covers |
|---|---|
| `gpc_policy.test.js` | `withGpc()` blocking, passthrough, all GPC signal formats (`1`, `true`, `"1"`) |
| `privacy_signal_policy.test.js` | `withPrivacySignal()` blocking, passthrough, for the dedicated-field proposal |
| `schema_gap.test.js` | Proves the real `@modelcontextprotocol/sdk` strips `privacySignals`, keeps `_meta` |
| `orchestrator.test.js` | Full pipeline: Layer 1 and 2 assertions, timing, storage tested directly |
| `agent_loop.test.js` | Shared LLM loop: `tool_choice` switching, nudge, arg parsing |

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
npm run seed      # Seed user-42 travel history
npm run baseline  # GPC off: all tools execute, data written to output/
npm run gpc       # GPC on: sensitive tools blocked
npm run compare   # Print comparison report from existing output files
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
| `baseline_result.json` | all tools `status: ok` | n/a |
| `gpc_result.json` | n/a | storage tools `status: blocked` |
