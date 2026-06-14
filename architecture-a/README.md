# Architecture A: GPC Enforcement in a Multi-Agent Pipeline

## What it demonstrates

A user with GPC enabled asks an AI assistant: *"Help me plan a 5-day trip to Japan: what should I see, eat, and know before I go?"*

The assistant searches the web, synthesises an itinerary, and (in a non-GPC world) saves the results to the user's profile for future personalised recommendations. This ordinary request naturally exercises four distinct enforcement layers:

| Layer | Mechanism | Enforcement point |
|---|---|---|
| **1. Transport** | W3C `baggage: gpc=<0\|1>` HTTP header | The orchestrator reads `gpc` (0 or 1) once from the inbound request and propagates it to every downstream call |
| **2. Agent protocol** | MCP `_meta` task envelope | GPC signal embedded inside every tool-call so downstream agents receive it alongside task arguments |
| **3. Trust boundary** | Signed RS256 JWT | Orchestrator mints a JWT encoding the GPC value (`true` or `false`) before any call crosses to the third-party vendor; vendor verifies and rejects writes independently |
| **4. Data layer** | `withGpc()` policy interceptor | Wraps all tool handlers in the MCP client layer. A sensitive-tool registry (`gpc_policy.js`) defines which tools touch personal data: `user_profile_lookup`, `save_to_profile`, and `log_interaction`. If `gpc=1` is present in `_meta` and the tool is in the registry, the interceptor returns `status: blocked` without executing. `search_web` is not in the registry and always executes. |

**Result:** the user gets an equally good itinerary whether GPC is on or off. With GPC on, nothing is stored: no profile update, no interaction log entry, no vendor write.

---

## Pipeline

```
HTTP Request (baggage: gpc=1)
  → orchestrator.js             (plain code — reads Baggage, mints JWT, builds _meta)
      → llm_search_agent.js     (LLM loop — decides how many searches to run)
      → synthesis_agent.js      (LLM loop — reasons over raw results, calls no tools)
      → storage.js              (plain code — enforces GPC before writing)
  → HTTP Response
```

### Agent roles

**Search agent** (`agents/llm_search_agent.js`): An LLM loop with one tool (`search_web`). The model decides how many searches to make and when it has enough raw material; it may call `search_web` multiple times with refined queries. The GPC `_meta` envelope is forwarded on every call; however, `search_web` is not in the sensitive-tool registry, so the `withGpc()` interceptor always passes it through regardless of the GPC value. Retrieval is never blocked; only storage is.

**Synthesis agent** (`agents/llm_synthesis_agent.js`) — pure reasoning, no tools. Receives raw search results from the search agent and synthesises them into a structured itinerary. Calling no tools means there is nothing for GPC to block here — demonstrating that opt-out does not degrade answer quality.

**Storage** (`services/storage.js`) — deterministic, no LLM. Calls four storage operations in fixed order. MCP-sensitive writes are double-guarded: explicit code check plus `withGpc()` interceptor at the MCP layer. The third-party write always reaches the vendor so the JWT can demonstrate independent enforcement.

### GPC propagation across the agent boundary

```
User (Sec-GPC: 1 in browser)
  │
  ▼  Layer 1: baggage: gpc=1 header
Orchestrator
  │  reads Baggage → mints JWT(gpc:true) → builds _meta={gpc:1, jwt}
  │
  ├──▶ Layer 2: _meta forwarded in MCP _meta envelope
  │    Search Agent (LLM)
  │      calls search_web(_meta=meta)  [ok — not sensitive, always runs]
  │      returns rawResults
  │
  ├──▶ same _meta forwarded to Synthesis Agent
  │    Synthesis Agent (LLM)
  │      no tool calls — pure reasoning
  │      returns itinerary
  │
  └──▶ same _meta forwarded to storage
       storage.js
         ├──▶ MCP: user_profile_lookup(_meta=meta)
         │      └─▶ withGpc() interceptor            [Layer 4: blocked]
         ├──▶ MCP: save_to_profile(_meta=meta)
         │      └─▶ code guard + withGpc()           [Layer 4: blocked]
         ├──▶ MCP: log_interaction(_meta=meta)
         │      └─▶ code guard + withGpc()           [Layer 4: blocked]
         └──▶ HTTP POST /store  Authorization: Bearer <jwt>
                └─▶ vendor verifyToken() → gpc=true  [Layer 3: blocked]
```

---

## Opt-out categories depicted

Architecture A demonstrates categories A (presence), C (use restrictions), D (persistence), and E (behavioral influence) from the opt-out taxonomy. Enforcement is tool-level and binary: each sensitive tool is either fully blocked or fully permitted when GPC is on.

### Category A: Presence

Architecture A demonstrates **A2 (activation opt-out)**. The user invoked the assistant for one purpose: planning a trip. In the baseline run, the pipeline also silently activates operations the user never chose — logging the interaction, updating a behavioral profile, and syncing to a third-party vendor. With GPC on, only the explicitly-invoked operation runs (`search_web`); the background operations are blocked.

### Category C: Use

**C1 (primary use restriction):** `search_web` always executes — the tool that completes the user's task runs regardless of GPC.

**C2 (secondary use restriction):** `log_interaction` is blocked. The query and response may not be recorded for analytics or profiling.

**C4 (sharing restriction):** the third-party write is blocked by the JWT. Even if MCP-layer enforcement were bypassed, the signed token carries `gpc: true` and the vendor rejects the write independently.

**What it does not cover:** C3 (training restriction) is not separately enforced. Because blocking is tool-level, C2 and C3 cannot be independently scoped.

### Category D: Persistence

**D2 (cross-session scope):** `user_profile_lookup` is blocked. Prior session data may not be retrieved to inform the current session.

**D3 (long-term profile scope):** `save_to_profile` is blocked. No data from this session is written to the persistent profile.

### Category E: Behavioral Influence

**E1 (personalization opt-out):** Blocking `user_profile_lookup` means the session cannot be shaped by stored travel history. The assistant gives the same response regardless of prior trips.

**E3 (targeting opt-out):** Blocking the third-party write means the vendor cannot use this session's data for future recommendations.

---

## File map

```
architecture-a/
├── orchestrator/
│   ├── orchestrator.js       Entry point: reads Baggage, mints JWT, dispatches agents
│   ├── agent_loop.js         Shared LLM turn loop (tool_choice, nudge, required-tool tracking)
│   ├── baggage.js            W3C Baggage encode/decode helpers (Layer 1)
│   └── mcp_client.js         In-process MCP client; applies withGpc() at each call
│
├── agents/                   LLM agents only
│   ├── llm_search_agent.js   LLM search agent (own runAgentLoop, tool: search_web)
│   └── llm_synthesis_agent.js  LLM synthesis agent (own runAgentLoop, no tools)
│
├── services/                 Deterministic supporting infrastructure (no LLM)
│   ├── storage.js            Storage: profile, log, vendor write — GPC-gated via code + MCP
│   └── third_party_storage.js  Express server simulating JWT-gated vendor (Layer 3)
│
├── mcp-server/
│   ├── server.js             MCP server entry point
│   ├── gpc_policy.js         withGpc() interceptor + sensitive-tool registry (Layer 4)
│   ├── tool_handlers.js      Raw tool implementations (search, profile, log)
│   └── identity_provider.js  RS256 JWT sign / verify (Layer 3)
│
├── harness/
│   ├── run_baseline.js       Demo run: GPC off — all tools execute, data written
│   ├── run_gpc.js            Demo run: GPC on — sensitive tools blocked
│   ├── compare_results.js    Diff baseline vs GPC run; print report
│   └── seed_demo.js          Seed user-42 profile, log, and vector store
│
├── tests/
│   ├── gpc_policy.test.js        withGpc() interceptor: blocking, passthrough, signal formats
│   ├── baggage.test.js           W3C Baggage encode / decode round-trips
│   ├── identity_provider.test.js JWT sign, verify, tamper detection, expiry
│   ├── orchestrator.test.js      Full pipeline integration (all 4 layers); LLM agents mocked
│   └── agent_loop.test.js        Shared LLM loop: tool_choice, nudge, arg parsing, errors
│
├── keys/
│   ├── public.pem   Tracked in git; regenerate after cloning (see Setup)
│   └── private.pem  Gitignored; must generate before running
│
└── output/           Gitignored; created at runtime
    ├── profiles.json
    ├── interaction_log.jsonl
    └── vector_store.json
```

---

## Setup

```bash
cd architecture-a
npm install

# Generate RSA keypair for JWT signing.
# private.pem is gitignored — run this once after cloning.
# Re-run if you see "invalid signature" errors.
node -e "
const { generateKeyPairSync } = require('crypto');
const fs = require('fs');
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
fs.writeFileSync('keys/private.pem', privateKey);
fs.writeFileSync('keys/public.pem',  publicKey);
"
```

---

## How to test

### Unit and integration tests (no model required)

```bash
npm test
```

61 tests across five files. LLM agents are mocked in `orchestrator.test.js` so no Ollama instance is needed.

| Test file | What it covers |
|---|---|
| `gpc_policy.test.js` | `withGpc()` blocking, passthrough, all GPC signal formats (`1`, `true`, `"1"`) |
| `baggage.test.js` | W3C Baggage encode / decode round-trips |
| `identity_provider.test.js` | JWT sign, verify, tamper detection, expiry |
| `orchestrator.test.js` | Full pipeline: Layer 1–4 assertions, timing, storage tested directly |
| `agent_loop.test.js` | Shared LLM loop: `tool_choice` switching, nudge, arg parsing, blocked response passthrough |

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
npm run baseline  # GPC off  — all tools execute, data written to output/
npm run gpc       # GPC on   — sensitive tools blocked
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
third_party              │ ✓ ok         │ ✗ BLOCKED
```

---

## What the output files show

After running the demo, `output/` contains:

| File | Baseline | GPC run |
|---|---|---|
| `profiles.json` | user-42 record updated | unchanged (write blocked) |
| `interaction_log.jsonl` | new line appended | unchanged (write blocked) |
| `vector_store.json` | new entry added | unchanged (JWT rejected by vendor) |
| `baseline_result.json` | all tools `status: ok` | n/a |
| `gpc_result.json` | n/a | storage tools `status: blocked` |
