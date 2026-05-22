# Architecture B: Purpose-Based GPC Enforcement in a Medical Assistant Pipeline

## What it demonstrates

A patient with GPC enabled asks a medical assistant: *"What does my blood pressure reading mean, and should I adjust my medication?"*

The assistant retrieves the patient's health records and answers the question. In a non-GPC world, the same session data simultaneously feeds an analytics log, a model-training dataset, an interest-profiling system, and a pharmaceutical ad-targeting pipeline. This is the critical distinction from Architecture A: the tool that retrieves the records (`get_medical_records`) is not blocked — only the *purposes* for which its output travels downstream are blocked.

| Layer | Mechanism | Enforcement point |
|---|---|---|
| **1. Transport** | W3C `baggage: gpc=1` HTTP header | Carried on every request; optional `gpc_scope` encodes partial opt-outs |
| **2. Agent protocol** | MCP `_meta` envelope (`gpc` + `purpose`) | Both the opt-out signal and the declared downstream purpose travel with every tool call |
| **3. Service boundary** | Ad platform HTTP endpoint | Mock pharmaceutical ad platform enforces purpose at the HTTP boundary, independent of the MCP layer |
| **4. Data layer** | `withPurposeCheck()` policy interceptor | Evaluates `gpc` × `purpose` × registry entry; blocks calls where the declared purpose is GPC-restricted |

**Result:** the patient always receives a complete, accurate answer. With GPC on, none of the downstream secondary pipelines execute: no analytics log entry, no training data, no interest profile update, no ad-platform vector store write.

---

## Key distinction from Architecture A

Architecture A's `withGpc()` performs a **binary tool block**: if a tool is GPC-sensitive, it is blocked entirely when `gpc=1`.

Architecture B's `withPurposeCheck()` evaluates a **purpose pair**: `gpc` + `purpose` (the declared downstream use). The same tool (`get_medical_records`) runs in all three scenarios — baseline, full GPC, and partial GPC — because its purpose in the primary task is `primary_task`, which is never restricted. Only the secondary-pipeline calls, each carrying a distinct purpose string, are evaluated individually.

---

## Opt-out categories depicted

Architecture B is a concrete implementation of **B2 (operation-level opt-out)** from the grouped opt-out taxonomy, and extends the propagation and protocol arguments from Category C.

### Category B: Purpose and Secondary Use

Architecture B demonstrates **B2 (operation-level opt-out)** directly. B2 distinguishes four operation types within a data pipeline: Collection, Processing, Inference, and Storage. Each secondary pipeline in this prototype maps to exactly one B2 layer, allowing a user to block, for example, inference and storage while permitting collection and processing.

**How it is demoed:** The purpose matrix from `compare_results.js` shows that `log_interaction` (Collection) executes in the partial-GPC run while `add_to_training_set` (Processing) is blocked — same tool category (secondary pipeline), different declared purpose, different outcome. This is the concrete evidence that opt-out is purpose-scoped, not tool-scoped.

**What it does not cover:** Phases 3+ (not yet implemented) will add C and D category purposes (`cross_context_sale`, `sensitive_data_inference`) to the registry.

### Category C: Propagation and Protocol

Architecture B surfaces a propagation finding distinct from Architecture A's signal-drop experiment. When `meta.purpose` is absent from a tool call, `withPurposeCheck()` treats it as maximally restricted. The **missing-purpose experiment** (Phase 2) runs every tool in the matrix with `gpc=1` but no `purpose` field, and shows that all calls — including the primary-task call to `get_medical_records` — are blocked with `reason: missing_purpose_field`.

This produces a two-failure-mode argument: a GPC-compliant system with no required `purpose` field must either block everything (breaking the primary task) or allow everything (ignoring the opt-out). The only sound resolution is to make `purpose` declaration a required field in MCP or any successor agent protocol.

---

## Pipeline diagrams

### Scripted pipeline (deterministic, used by tests)

```
Patient query --> Orchestrator (orchestrator/orchestrator.js)
                  |
                  |  reads baggage header -> gpc=1 [, gpc_scope=[...]]
                  |  builds baseMeta = { gpc: 1, ...gpc_scope }
                  |
                  |-- Primary task (sequential) ──────────────────────────────
                  |     get_medical_records(patient_id, _meta={gpc,purpose=primary_task})
                  |       `-> withPurposeCheck()   primary_task not restricted  [ok]
                  |     answer_question(question, context, _meta={gpc,purpose=primary_task})
                  |       `-> withPurposeCheck()   answer_question unrestricted  [ok]
                  |
                  `-- Secondary pipelines (parallel) ──────────────────────────
                        log_interaction         _meta={gpc,purpose=analytics}
                          `-> withPurposeCheck()  analytics restricted           [BLOCKED]
                        add_to_training_set     _meta={gpc,purpose=model_training}
                          `-> withPurposeCheck()  model_training restricted      [BLOCKED]
                        update_interest_profile _meta={gpc,purpose=personalization}
                          `-> withPurposeCheck()  personalization restricted     [BLOCKED]
                        ad_platform POST /target {gpc:1, purpose=ad_targeting}
                          `-> ad_platform.js      ad_targeting restricted        [BLOCKED]

Output: output/baseline_result.json / output/gpc_full_result.json / output/gpc_partial_result.json
```

### LLM pipeline — Phase 1 (Ollama-driven, model-agnostic enforcement)

```
Patient query --> LLM Orchestrator (orchestrator/llm_orchestrator.js)
                  |
                  |  runAgentLoop() -- model: qwen2.5:14b via Ollama
                  |  required tools: get_medical_records, answer_question
                  |
                  |-- Primary task: LLM-driven ─────────────────────────────────
                  |     model calls get_medical_records(patient_id)
                  |       harness injects purpose=primary_task from PURPOSE_MAP
                  |       `-> withPurposeCheck()   primary_task not restricted  [ok]
                  |     model calls answer_question(question, context)
                  |       harness injects purpose=primary_task from PURPOSE_MAP
                  |       `-> withPurposeCheck()   answer_question unrestricted  [ok]
                  |
                  `-- Secondary pipelines: scripted, purpose-injected ───────────
                        (same as scripted pipeline; model never touches secondary calls)

Key property: the model never sees or declares purpose. The harness maintains the
PURPOSE_MAP and injects it transparently. GPC enforcement is identical whether the
primary pipeline is driven by a model or by scripted code.

Output: output/llm_baseline_result.json / output/llm_gpc_result.json
```

### Missing-purpose experiment — Phase 2

```
Full tool matrix, three scenarios in one run:

  Scenario A: gpc=0, purpose declared    → all tools execute (no opt-out)

  Scenario B: gpc=1, purpose declared    → purpose-scoped enforcement
                get_medical_records  (primary_task)   [ok]
                answer_question      (primary_task)   [ok]
                log_interaction      (analytics)      [BLOCKED]
                add_to_training_set  (model_training) [BLOCKED]
                update_interest_profile (personalization) [BLOCKED]
                ad_platform          (ad_targeting)   [BLOCKED]

  Scenario C: gpc=1, purpose field DELIBERATELY OMITTED from every call
                get_medical_records  (no purpose)     [BLOCKED — missing_purpose_field]
                answer_question      (no purpose)     [BLOCKED — missing_purpose_field]
                log_interaction      (no purpose)     [BLOCKED — missing_purpose_field]
                add_to_training_set  (no purpose)     [BLOCKED — missing_purpose_field]
                update_interest_profile (no purpose)  [BLOCKED — missing_purpose_field]
                ad_platform          (no purpose)     [BLOCKED — missing_purpose_field]

Finding: Scenario C breaks the primary task. A GPC-compliant system cannot treat
missing purpose as unrestricted without violating the opt-out. Purpose declaration
must therefore be a required field in the protocol.

Output: output/missing_purpose_result.json
```

---

## The purpose matrix

The `compare_results.js` report produces a table of `tool × purpose × result` across all three scripted run modes:

| Tool | Purpose | B2 Layer | Baseline | GPC Full | GPC Partial |
|---|---|---|---|---|---|
| `get_medical_records` | `primary_task` | Primary | ✓ ok | ✓ ok | ✓ ok |
| `answer_question` | `primary_task` | Primary | ✓ ok | ✓ ok | ✓ ok |
| `log_interaction` | `analytics` | Collection | ✓ ok | ✗ BLOCKED | ✓ ok |
| `add_to_training_set` | `model_training` | Processing | ✓ ok | ✗ BLOCKED | ✗ BLOCKED |
| `update_interest_profile` | `personalization` | Inference | ✓ ok | ✗ BLOCKED | ✓ ok |
| `ad_platform` | `ad_targeting` | Storage | ✓ ok | ✗ BLOCKED | ✗ BLOCKED |

**The critical column is GPC Partial:** `log_interaction` executes while `add_to_training_set` is blocked. Same tool category, different declared purpose, different outcome. This is the empirical case for purpose-scoped opt-out.

## B2 operation layers

Each secondary pipeline maps to one of B2's four operation types:

| B2 Layer | Tool | What is blocked |
|---|---|---|
| Collection | `log_interaction` | Raw query never recorded in the analytics log |
| Processing | `add_to_training_set` | Collected data cannot be repurposed for model training |
| Inference | `update_interest_profile` | No behavioral profile derived from the session |
| Storage | `ad_platform` (vector DB write) | Derived interest data never reaches the ad store |

## Partial opt-out via `gpc_scope`

The W3C Baggage header carries an optional `gpc_scope` field: a pipe-delimited list of purposes the user has opted out of. The interceptor uses this list instead of the registry defaults when present:

```
baggage: gpc=1,gpc_scope=ad_targeting|model_training
```

If `gpc_scope` is absent and `gpc=1`, all `gpc_restricted_purposes` from the registry are blocked (full GPC).

---

## File map

```
architecture-b/
|-- orchestrator/
|   |-- orchestrator.js        Scripted orchestrator: dispatches primary + 4 secondary pipelines
|   |-- llm_orchestrator.js    LLM orchestrator (Phase 1): Ollama drives primary pipeline;
|   |                            harness injects purpose from PURPOSE_MAP; secondary scripted
|   |-- agent_loop.js          Shared LLM turn loop (tool_choice, nudge, required-tool tracking)
|   |-- baggage.js             W3C Baggage encode/decode; decodes gpc_scope for partial opt-outs
|   `-- mcp_client.js          In-process MCP client; applies withPurposeCheck() at each call
|
|-- agents/
|   `-- ad_platform.js         Mock pharmaceutical ad platform (Express); enforces purpose
|                                at the HTTP boundary — models B2 Storage layer
|
|-- mcp-server/
|   |-- server.js              MCP server entry point
|   |-- purpose_registry.js    withPurposeCheck() interceptor + tool → purpose registry (Layer 4)
|   `-- tool_handlers.js       Raw tool implementations; no GPC logic
|
|-- harness/
|   |-- run_baseline.js                    Scripted run: gpc=0
|   |-- run_gpc_full.js                    Scripted run: gpc=1, all secondary blocked
|   |-- run_gpc_partial.js                 Scripted run: gpc=1, scope=ad_targeting|model_training
|   |-- run_llm_gpc.js                     LLM run (Phase 1): baseline + full GPC back to back
|   |-- run_gpc_missing_purpose_harness.js Missing-purpose experiment (Phase 2): 3-scenario matrix
|   `-- compare_results.js                 Prints purpose matrix + B2 layer analysis
|
|-- tests/
|   |-- purpose_registry.test.js  Unit tests: registry structure, withPurposeCheck() logic
|   |-- interceptor.test.js       Integration tests through callTool()
|   `-- orchestrator.test.js      End-to-end scripted pipeline: baseline, full GPC, partial GPC
|
`-- output/           Gitignored; created at runtime
    |-- baseline_result.json
    |-- gpc_full_result.json
    |-- gpc_partial_result.json
    |-- llm_baseline_result.json
    |-- llm_gpc_result.json
    |-- missing_purpose_result.json
    |-- interaction_log.jsonl
    |-- interest_profiles.json
    |-- training_set.jsonl
    `-- ad_vector_store.json
```

---

## Setup

```bash
cd architecture-b
npm install
```

No keypair required — Architecture B does not use JWT signing. All enforcement is through `withPurposeCheck()` and the ad platform's HTTP boundary check.

---

## How to test

### Unit and integration tests (no model required)

```bash
npm test
```

Three test files cover the full scripted pipeline.

| Test file | What it covers |
|---|---|
| `purpose_registry.test.js` | Registry structure, `withPurposeCheck()` blocking, passthrough, missing purpose, partial opt-out, GPC signal formats |
| `interceptor.test.js` | End-to-end through `callTool()`: primary always executes, secondary blocked under full GPC, partial opt-out combinations, missing purpose field |
| `orchestrator.test.js` | Full scripted pipeline: baseline, full GPC, partial GPC, `gpc_active` flag, `gpc_scope` in result |

### Scripted demo (deterministic, no model required)

Runs baseline → full GPC → partial GPC → comparison report in one command:

```bash
npm run demo
```

Individual runs:

```bash
npm run baseline        # gpc=0 — all tools execute, data written to output/
npm run gpc-full        # gpc=1 — all secondary purposes blocked
npm run gpc-partial     # gpc=1, scope=ad_targeting|model_training — partial block
npm run compare         # Print purpose matrix from existing output files
```

Expected comparison table from `npm run compare`:

```
Tool                       │ Purpose            │ B2 Layer       │ Baseline     │ GPC Full     │ GPC Partial
get_medical_records        │ primary_task        │ Primary        │ ✓ ok         │ ✓ ok         │ ✓ ok
answer_question            │ primary_task        │ Primary        │ ✓ ok         │ ✓ ok         │ ✓ ok
log_interaction            │ analytics           │ Collection     │ ✓ ok         │ ✗ BLOCKED    │ ✓ ok
add_to_training_set        │ model_training      │ Processing     │ ✓ ok         │ ✗ BLOCKED    │ ✗ BLOCKED
update_interest_profile    │ personalization     │ Inference      │ ✓ ok         │ ✗ BLOCKED    │ ✓ ok
ad_platform                │ ad_targeting        │ Storage        │ ✓ ok         │ ✗ BLOCKED    │ ✗ BLOCKED
```

### Missing-purpose experiment — Phase 2

```bash
npm run missing-purpose
```

Runs all six tools under three scenarios and prints the comparison table with findings. All six calls in Scenario C (GPC on, no purpose) return `status: blocked, reason: missing_purpose_field`, including the primary-task tools.

### LLM demo — Phase 1 (requires Ollama)

```bash
# 1. Start Ollama (skip if desktop app is already running)
ollama serve

# 2. Pull the model once
ollama pull qwen2.5:14b

# 3. Run baseline + full GPC, print side-by-side report
npm run llm-gpc
```

Override the model:

```bash
OLLAMA_MODEL=llama3.1:70b npm run llm-gpc
```

---

## What the output files show

After running the scripted demo, `output/` contains:

| File | Baseline | GPC Full | GPC Partial |
|---|---|---|---|
| `interaction_log.jsonl` | entry appended | unchanged (Collection blocked) | entry appended (analytics allowed) |
| `training_set.jsonl` | entry appended | unchanged (Processing blocked) | unchanged (model_training in scope) |
| `interest_profiles.json` | profile updated | unchanged (Inference blocked) | profile updated (personalization allowed) |
| `ad_vector_store.json` | entry added | unchanged (Storage blocked) | unchanged (ad_targeting in scope) |
| `baseline_result.json` | all `status: ok` | n/a | n/a |
| `gpc_full_result.json` | n/a | secondary all `status: blocked` | n/a |
| `gpc_partial_result.json` | n/a | n/a | mixed: analytics/personalization `ok`, training/ad `blocked` |
| `missing_purpose_result.json` | n/a | n/a | Scenario C: all six tools `blocked` |
