# Prototype 5: Profile Write Gate

## What it demonstrates

A user runs eight ordinary search queries. None of them disclose anything directly: they are questions anyone might type. But the text of each query can be fed through a classifier that infers personal attributes: a health condition, a financial situation, an employment status. Run across a session, those inferences accumulate into a detailed profile the user never agreed to hand over. This is what the *inference preference* covers, and it is hard to enforce because the answer the user wanted is still useful, and the inference happens server-side where the user never sees it.

Prototype 5 puts a profile write gate between the classifier and the profile store. When the GPC signal is on, the inference is intercepted before it is written: the answer still reaches the user, but no attributes are kept. When the signal is off, the same pipeline builds a full shadow profile from the eight queries.

The gate can be driven two ways. The **deterministic core** (`orchestrator.js`) runs a fixed list of eight queries through the classifier with no model — the eight stand in for a session's worth of searches, and this is what the tests exercise. The optional **LLM agent** (`agent.js`, requires Ollama) gives a real model a `search` tool and lets it decide to call it for each question; the gate runs *inside* that tool, so the model only ever sees the answer and can't route around it. Either way, what is under test is the gate at the classify-to-store boundary, not how the queries are chosen.

| Mechanism | Where | What it does |
|---|---|---|
| **Query classifier** | `query_classifier.js` | Maps each query to `inferred_attributes` and a canned `answer`. Static table — a real system would use an embedding model; this keeps the run deterministic. |
| **Profile store** | `profile_store.js` | In-memory shadow profile. `write()` merges attributes; `blocked_count` tracks suppressed writes. Fresh per run, never persisted. |
| **Inference engine (gate off)** | `inference_engine.js` | `derive()` writes the classified attributes into the store. |
| **Profile write gate (gate on)** | `profile_write_gate.js` | `block()` records `would_have_written` and increments `blocked_count`, and never writes. |

**Result:** the answer is delivered in both modes. With the gate off, eight queries leave eleven attributes in the profile. With the gate on, the profile stays empty and all eight inference attempts are recorded as blocked. The signal changes whether the system keeps what it inferred, not whether the user gets an answer.

---

## What is gated

Prototype 5 gates inference: what a system concludes about a user, as distinct from what the user submits (input collection) or what they unknowingly produce (metadata collection). The gate enforces at the storage boundary: the classifier still runs and the inference is still computed (`would_have_written` reports it), but nothing is written to the profile. This is the practical reading of the inference preference, not a strict block on computing the inference in the first place.

| | gate off (baseline) | gate on (enforced) |
|---|---|---|
| Query answered | yes | yes |
| Attributes written to profile | yes | no |
| Shadow profile at session end | 11 attributes | 0 attributes |
| Inference attempts blocked | 0 | 8 |

```mermaid
flowchart TD
    Q["Search query"] --> MC["mcp_client.js ⇄ stdio ⇄\nmcp-server/server.js\nclassify_query(query)"]
    MC --> CL["{ inferred_attributes, answer }"]
    CL --> SIG{"GPC signal on?"}
    SIG -- "no (baseline)" --> ENG["inference_engine.derive()"]
    ENG --> WR["profile_store.write()\nshadow profile grows"]
    WR --> R1["{ status: derived, attributes, answer }"]
    SIG -- "yes (enforced)" --> FW["profile_write_gate.block()"]
    FW --> NW["profile_store NOT written\nblocked_count++\nwould_have_written recorded"]
    NW --> R2["{ status: blocked, reason: profile_write_gate,\nwould_have_written, answer }"]
    R1 --> ANS["Answer returned to user\n(identical in both modes)"]
    R2 --> ANS

    classDef enforced fill:#5b8def,stroke:#2f5fce,color:#fff
    class FW,NW enforced
```

---

## Protocol compliance

- **MCP.** `query_classifier.js`'s classify step is served by `mcp-server/server.js`, a real `@modelcontextprotocol/sdk` `Server` over stdio, reached by `mcp_client.js`, a real `Client` that spawns it as a child process. The gate/engine decision and the profile store stay client-side in `orchestrator.js` / `agent.js`, unchanged: that decision accumulates state across a whole session (8 queries sharing one store), and the existing unit tests exercise that state directly — moving it server-side would mean redesigning session identity instead of adding real protocol compliance for no added demonstration value. Classification is the one piece that's stateless and is genuinely "a tool the platform calls."
- **A2A.** Not applicable. There's a single agent here; the gate and profile store are internal platform mechanics, not a second agent to hand off to.

---

## Eight queries and what they reveal

| Query | Inferred attributes |
|---|---|
| What are the side effects of metformin? | `health_flags: [possible_diabetes]`, `medical_interest: true` |
| How do I negotiate a lower rent? | `housing_situation: renting`, `financial_pressure: true` |
| What is the average cost of a hearing aid? | `health_flags: [possible_hearing_loss]`, `age_indicator: older` |
| How do I apply for SNAP benefits? | `income_bracket: low`, `benefit_eligible: true` |
| What are low-sodium meal ideas? | `dietary_restriction: low_sodium`, `health_flags: [cardiovascular_concern]` |
| How do I dispute a medical bill? | `healthcare_access: strained`, `financial_pressure: true` |
| What are signs of anxiety? | `mental_health_flags: [possible_anxiety]` |
| What is a good entry-level resume template? | `employment_status: job_seeking` |

No single query asks the user to disclose anything. Together they describe health, finances, housing, mental health, and employment.

---

## Pipeline

### Gate off (baseline, the failure case)

```
query
  → mcp_client.js ⇄ stdio ⇄ mcp-server/server.js: classify_query(query)   { inferred_attributes, answer }
      → inference_engine.derive()  writes attributes to the store
          → profile_store.write()  shadow profile grows
  → { status: 'derived', attributes, answer }
```

### Gate on (the enforced case)

```
query
  → mcp_client.js ⇄ stdio ⇄ mcp-server/server.js: classify_query(query)   { inferred_attributes, answer }
      → profile_write_gate.block()  intercepts here
          → profile_store.write() is NOT called
          → blocked_count incremented
  → { status: 'blocked', reason: 'profile_write_gate', would_have_written, answer }
```

The classifier runs in both modes because it produces the answer as well as the inference. The gate does not stop the classifier; it stops the write. The gate sits between classification and storage, not before classification.

## File map

```
prototype-5/
├── query_classifier.js    Maps 8 queries to inferred attributes + a canned answer
├── mcp_client.js          Real MCP client (stdio) — spawns mcp-server/server.js
├── profile_store.js       createProfileStore(); tracks attributes and blocked_count
├── inference_engine.js    derive(): writes classified attributes to the store (gate off)
├── profile_write_gate.js  block(): records would_have_written, never writes (gate on)
│
├── mcp-server/
│   └── server.js          MCP server entry point (real @modelcontextprotocol/sdk Server, stdio);
│                          exposes classify_query, thin wrapper around query_classifier.js
│
│  Deterministic core (no model — what the tests run):
├── orchestrator.js        run(gateOn): processes all 8 queries in sequence
├── run_baseline.js        gate off — shadow profile accumulates
├── run_gate.js            gate on — inference blocked, profile stays empty
│
│  LLM agent path (requires Ollama):
├── agent_loop.js          Shared LLM turn loop (copied from Prototype 1)
├── agent.js               search tool + executeSearch (the gate boundary); ask(), runSession()
├── run_agent.js           Live demo: a model drives the session, --gate toggles the gate
├── package.json
│
└── tests/
    ├── query_classifier.test.js    classify() output, deep-copy isolation, allQueries()
    ├── profile_store.test.js       write() merge rules, snapshot isolation, blocked_count
    ├── profile_write_gate.test.js  derive() vs block(); store left untouched on block
    ├── orchestrator.test.js        full run, baseline vs gate, profile snapshot
    └── agent.test.js               executeSearch: answer-only return, write vs block, unknown query
```

---

## Setup

No API keys — the classifier is a static table and the pipeline is deterministic. Node.js 18+.

```bash
cd prototype-5
npm install
```

---

## How to test

### Unit and integration tests

```bash
npm test
```

92 tests across five files. No model needed — the LLM agent's enforcement seam (`executeSearch`) is tested directly, so the gate is verified without Ollama.

| Test file | What it covers |
|---|---|
| `query_classifier.test.js` | `classify()` returns attributes + answer; deep copies isolate the static table; `allQueries()` order |
| `profile_store.test.js` | `write()` scalar overwrite and array merge-without-duplicates; `snapshot()` isolation; `blocked_count` |
| `profile_write_gate.test.js` | `derive()` writes; `block()` records `would_have_written` and leaves the store untouched |
| `orchestrator.test.js` | Full run for both modes; baseline accumulates 11 attributes, the gate blocks all 8 |
| `agent.test.js` | `executeSearch`: returns the answer only (never the attributes), writes when gate off, blocks when gate on, degrades gracefully on an unknown query |

### Demo runs (deterministic, no model)

```bash
npm run baseline  # gate off — shadow profile accumulates
npm run gate      # gate on  — inference blocked, profile stays empty
npm run demo      # both in sequence
```

### Run as a real agent (requires Ollama)

A live model decides to call the `search` tool for each question; the gate runs inside the tool, so the model only ever sees the answer. The shadow-profile outcome (11 vs 0) is the same as the deterministic runs, because the classifier stays deterministic — only the driver changes.

```bash
ollama serve                 # start Ollama if it isn't running
ollama pull qwen2.5:14b      # once; override with OLLAMA_MODEL

npm run agent                # gate off — the model answers; a profile is built
npm run agent:gate           # gate on  — the model answers; nothing is kept
```

---

## What the output shows

Each run prints a JSON object followed by a short summary.

| Field | What it records |
|---|---|
| `gate_active` | Whether the gate is engaged |
| `query_results` | Per query: `status`, `answer`, and either `attributes` (derived) or `would_have_written` (blocked) |
| `shadow_profile` | Final store state: `attributes` and `blocked_count` |
| `profile_attribute_count` | Number of attributes kept — 11 at baseline, 0 with the gate on |
| `inference_blocked_count` | Number of inferences suppressed — 0 at baseline, 8 with the gate on |

`would_have_written` is the audit trail: with the gate on it records exactly what the system intended to infer, so the suppression is visible rather than silent.

---

## How it differs from Prototype 3

| | Prototype 3 | Prototype 5 |
|---|---|---|
| What is gated | Tool execution | Attribute writing |
| User prompt | Yes — a consent prompt fires for new tools | No — GPC is a signal, not a dialogue |
| State | Consent manifest on disk | In-memory store, per session |
| Answer suppressed by the signal | Sometimes (the tool is quarantined) | Never — the answer is always delivered |
