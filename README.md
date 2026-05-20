# GPC AI Agents Prototypes

Experimental prototypes exploring how the **Global Privacy Control (GPC)** signal propagates, survives, and is enforced across multi-agent AI pipelines. Each prototype simulates a realistic agentic workflow spanning an LLM orchestrator, specialist sub-agents, an MCP tool server, and a third-party vendor service — then tests whether a user's GPC opt-out survives the entire chain intact.

---

## Architecture A — Signal Propagation Enforcement

### Scenario

A user with GPC enabled asks an AI assistant: *"Help me plan a 5-day trip to Japan — what should I see, eat, and know before I go?"* The assistant searches the web, synthesises an itinerary, and saves the results to the user's profile for future personalised recommendations. This ordinary request naturally exercises all four enforcement layers:

| Layer | Mechanism | What it does |
|---|---|---|
| **1 — Transport** | W3C `baggage` HTTP header | Carries `gpc=1` on every outbound call without per-agent code |
| **2 — Agent protocol** | MCP `_meta` task envelope | Embeds the GPC signal inside every tool-call so downstream agents receive it alongside task arguments |
| **3 — Trust boundary** | Signed RS256 JWT | The orchestrator obtains a token from a local IdP before any call crosses to the third-party vendor; the vendor verifies it independently and rejects writes when `gpc=true` |
| **4 — Data layer** | `withGpc()` policy interceptor | Wraps every sensitive tool handler; returns a blocked response without executing if `gpc=1` appears in the incoming `_meta` |

**Without GPC:** the search runs and a full itinerary is returned. The user's travel preferences are updated in their profile, the interaction is logged, and the result is pushed to the third-party personalisation vendor so future recommendations can be tailored.

**With GPC:** the same itinerary is returned. But nothing is stored: the profile lookup is blocked, the interaction log is not updated, and the vendor write is rejected — even though the user gets an equally good answer.

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

#### LLM pipeline (multi-agent, used for the demo)

```
LLM Orchestrator (orchestrator/llm_orchestrator.js)
  │
  ├─► LLM Search Agent (agents/llm_search_agent.js)
  │     tool: search_web  ──► MCP server
  │
  └─► LLM Data Agent (agents/llm_data_agent.js)
        tools: user_profile_lookup  ──► MCP server  (blocked by withGpc when GPC on)
               save_to_profile      ──► MCP server  (blocked)
               log_interaction      ──► MCP server  (blocked)
               store_to_third_party ──► Third-party HTTP (blocked by JWT when GPC on)
```

**Tools exposed by the MCP server**

| Tool | GPC-sensitive |
|---|---|
| `user_profile_lookup` | Yes — blocked when `gpc=1` |
| `save_to_profile` | Yes — blocked when `gpc=1` |
| `log_interaction` | Yes — blocked when `gpc=1` |
| `search_web` | No — always executes |

---

### Signal-drop experiment

`harness/run_signal_drop.js` strips the `_meta` field before forwarding: Layer 4 (MCP policy) fails silently — the three sensitive MCP tools execute despite `gpc=1`. Layer 3 (JWT) still holds because the token was signed before the drop. This provides empirical motivation for a spec-level requirement to propagate the `_meta` field.

---

### Prerequisites

- **Node.js 18+** — native `fetch` is used throughout. Install via `brew install node` or [nodejs.org](https://nodejs.org).
- **npm** — bundled with Node.js
- **[Ollama](https://ollama.com)** — only needed for the LLM demo runs

---

### Setup

```bash
cd architecture-a && npm install

# Generate the RSA keypair for JWT signing (keys/private.pem is gitignored)
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

### Running

```bash
npm run demo          # baseline + GPC + signal-drop + comparison report

npm run baseline      # GPC off  — all tools execute
npm run gpc           # GPC on   — sensitive tools blocked
npm run signal-drop   # GPC on, _meta stripped mid-chain
npm run compare       # Print comparison report from existing output files

# LLM demo (requires Ollama + qwen2.5:14b or llama3.1:70b)
npm run ai-demo
```

### Expected comparison report

```
Tool                         │ Baseline     │ GPC          │ Signal-drop
─────────────────────────────────────────────────────────────────────────
search_web                   │ ✓ ok         │ ✓ ok         │ ✓ ok
user_profile_lookup          │ ✓ ok         │ ✗ BLOCKED    │ ✓ ok
log_interaction              │ ✓ ok         │ ✗ BLOCKED    │ ✓ ok
save_to_profile              │ ✓ ok         │ ✗ BLOCKED    │ ✓ ok
store_to_third_party         │ ✓ ok         │ ✗ BLOCKED    │ ✗ BLOCKED
```

### Tests

```bash
npm test   # 60 tests across gpc_policy, baggage, identity_provider, orchestrator, agent_loop
```

---

---

## Architecture B — Purpose-Based Enforcement

### Scenario

A patient consults a medical assistant that retrieves their health records and answers their query. The same session data could simultaneously feed an analytics log, a model-training dataset, and a pharmaceutical ad-targeting pipeline running in the background.

**This is the key distinction from Architecture A:** the tools are not inherently GPC-sensitive. `get_medical_records` is *required* for the primary task. The opt-out is not about blocking the tool — it is about blocking the *purpose* for which the tool's output is used downstream.

**Without GPC:** the query runs, records are retrieved, the interaction is logged for analytics, the query is added to a training dataset, and a derived interest profile is updated for ad targeting.

**With GPC:** the query still runs and records are still retrieved for the immediate response, but every secondary-purpose operation is blocked. The patient gets a full answer; nothing travels beyond the primary task.

---

### The Purpose Registry

`mcp-server/purpose_registry.js` is the single source of truth for the relationship between tools and purposes. Each entry declares which purposes the tool can serve and which are GPC-restricted:

| Tool | Declared Purposes | GPC-Restricted Purposes |
|---|---|---|
| `get_medical_records` | `primary_task`, `personalization` | `personalization` |
| `answer_question` | `primary_task` | *(none)* |
| `log_interaction` | `analytics`, `model_training` | `analytics`, `model_training` |
| `update_interest_profile` | `personalization` | `personalization` |
| `add_to_training_set` | `model_training` | `model_training` |

`get_medical_records` is never fully blocked — only its `personalization` purpose is restricted. This is the architectural distinction from Architecture A's binary block.

---

### The `withPurposeCheck()` interceptor

Unlike `withGpc()` which checks whether a tool is GPC-sensitive, `withPurposeCheck()` reads two fields from the incoming tool call metadata: `gpc` and `purpose`. It looks up the tool in the purpose registry and checks whether the declared purpose is in `gpc_restricted_purposes`:

```
meta.gpc = 1, meta.purpose = "analytics"
  → log_interaction.gpc_restricted_purposes.includes("analytics")  → BLOCKED

meta.gpc = 1, meta.purpose = "primary_task"
  → get_medical_records.gpc_restricted_purposes.includes("primary_task")  → ALLOWED

meta.gpc = 1, meta.purpose = (absent)
  → maximally restricted  → BLOCKED
```

The absence of a `purpose` field is treated as maximally restricted — this motivates purpose declaration as a required field in any agent protocol spec.

---

### Pipeline

```
Orchestrator
  │
  ├─► Primary (always runs, regardless of GPC)
  │     get_medical_records  purpose: primary_task  ──► MCP server
  │     answer_question       purpose: primary_task  ──► MCP server
  │
  └─► Secondary (parallel, purpose-gated)
        log_interaction          purpose: analytics       ──► MCP server   [B2 Collection]
        add_to_training_set      purpose: model_training  ──► MCP server   [B2 Processing]
        update_interest_profile  purpose: personalization ──► MCP server   [B2 Inference]
        ad_platform HTTP write   purpose: ad_targeting    ──► Express stub [B2 Storage]
```

---

### B2 Operation Layers

Each secondary pipeline maps to one of B2's four operation types:

| Layer | Tool | What is blocked |
|---|---|---|
| **Collection** | `log_interaction` | Raw query never recorded in the analytics log |
| **Processing** | `add_to_training_set` | Collected data cannot be repurposed for model training |
| **Inference** | `update_interest_profile` | No behavioral profile derived from the session |
| **Storage** | `ad_platform` (vector DB write) | Derived interest data never reaches the ad store |

---

### Partial opt-out

The W3C Baggage header carries an optional `gpc_scope` field — a pipe-delimited list of purposes the user has opted out of:

```
baggage: gpc=1,gpc_scope=ad_targeting|model_training
```

The interceptor uses this list instead of the registry defaults. This produces the partial run's critical result: `log_interaction` (analytics) executes while `add_to_training_set` (model_training) is blocked — the same tool category, different declared purpose, different outcome.

---

### Setup

```bash
cd architecture-b && npm install
```

### Running

```bash
npm run demo          # baseline + gpc-full + gpc-partial + purpose matrix report

npm run baseline      # gpc=0 — all pipelines execute
npm run gpc-full      # gpc=1 — all secondary purposes blocked
npm run gpc-partial   # gpc=1, scope=ad_targeting|model_training — partial block
npm run compare       # Print purpose matrix from existing output files
```

### Purpose Matrix (the key paper output)

```
Tool                       │ Purpose          │ B2 Layer    │ Baseline  │ GPC Full  │ GPC Partial
───────────────────────────────────────────────────────────────────────────────────────────────────
get_medical_records        │ primary_task     │ Primary     │ ✓ ok      │ ✓ ok      │ ✓ ok
answer_question            │ primary_task     │ Primary     │ ✓ ok      │ ✓ ok      │ ✓ ok
log_interaction            │ analytics        │ Collection  │ ✓ ok      │ ✗ BLOCKED │ ✓ ok
add_to_training_set        │ model_training   │ Processing  │ ✓ ok      │ ✗ BLOCKED │ ✗ BLOCKED
update_interest_profile    │ personalization  │ Inference   │ ✓ ok      │ ✗ BLOCKED │ ✓ ok
ad_platform                │ ad_targeting     │ Storage     │ ✓ ok      │ ✗ BLOCKED │ ✗ BLOCKED
```

The GPC Partial column makes the argument: `log_interaction` executes while `add_to_training_set` is blocked. Same secondary pipeline category, different declared purpose, different outcome. Opt-out is purpose-scoped, not tool-scoped.

### Tests

```bash
npm test   # 32 tests across purpose_registry, interceptor, orchestrator
```

---

## Copyright

Copyright 2024 Privacy Tech Lab at Wesleyan University. Licensed under the MIT License — see [LICENSE](LICENSE).
