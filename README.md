# GPC AI Agents Prototypes

Experimental prototypes exploring how the **Global Privacy Control (GPC)** signal propagates, survives, and is enforced across multi-agent AI pipelines. Each prototype simulates a realistic agentic workflow spanning an LLM orchestrator, specialist sub-agents, an MCP tool server, and a third-party vendor service — then tests whether a user's GPC opt-out survives the entire chain intact.

---

## Architecture A

### Scenario

A user asks an AI assistant to *research a topic and save a summary to their profile*. This single request naturally exercises all four enforcement layers:

| Layer | Mechanism | What it does |
|---|---|---|
| **1 — Transport** | W3C `baggage` HTTP header | Carries `gpc=1` on every outbound call without per-agent code |
| **2 — Agent protocol** | MCP `_meta` task envelope | Embeds the GPC signal inside every tool-call so downstream agents receive it alongside task arguments |
| **3 — Trust boundary** | Signed RS256 JWT | The orchestrator obtains a token from a local IdP before any call crosses to the third-party vendor; the vendor verifies it independently and rejects writes when `gpc=true` |
| **4 — Data layer** | `withGpc()` policy interceptor | Wraps every sensitive tool handler; returns a blocked response without executing if `gpc=1` appears in the incoming `_meta` |

**Without GPC:** the search runs, the user's profile is updated, the interaction is logged, and the result is stored in the third-party vector store for future personalisation.

**With GPC:** the search still runs and a response is returned, but nothing is stored anywhere and no personal data is accessed.

---

### Pipeline

There are two run modes that share the same enforcement stack:

#### Scripted pipeline (deterministic, used by tests)

```
Orchestrator (orchestrator.js)
  ├─► Search Agent  (agents/search_agent.js)   ──► MCP server ──► search_web
  └─► Data Agent    (agents/data_agent.js)      ──► MCP server ──► user_profile_lookup
                                                                ──► save_to_profile
                                                                ──► log_interaction
                                                ──► Third-party HTTP ──► store (JWT-gated)
```

The scripted pipeline uses fixed tool call sequences. It is deterministic and is the basis for the integration test suite.

#### LLM pipeline (multi-agent, used for the demo)

```
LLM Orchestrator (orchestrator/llm_orchestrator.js)
  │   runs its own LLM loop; dispatches via tool calls
  │
  ├─► LLM Search Agent (agents/llm_search_agent.js)
  │     runs its own LLM loop
  │     tool: search_web  ──► MCP server
  │
  └─► LLM Data Agent (agents/llm_data_agent.js)
        runs its own LLM loop
        tools: user_profile_lookup  ──► MCP server  (blocked by withGpc when GPC on)
               save_to_profile      ──► MCP server  (blocked)
               log_interaction      ──► MCP server  (blocked)
               store_to_third_party ──► Third-party HTTP (blocked by JWT when GPC on)
```

Each agent runs an independent LLM loop via the shared `orchestrator/agent_loop.js` helper. The orchestrator never calls MCP tools directly — it delegates to agents and synthesises their responses. The GPC enforcement layers are identical in both modes; only the decision-making changes.

**Shared helpers**

| File | Role |
|---|---|
| `orchestrator/agent_loop.js` | Shared LLM turn loop used by all three LLM agents |
| `orchestrator/baggage.js` | W3C Baggage encode/decode (Layer 1) |
| `orchestrator/mcp_client.js` | In-process MCP client with `withGpc()` applied at each call |
| `mcp-server/gpc_policy.js` | `withGpc()` interceptor and sensitive-tool registry (Layer 4) |
| `mcp-server/tool_handlers.js` | Raw tool implementations (search, profile, log) |
| `agents/third_party_storage.js` | Express server simulating the JWT-gated vendor (Layer 3) |

**Tools exposed by the MCP server**

| Tool | GPC-sensitive |
|---|---|
| `user_profile_lookup` | Yes — blocked when `gpc=1` |
| `save_to_profile` | Yes — blocked when `gpc=1` |
| `log_interaction` | Yes — blocked when `gpc=1` |
| `search_web` | No — always executes |

---

### Signal-drop experiment

`harness/run_signal_drop.js` runs the scripted pipeline with `dropSignal=true`: one agent strips the `_meta` field before forwarding. This causes Layer 4 (MCP policy) to fail silently — the three sensitive MCP tools execute despite `gpc=1`. Layer 3 (JWT) still holds because the token was signed by the orchestrator *before* the drop. The comparison report surfaces this finding and identifies which tools ran.

This provides empirical motivation for a spec-level requirement to propagate the `_meta` field.

---

### Prerequisites

- **Node.js 18+** (native `fetch` required) — `brew install node`
- **npm** (bundled with Node.js)
- **[Ollama](https://ollama.com)** for the LLM demo runs

---

### Setup

```bash
git clone <repo-url>
cd gpc-ai-agents-prototypes/architecture-a

npm install

# Generate the RSA keypair used for JWT signing (run once)
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

### Running

#### Scripted demo

Deterministic — no model required. Runs baseline, GPC, and signal-drop experiments, then prints the comparison report.

```bash
npm run demo
```

Individual scripted runs:

```bash
npm run baseline      # GPC off  — all tools execute, data written
npm run gpc           # GPC on   — sensitive tools blocked
npm run signal-drop   # GPC on, _meta stripped by data agent
npm run compare       # Print comparison report from existing output files
```

#### LLM demo

Requires Ollama with a capable model. The default is `qwen2.5:14b`; `llama3.1:70b` also works. Models below 14B are too unreliable for multi-step tool chains.

```bash
# Pull the model (once)
ollama pull qwen2.5:14b

# Seed realistic user-42 history so the personalisation contrast is visible
npm run seed

# Run baseline (GPC off) and GPC run, then print the comparison report
npm run ai-demo
```

Individual LLM runs:

```bash
npm run ai-baseline    # GPC off  — LLM agents call all tools, data written
npm run ai-gpc         # GPC on   — LLM agents receive blocked responses
npm run ai-compare     # Print comparison report for AI output files
```

Override the model:

```bash
OLLAMA_MODEL=llama3.1:70b npm run ai-demo
```

#### Optional: real web search (Tavily)

`search_web` uses five rich static results by default. To use the [Tavily](https://tavily.com) API instead (free tier: 1000 calls/month):

```bash
TAVILY_API_KEY=tvly-... npm run ai-demo
```

---

### Expected results

#### Baseline run

All operations complete; data is written to `output/`:

| Tool | Result |
|---|---|
| `search_web` | `status: ok` — returns 5 GPC research snippets |
| `user_profile_lookup` | `status: ok` — returns existing user-42 profile |
| `save_to_profile` | `status: ok` — updates `output/profiles.json` |
| `log_interaction` | `status: ok` — appends to `output/interaction_log.jsonl` |
| `store_to_third_party` | `status: ok` — writes to `output/vector_store.json` |

#### GPC run

Search executes; all personal-data operations are blocked before touching storage:

| Tool | Result |
|---|---|
| `search_web` | `status: ok` — unaffected by GPC |
| `user_profile_lookup` | `status: blocked, reason: gpc_opt_out` (Layer 4) |
| `save_to_profile` | `status: blocked, reason: gpc_opt_out` (Layer 4) |
| `log_interaction` | `status: blocked, reason: gpc_opt_out` (Layer 4) |
| `store_to_third_party` | `status: blocked, layer: trust_boundary_jwt` (Layer 3) |

The interaction log and vector store do not grow between GPC runs.

#### Signal-drop experiment (scripted only)

`gpc=1` is in the Baggage header, but the data agent strips `_meta`. Layer 4 fails: `user_profile_lookup`, `save_to_profile`, and `log_interaction` all execute. Layer 3 holds: `store_to_third_party` is still blocked by the JWT.

#### Comparison report

```
Tool                         │ Baseline     │ GPC          │ Signal-drop
─────────────────────────────────────────────────────────────────────────
search_web                   │ ✓ ok         │ ✓ ok         │ ✓ ok
user_profile_lookup          │ ✓ ok         │ ✗ BLOCKED    │ ✓ ok
log_interaction              │ ✓ ok         │ ✗ BLOCKED    │ ✓ ok
save_to_profile              │ ✓ ok         │ ✗ BLOCKED    │ ✓ ok
store_to_third_party         │ ✓ ok         │ ✗ BLOCKED    │ ✗ BLOCKED
```

---

### Tests

```bash
npm test
```

60 tests across five files:

| File | What it tests |
|---|---|
| `tests/gpc_policy.test.js` | `withGpc()` interceptor — blocking, passthrough, all GPC signal formats |
| `tests/baggage.test.js` | W3C Baggage encode/decode helpers |
| `tests/identity_provider.test.js` | JWT sign, verify, tamper detection |
| `tests/orchestrator.test.js` | Full scripted pipeline integration — all four layers, signal-drop experiment, timing |
| `tests/agent_loop.test.js` | Shared LLM loop — tool_choice switching, nudge behaviour, argument parsing, blocked response passthrough, API error handling |

---

## Copyright

Copyright 2024 Privacy Tech Lab at Wesleyan University. Licensed under the MIT License — see [LICENSE](LICENSE).
