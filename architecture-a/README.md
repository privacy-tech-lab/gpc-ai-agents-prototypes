# Architecture A: GPC Enforcement in a Multi-Agent Pipeline

## What it demonstrates

A user with GPC enabled asks an AI assistant: *"Help me plan a 5-day trip to Japan — what should I see, eat, and know before I go?"*

The assistant searches the web, synthesises an itinerary, and (in a non-GPC world) saves the results to the user's profile for future personalised recommendations. This ordinary request naturally exercises four distinct enforcement layers:

| Layer | Mechanism | Enforcement point |
|---|---|---|
| **1. Transport** | W3C `baggage: gpc=1` HTTP header | Carried on every outbound call; propagated without per-agent code changes |
| **2. Agent protocol** | MCP `_meta` task envelope | GPC signal embedded inside every tool-call so downstream agents receive it alongside task arguments |
| **3. Trust boundary** | Signed RS256 JWT | Orchestrator mints a token with `gpc: true` before any call crosses to the third-party vendor; vendor verifies and rejects writes independently |
| **4. Data layer** | `withGpc()` policy interceptor | Wraps every sensitive tool handler at the MCP server; returns `status: blocked` without executing if `gpc=1` is present in incoming `_meta` |

**Result:** the user gets an equally good itinerary whether GPC is on or off. With GPC on, nothing is stored: no profile update, no interaction log entry, no vendor write.

---

## Opt-out categories depicted

Architecture A demonstrates categories C (use restrictions), D (persistence), and E (behavioral influence) from the opt-out taxonomy. Enforcement is tool-level and binary: each sensitive tool is either fully blocked or fully permitted when GPC is on. This makes Architecture A a coarse-grained implementation — it cannot distinguish between, say, analytics use and training use, or between session-scoped and profile-scoped retention.

### Category C: Use

Architecture A demonstrates C1, C2, and C4.

**C1 (primary use restriction):** demonstrated by contrast. `search_web` always executes — the tool that completes the user's task runs regardless of GPC. Only uses beyond the immediate task are restricted.

**C2 (secondary use restriction):** `log_interaction` is blocked. The Japan trip query and response summary may not be recorded for analytics or behavioral profiling unrelated to the primary task.

**C4 (sharing restriction):** `store_to_third_party` is blocked. Session data may not be passed to the third-party personalisation vendor. The JWT enforcement makes this independent of the MCP layer: even if all MCP-layer enforcement were bypassed, the signed token carries `gpc: true` and the vendor rejects the write independently.

**How it is demoed:** Compare `baseline_result.json` (all five tools `status: ok`) with `gpc_result.json` (`search_web` ok, four data tools blocked). The interaction log and vector store do not grow between GPC runs.

**What it does not cover:** C3 (training restriction) is not separately enforced — there is no distinct training pipeline. Because blocking is tool-level rather than purpose-level, C2 and C3 cannot be independently scoped: a user cannot opt out of training use while permitting analytics. Architecture B addresses this.

### Category D: Persistence

Architecture A demonstrates D2 and D3 in binary form.

**D2 (cross-session scope):** `user_profile_lookup` is blocked. Prior session data — the user's stored travel preferences — may not be retrieved to inform the current session. The current interaction is not personalized using cross-session history.

**D3 (long-term profile scope):** `save_to_profile` is blocked. No data from this session is written to the user's persistent profile. The behavioral model of the user does not grow as a result of this interaction.

Together these mean: existing cross-session data stays out of the current session, and the current session produces no new cross-session data.

**How it is demoed:** Run `npm run baseline` then `npm run gpc`. In the baseline, `profiles.json` is updated. In the GPC run, neither `profiles.json` nor the interaction log changes.

**What it does not cover:** D1 (session scope) is not demonstrated — within-session use of the query is always permitted. Architecture A does not implement duration-based retention, scope-based partitioning, or granular partial-profile writes.

### Category E: Behavioral Influence

Architecture A demonstrates E1 and E3 as consequences of the D-layer blocks, not as independently enforced controls.

**E1 (personalization opt-out):** Blocking `user_profile_lookup` means the current session cannot be shaped by the user's stored travel history. The assistant gives the same response regardless of what prior trips the user has taken.

**E3 (targeting opt-out):** Blocking `store_to_third_party` means the vendor cannot use this session's data to determine what recommendations or offers to show the user in future sessions.

**What it does not cover:** E2 (persuasion opt-out) is not demonstrated. Architecture A controls data flows only; it has no mechanism to prevent the model from applying rapport-building or preference-calibrated tone in its responses. A full E2 implementation would require stateless model invocation with no user profile access.

### Propagation (cross-cutting)

The GPC signal must survive four hops without any single agent being trusted to enforce it alone:

```
User (Sec-GPC: 1 in browser)
  |
  v  Layer 1: baggage: gpc=1 header
Orchestrator
  |  reads Baggage -> mints JWT(gpc:true) -> builds _meta={gpc,jwt}
  |
  |---> Layer 2: _meta forwarded in MCP tool envelope
  |     Search Agent --> MCP server --> search_web  (not sensitive, runs)
  |
  `---> Layer 2: _meta forwarded in MCP tool envelope
        Data Agent
          |---> MCP server --> user_profile_lookup   (Layer 4: blocked by withGpc)
          |---> MCP server --> save_to_profile        (Layer 4: blocked by withGpc)
          |---> MCP server --> log_interaction        (Layer 4: blocked by withGpc)
          `---> HTTP POST  --> Third-party vendor     (Layer 3: blocked by JWT)
```

The tamper-resistance property is demonstrated by the **signal-drop experiment**: if one intermediate agent strips `_meta` before forwarding, Layer 4 fails silently and the three sensitive MCP tools execute. Layer 3 (JWT) still holds because the token was signed by the orchestrator before the drop and the vendor verifies it independently. The finding: without a spec-level requirement to propagate `_meta`, a rogue or misconfigured agent can silently nullify consent for all MCP-layer enforcement. Only the signed JWT provides a trust-boundary backstop.

---

## Pipeline diagram

### Scripted pipeline (deterministic, used by tests)

```
User query --> Orchestrator (orchestrator.js)
                |
                |  reads baggage header -> gpc=1
                |  mints JWT(sub=user-42, gpc=true)
                |  builds meta = { gpc: true, jwt: "..." }
                |
                |--> Search Agent (agents/search_agent.js)
                |      receives: { task, meta }
                |      calls MCP: search_web(query, _meta=meta)
                |        `-> tool_handlers.js: search_web()      [ok] always runs
                |      returns: { search: { status, results } }
                |
                `--> Data Agent (agents/data_agent.js)
                       receives: { task, meta }
                       calls MCP: user_profile_lookup(_meta=meta)
                         `-> withGpc() interceptor              [blocked] gpc=1
                       calls MCP: save_to_profile(_meta=meta)
                         `-> withGpc() interceptor              [blocked] gpc=1
                       calls MCP: log_interaction(_meta=meta)
                         `-> withGpc() interceptor              [blocked] gpc=1
                       calls HTTP: POST /store  Authorization: Bearer <jwt>
                         `-> third_party_storage.js: verifyToken() -> gpc=true  [blocked]

Output: output/baseline_result.json / output/gpc_result.json
```

### LLM pipeline (multi-agent, used for the demo)

```
User query --> LLM Orchestrator (orchestrator/llm_orchestrator.js)
                |
                |  runAgentLoop() -- model: qwen2.5:14b via Ollama
                |  required tools: dispatch_to_search_agent, dispatch_to_data_agent
                |
                |--> dispatch_to_search_agent
                |      LLM Search Agent (agents/llm_search_agent.js)
                |        runAgentLoop() -- required tool: search_web
                |        calls MCP via mcp_client.js -> search_web()   [ok] always runs
                |        returns summary + toolCalls[]
                |
                `--> dispatch_to_data_agent
                       LLM Data Agent (agents/llm_data_agent.js)
                         runAgentLoop() -- required tools:
                           user_profile_lookup  ->  MCP -> withGpc()    [blocked]
                           save_to_profile      ->  MCP -> withGpc()    [blocked]
                           log_interaction      ->  MCP -> withGpc()    [blocked]
                           store_to_third_party ->  HTTP -> JWT check   [blocked]
                         (model instructed to accept blocked responses and continue)
                         returns summary + toolCalls[]

Output: output/ai_baseline_result.json / output/ai_gpc_result.json
```

### Signal-drop experiment

```
Orchestrator --> Search Agent  (normal)
             `-> Data Agent   (dropSignal=true)
                    |  strips _meta before calling MCP tools
                    |
                    |--> MCP: user_profile_lookup  (no _meta -> withGpc skipped)  [RUNS]
                    |--> MCP: save_to_profile      (no _meta -> withGpc skipped)  [RUNS]
                    |--> MCP: log_interaction      (no _meta -> withGpc skipped)  [RUNS]
                    `--> HTTP: /store  (JWT still valid, signed before drop)       [BLOCKED]

Finding: Layer 4 fails; Layer 3 holds. _meta propagation must be mandatory.
```

---

## File map

```
architecture-a/
|-- orchestrator/
|   |-- llm_orchestrator.js   LLM orchestrator: reads Baggage, mints JWT, dispatches to agents
|   |-- agent_loop.js         Shared LLM turn loop (tool_choice, nudge, required-tool tracking)
|   |-- baggage.js            W3C Baggage encode/decode helpers (Layer 1)
|   `-- mcp_client.js         In-process MCP client; applies withGpc() at each call
|
|-- agents/
|   |-- search_agent.js       Scripted search agent
|   |-- data_agent.js         Scripted data agent
|   |-- llm_search_agent.js   LLM search agent (own runAgentLoop, tool: search_web)
|   |-- llm_data_agent.js     LLM data agent (own runAgentLoop, 4 required tools)
|   `-- third_party_storage.js  Express server simulating JWT-gated vendor (Layer 3)
|
|-- mcp-server/
|   |-- server.js             MCP server entry point
|   |-- gpc_policy.js         withGpc() interceptor + sensitive-tool registry (Layer 4)
|   |-- tool_handlers.js      Raw tool implementations (search, profile, log)
|   `-- identity_provider.js  RS256 JWT sign / verify (Layer 3)
|
|-- orchestrator/
|   `-- orchestrator.js       Scripted orchestrator (used by integration tests)
|
|-- harness/
|   |-- run_baseline.js       Scripted run: GPC off
|   |-- run_gpc.js            Scripted run: GPC on
|   |-- run_signal_drop.js    Scripted run: GPC on + _meta stripped mid-chain
|   |-- compare_results.js    Diff baseline vs GPC vs signal-drop; print report
|   |-- seed_demo.js          Seed user-42 profile, log, and vector store
|   |-- run_ai_baseline.js    LLM run: GPC off
|   `-- run_ai_gpc.js         LLM run: GPC on
|
|-- tests/
|   |-- gpc_policy.test.js        withGpc() interceptor: blocking, passthrough, signal formats
|   |-- baggage.test.js           W3C Baggage encode/decode
|   |-- identity_provider.test.js JWT sign, verify, tamper detection
|   |-- orchestrator.test.js      Full scripted pipeline integration (all 4 layers, signal-drop)
|   `-- agent_loop.test.js        Shared LLM loop: tool_choice, nudge, arg parsing, errors
|
|-- keys/
|   |-- public.pem   Tracked in git; must be regenerated after cloning (see Setup)
|   `-- private.pem  Gitignored; must generate before running
|
`-- output/           Gitignored; created at runtime
    |-- profiles.json
    |-- interaction_log.jsonl
    `-- vector_store.json
```

---

## Setup

```bash
cd architecture-a
npm install

# Generate RSA keypair for JWT signing.
# private.pem is gitignored so every contributor must run this once after cloning.
# public.pem is tracked but must match the local private.pem — re-run this command
# whenever you re-clone or if you see "invalid signature" errors from the JWT tests.
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

60 tests across five files. The `orchestrator.test.js` suite runs the full four-layer scripted pipeline end-to-end.

| Test file | What it covers |
|---|---|
| `gpc_policy.test.js` | `withGpc()` blocking, passthrough, all GPC signal formats (`1`, `true`, `"1"`) |
| `baggage.test.js` | W3C Baggage encode / decode round-trips |
| `identity_provider.test.js` | JWT sign, verify, tamper detection, expiry |
| `orchestrator.test.js` | Full scripted pipeline: baseline, GPC, signal-drop, all four layers, timing |
| `agent_loop.test.js` | Shared LLM loop: `tool_choice` switching, nudge on ignored tool, arg parsing, blocked response passthrough, API error handling |

### Scripted demo (deterministic, no model required)

Runs baseline -> GPC -> signal-drop -> comparison report in one command:

```bash
npm run demo
```

Individual runs:

```bash
npm run baseline      # GPC off  -- all tools execute, data written to output/
npm run gpc           # GPC on   -- sensitive tools blocked
npm run signal-drop   # GPC on, _meta stripped by data agent
npm run compare       # Print comparison report from existing output files
```

Expected comparison report:

```
Tool                         | Baseline     | GPC          | Signal-drop
------------------------------------------------------------------------
search_web                   | ok           | ok           | ok
user_profile_lookup          | ok           | BLOCKED      | ok
log_interaction              | ok           | BLOCKED      | ok
save_to_profile              | ok           | BLOCKED      | ok
third_party_store            | ok           | BLOCKED      | BLOCKED
```

### LLM demo (requires Ollama)

```bash
# 1. Start Ollama (skip if desktop app is already running)
ollama serve

# 2. Pull the model once
ollama pull qwen2.5:14b

# 3. Run the full demo (seeds user-42, runs baseline + GPC, prints report)
npm run ai-demo
```

Individual LLM runs (run `npm run seed` first to populate user-42 profile data):

```bash
npm run seed           # Seed realistic user-42 travel history
npm run ai-baseline    # GPC off  -- LLM agents call all tools, data written
npm run ai-gpc         # GPC on   -- LLM agents receive blocked responses
npm run ai-compare     # Print comparison report for AI output files
```

Override the model:

```bash
OLLAMA_MODEL=llama3.1:70b npm run ai-demo
```

Use real web search (Tavily free tier, 1000 calls/month):

```bash
TAVILY_API_KEY=tvly-... npm run ai-demo
```

---

## What the output files show

After running the scripted demo, `output/` contains:

| File | Baseline | GPC run |
|---|---|---|
| `profiles.json` | user-42 record updated | unchanged (write blocked) |
| `interaction_log.jsonl` | new line appended | unchanged (write blocked) |
| `vector_store.json` | new entry added | unchanged (JWT rejected) |
| `baseline_result.json` | all tools `status: ok` | n/a |
| `gpc_result.json` | n/a | data tools `status: blocked` |
| `signal_drop_result.json` | n/a | MCP tools `ok`, vendor `blocked` |
