# Architecture B: Purpose-Scoped GPC Enforcement Across a Multi-Stage AI Pipeline

## What it demonstrates

A patient asks an AI assistant: *"What does my blood pressure reading mean, and should I adjust my medication?"*

The assistant retrieves their records and answers the question. In a non-GPC world, that same interaction also silently feeds an analytics log, a model-training dataset, and a pharma ad-targeting platform — all AI-relevant downstream systems that the patient never directly interacted with. With GPC, each of those secondary data flows is independently gated by its declared purpose.

**The central claim:** GPC can govern a multi-stage AI pipeline, including pipeline stages that train or feed AI systems, without breaking the user-facing AI interaction.

### What Architecture B adds over Architecture A

Architecture A enforced GPC at the tool level (all-or-nothing per tool). Architecture B enforces at the **purpose level**: a single data-retrieval event fans out to multiple secondary uses, and the patient can opt out of specific downstream purposes (e.g., ad targeting) while allowing others (e.g., analytics), independently and without affecting the primary interaction.

---

## What is genuinely agentic vs. supporting infrastructure

This distinction matters for accurately representing the architecture.

**Agentic (LLM decision-making):**

- `lib/agentLoop.js` — an LLM (Ollama / `qwen2.5:14b`) drives the primary patient interaction. The model decides to call `get_medical_records`, with what arguments, and composes the final clinical answer. GPC has no effect on this step — the patient always gets a complete, accurate answer.

**AI/ML-relevant, but not agentic (deterministic supporting infrastructure):**

- `services/trainingDataset.js` — appends `(query, response)` pairs to a JSONL file that feeds a future fine-tuning job. The AI is downstream and offline; the pipeline step itself is a file write.
- `services/adPlatform.js` — writes to a vector store that in production would feed an embedding model and profiling/recommendation system. The `vector` field is a mock placeholder; in a real deployment this stage would invoke an embedding model. The enforcement point (purpose-based gating) is identical whether the downstream consumer is a mock or a real model.
- `services/analytics.js` — interaction logging. Not AI; included to show that non-AI secondary pipelines use the same gating mechanism.

**Why this framing matters:** the realistic picture of a multi-stage AI pipeline is one agentic component in the live request path, surrounded by data infrastructure that feeds or was produced by other AI systems (training jobs, embedding models, recommendation engines). GPC governing what AI-relevant systems a single interaction feeds is the more important and realistic privacy question. The patient cannot opt out of the training dataset they never knew existed — that is exactly the gap this demonstrates.

---

## Enforcement layers

| Layer | Mechanism | Where enforced |
|---|---|---|
| **1. Transport** | `Sec-GPC: 1` header or `gpc` in request body | `buildPrivacyContext()` in `services/medicalAssistant.js` |
| **2. Agent protocol** | `_meta = {gpc, gpc_scope, purpose}` attached to every tool call | `lib/agentLoop.js` — forwarded alongside `get_medical_records` |
| **3. Trust boundary** | `evaluatePurpose()` at the ad platform's HTTP endpoint | `services/adPlatform.js` — independent enforcement before any write |
| **4. Data layer** | `withPurposeCheck()` wraps every secondary-purpose side effect | `services/analytics.js`, `services/trainingDataset.js` |

### Partial opt-out via gpc_scope

Standard GPC is binary. Architecture B adds an optional `gpc_scope` array that limits the opt-out to specific purposes:

```json
{ "gpc": 1, "gpc_scope": ["ad_targeting"] }
```

This blocks only the ad platform while analytics and training proceed. Each pipeline is evaluated independently with the same `privacyContext`.

---

## Pipeline

```
POST /ask  { patient_id, query, gpc, gpc_scope }
  │
  ▼  Layer 1: privacyContext = { gpc, gpc_scope }
services/medicalAssistant.js
  │
  ▼
lib/agentLoop.js — runAgentLoop()
  │
  │  LLM (Ollama / qwen2.5:14b) ← agentic
  │    calls get_medical_records({ patient_id })
  │    _meta = { gpc, gpc_scope, purpose: 'patient_response' }  ← Layer 2
  │    get_medical_records ALWAYS runs — not GPC-gated
  │    model composes final clinical answer
  │
  ▼  PRIMARY RESPONSE RETURNED (unaffected by GPC)
  │
  ▼  fanOutSecondaryPurposes() — deterministic, runs after primary
  │
  ├──▶ logInteraction()       withPurposeCheck (purpose: analytics)       ← Layer 4
  │      ok → analytics_log.json written
  │      blocked → no write
  │
  ├──▶ addTrainingExample()   withPurposeCheck (purpose: model_training)  ← Layer 4
  │      ok → training_dataset.jsonl appended
  │      blocked → no write
  │
  └──▶ POST /target           evaluatePurpose() at HTTP boundary          ← Layer 3
         (ad platform)
         ok → ad_vector_store.json written
         blocked → no write
```

---

## Three scenarios

```
Scenario              │ primary answer │ analytics │ model_training │ ad_targeting
──────────────────────┼────────────────┼───────────┼────────────────┼─────────────
No GPC                │ ✓ ok           │ ✓ ok      │ ✓ ok           │ ✓ ok
Full opt-out (gpc=1)  │ ✓ ok           │ ✗ blocked │ ✗ blocked      │ ✗ blocked
Partial (ad only)     │ ✓ ok           │ ✓ ok      │ ✓ ok           │ ✗ blocked
```

The primary answer is identical in all three cases.

---

## File map

```
architecture-b/
├── lib/
│   ├── withPurposeCheck.js   Layer 4: evaluatePurpose() (pure fn) + withPurposeCheck() wrapper
│   ├── purposeRegistry.js    PRIMARY_PURPOSE vs RESTRICTABLE_PURPOSES
│   └── agentLoop.js          LLM turn loop (Ollama) + fanOutSecondaryPurposes()
│
├── services/
│   ├── medicalAssistant.js   HTTP entry point — Layer 1 (reads Sec-GPC / body gpc)
│   ├── medicalRecords.js     get_medical_records — primary tool, never GPC-gated
│   ├── analytics.js          logInteraction — wrapped with withPurposeCheck
│   ├── trainingDataset.js    addTrainingExample — wrapped with withPurposeCheck
│   └── adPlatform.js         Ad platform HTTP server — Layer 3 boundary enforcement
│
├── tests/
│   ├── withPurposeCheck.test.js  Unit tests: evaluatePurpose + wrapper (pure, no I/O)
│   └── fanOut.test.js            Integration tests: all three scenarios, real services
│
├── demo.js                   Runs all three scenarios without Ollama
└── output/                   Runtime; gitignored
    ├── analytics_log.json
    ├── training_dataset.jsonl
    └── ad_vector_store.json
```

---

## Setup

```bash
cd architecture-b
npm install
```

---

## How to test

### Unit and integration tests (no model required)

```bash
npm test
```

33 tests across two files. No Ollama needed.

| Test file | What it covers |
|---|---|
| `withPurposeCheck.test.js` | `evaluatePurpose()`: all GPC states, partial opt-out, missing purpose, primary purpose passthrough; `withPurposeCheck()` wrapper: ok/blocked envelopes, fn call gating |
| `fanOut.test.js` | `fanOutSecondaryPurposes()`: all three scenarios end-to-end with real services and a live ad platform; file assertions confirming writes are blocked or allowed correctly |

### Demo (no model required)

Runs all three scenarios in sequence and prints outcomes and final on-disk state:

```bash
npm run demo
```

### Full pipeline with LLM (requires Ollama)

```bash
# Start Ollama (skip if desktop app is running)
ollama serve
ollama pull qwen2.5:14b

# Start the ad platform and the assistant
node services/adPlatform.js &
node services/medicalAssistant.js

# No GPC
curl -s -X POST http://localhost:4001/ask \
  -H 'Content-Type: application/json' \
  -d '{"patient_id":"patient-001","query":"What does my blood pressure mean?"}' \
  | jq '{response, secondaryEffects}'

# Full opt-out
curl -s -X POST http://localhost:4001/ask \
  -H 'Content-Type: application/json' \
  -d '{"patient_id":"patient-001","query":"What does my blood pressure mean?","gpc":1}' \
  | jq '{response, secondaryEffects}'

# Partial opt-out — block ad targeting only
curl -s -X POST http://localhost:4001/ask \
  -H 'Content-Type: application/json' \
  -d '{"patient_id":"patient-001","query":"What does my blood pressure mean?","gpc":1,"gpc_scope":["ad_targeting"]}' \
  | jq '{response, secondaryEffects}'
```
