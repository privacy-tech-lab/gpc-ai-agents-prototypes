# Prototype 6: Collection Gate

## What it demonstrates

A user asks an AI writing assistant to polish one email to their manager about a raise. The draft mentions rising doctor visits. While composing it, the user deleted a sentence about treatment costs before submitting, paused 42 seconds over the salary line, and rewrote the opening three times.

Three different things about that user are now available to the platform, and they are not the same kind of thing. The draft is what the user *knowingly submitted*. The deletion, the pause, and the rewrites are what they *unknowingly generated*. The health condition and the negotiation anxiety a classifier reads out of both are what the system *concluded on its own*. Existing privacy language reaches the first and struggles with the second and third: nothing was sold, and the most revealing sentence was never even sent.

Prototype 6 puts a gate at each of the three boundaries. The task is never gated: the polished email is returned identically in every mode. What changes is what the platform keeps.

| Mechanism | Where | What it does |
|---|---|---|
| **Session fixture** | `session_fixture.js` | One synthetic session: instruction, draft text, and three telemetry events. Static, so runs stay deterministic. |
| **Inference classifier** | `inference_classifier.js`, served over MCP | Maps the draft to `polished_email`, `inferred_attributes`, and `attribute_sources`, which labels each attribute `input` or `behavior`. |
| **Collection stores** | `stores.js` | Three in-memory stores: `inputLog` (input), `behaviorLog` (behavior), `derivedProfile` (derived). Each tracks `blocked_count`. Fresh per run, never persisted. |
| **Collection gate** | `collection_gate.js` | `collectInput()`, `collectBehavior()`, `deriveProfile()`. Each checks the active preference set and either records or suppresses, noting what it would have kept. |
| **Scope resolution** | `collection_gate.js` → `resolveOptouts()` | A bare GPC signal asserts all three scopes (`input`, `behavior`, `derived`). A `--scope` list asserts exactly that subset, so each scope stays independently assertable. |

**Result:** the polished email is byte-identical in every mode. Without privacy preferences, one email leaves a stored draft, three telemetry events, and four profile attributes, two of them derived from a sentence the user chose not to send. With all three preferences asserted, all three stores are empty and every suppression is recorded.

---

## Preference scopes

The prototype covers three preferences: the **input collection preference** (`input`, what the user submits), the **metadata collection preference** (`behavior`, what the user unknowingly produces), and the **inference preference** (`derived`, what the system concludes). The two collection preferences are distinguished by the user's relationship to the data. Inference is a use of data already collected. Each preference is assertable on its own.

As in Prototype 5, the inference preference is enforced at the storage boundary. The classifier still runs and the inference is still computed, which is what `would_have_written` reports, but nothing is written to the profile.

| | No preference | `--scope=input` | `--scope=behavior` | `--scope=derived` | `--gpc` |
|---|---|---|---|---|---|
| Email polished and returned | yes | yes | yes | yes | yes |
| Draft retained | yes | no | yes | yes | no |
| Telemetry recorded | 3 events | 3 events | no | 3 events | no |
| Attributes written | 4 | 4 | 4 | no | no |

```mermaid
flowchart TD
    S["User submits draft + instruction"] --> IN{"input collection preference?"}
    IN -- "no" --> L1["inputLog.store()\nraw draft retained"]
    IN -- "yes" --> DIN["discarded after the task\nwould_have_stored recorded"]
    L1 --> T["Composition telemetry:\ndeleted sentence, 42s pause, 3 rewrites"]
    DIN --> T
    T --> BH{"metadata collection preference?"}
    BH -- "no" --> L2["behaviorLog.store()\n3 events recorded"]
    BH -- "yes" --> DBH["suppressed\nwould_have_recorded recorded"]
    L2 --> MC["mcp_client.js ⇄ stdio ⇄\nmcp-server/server.js\nclassify_draft(draft_id)"]
    DBH --> MC
    MC --> CL["{ polished_email, inferred_attributes,\nattribute_sources }"]
    CL --> DV{"inference preference?"}
    DV -- "no" --> W["derivedProfile.write()\n4 attributes, 2 behavior-sourced"]
    DV -- "yes" --> FW["blocked: profile_write_gate\nwould_have_written recorded"]
    W --> ANS["Polished email returned\n(identical in every mode)"]
    FW --> ANS

    classDef enforced fill:#5b8def,stroke:#2f5fce,color:#fff
    class DIN,DBH,FW enforced
```

---

## Protocol compliance

- **MCP.** `inference_classifier.js`'s classify step is served by `mcp-server/server.js`, a real `@modelcontextprotocol/sdk` `Server` over stdio, reached by `mcp_client.js`, a real `Client` that spawns it as a child process. The collection gate and the three stores stay client-side in `orchestrator.js` / `agent.js`: that decision accumulates state across a whole session (one submission, three telemetry events, and one derivation sharing one set of stores), and the existing unit tests exercise that state directly, so moving it server-side would mean redesigning session identity rather than adding real protocol compliance. Classification is the one piece that is stateless and is genuinely a tool the platform calls.
- **A2A.** Not applicable. There is a single agent here. The gate, the stores, and the classifier are internal platform mechanics, not a second agent to hand off to.

---

## What one email reveals

| Attribute | Value | Source | Where it came from |
|---|---|---|---|
| `health_flags` | `[ongoing_medical_treatment]` | input | the draft mentions doctor visits |
| `financial_pressure` | `true` | input | the draft asks about salary |
| `undisclosed_health_severity` | `true` | behavior | the deleted sentence about treatment costs |
| `negotiation_anxiety` | `true` | behavior | the 42-second pause and three rewrites |

Half of what the platform learns comes from material the user never submitted. `attribute_sources` labels each one, which is what makes the three-way split visible rather than theoretical: asserting the input and behavior preferences stops the *retention* of the raw material, but the derivation can still run off transient task data in a single pass. That is why the derived preference exists on its own.

---

## Pipeline

### No privacy preferences (the failure case)

```
submission
  → collection_gate.collectInput()      inputLog.store()      draft retained
  → collection_gate.collectBehavior() × 3  behaviorLog.store()   telemetry recorded
  → mcp_client.js ⇄ stdio ⇄ mcp-server/server.js: classify_draft(draft_id)
      → collection_gate.deriveProfile()  derivedProfile.write()  4 attributes
  → polished email returned
```

### All preferences asserted (`--gpc`)

```
submission
  → collection_gate.collectInput()      discarded, blocked_count++   would_have_stored
  → collection_gate.collectBehavior() × 3  suppressed, blocked_count++  would_have_recorded
  → mcp_client.js ⇄ stdio ⇄ mcp-server/server.js: classify_draft(draft_id)
      → collection_gate.deriveProfile()  NOT written, blocked_count++  would_have_written
  → polished email returned  (identical)
```

The classifier runs in both modes because it produces the task output as well as the inference. The gate does not stop the classifier; it stops the writes.

## File map

```
prototype-6/
├── session_fixture.js       One session: instruction, draft, 3 telemetry events
├── inference_classifier.js  Draft → polished_email + inferred_attributes + attribute_sources
├── mcp_client.js            Real MCP client (stdio) — spawns mcp-server/server.js
├── stores.js                createStores(); inputLog, behaviorLog, derivedProfile
├── collection_gate.js       resolveOptouts(); collectInput / collectBehavior / deriveProfile
│
├── mcp-server/
│   └── server.js            MCP server entry point (real @modelcontextprotocol/sdk Server, stdio);
│                            exposes classify_draft, thin wrapper around inference_classifier.js
│
│  Deterministic core (no model — what the tests run):
├── orchestrator.js          run({gpc, scope}): walks all three boundaries in order
├── run_baseline.js          No privacy preferences — all three stores fill
├── run_optout.js            --gpc or --scope=input,behavior,derived
│
│  LLM agent path (requires Ollama):
├── agent_loop.js            Shared LLM turn loop (thin wrapper over core/agent_loop.js)
├── agent.js                 read_draft tool (the input boundary); runSession()
├── run_agent.js             Live demo: a model writes the email, the platform collects around it
├── package.json
│
└── tests/
    ├── stores.test.js                Log and profile store semantics, deep-copy isolation
    ├── inference_classifier.test.js  classify() output, source labeling, table isolation
    ├── collection_gate.test.js       Each scope, scope resolution, scope independence
    ├── orchestrator.test.js          Full sessions in every mode (over real MCP)
    └── agent.test.js                 read_draft boundary; the model sees task material only
```

---

## Setup

No API keys. The classifier is a static table and the pipeline is deterministic. Node.js 18+.

```bash
cd prototype-6
npm install
```

---

## How to test

### Unit and integration tests

```bash
npm test
```

50 tests across five files. No model needed: the agent's enforcement seam (`makeExecutor`) is tested directly, so the gate is verified without Ollama. `orchestrator.test.js` exercises the real MCP transport and closes the child process in `afterAll`.

| Test file | What it covers |
|---|---|
| `stores.test.js` | Log store append and blocked counting; profile store scalar overwrite and array merge-without-duplicates; snapshot isolation; store independence |
| `inference_classifier.test.js` | `classify()` returns task output plus attributes; every attribute has a declared source; behavior-sourced attributes identified; deep copies isolate the static table |
| `collection_gate.test.js` | `resolveOptouts()` for GPC and scope lists; input store versus discard; behavior record versus suppress; derived write versus block; scope independence, including that input and behavior together do not stop derived |
| `orchestrator.test.js` | Full five-stage session for baseline, `--gpc`, and each single scope; blocked counts; task output identical to baseline |
| `agent.test.js` | `read_draft` fires the input checkpoint; task material still flows to the model under the input preference; the model sees only instruction and draft, never telemetry or stores; unknown tools refused |

### Demo runs (deterministic, no model)

```bash
npm run baseline         # no preferences: 1 draft, 3 events, 4 attributes
npm run optout:full      # --gpc: all three stores empty
npm run optout:input     # draft discarded; telemetry and profile still collected
npm run optout:behavior  # telemetry suppressed; draft and profile still collected
npm run optout:derived   # profile empty; draft and telemetry still collected
npm run demo             # all of the above in sequence
```

### Run as a real agent (requires Ollama)

A live model writes the polished email itself. The platform collects around the session: the input checkpoint fires when the draft crosses the `read_draft` tool boundary, then the behavior and derived checkpoints run after the model finishes. The model never sees the telemetry or the stores, so it cannot route around the gate.

```bash
ollama serve                 # start Ollama if it isn't running
ollama pull qwen2.5:14b      # once; override with OLLAMA_MODEL

npm run agent          # no preferences
npm run agent:gpc      # all three preferences asserted
npm run agent:derived  # profile write gate only
```

---

## What the output shows

Each run prints a JSON object followed by a short summary.

| Field | What it records |
|---|---|
| `optouts` | The resolved active preference set |
| `task_output` | The polished email, identical in every mode |
| `stages` | Per checkpoint: `stage` (`input` / `behavior` / `derived`), `status`, and either what was kept or `would_have_stored` / `would_have_recorded` / `would_have_written` |
| `stores_snapshot.input_log` | Retained submissions and `blocked_count` |
| `stores_snapshot.behavior_log` | Recorded telemetry events and `blocked_count` |
| `stores_snapshot.derived_profile` | Written attributes, `attribute_count`, and `blocked_count` |

The `would_have_*` fields are the audit trail: under a privacy preference they record exactly what the system intended to keep, so the suppression is visible rather than silent.

---

## How it differs from Prototype 5

Prototype 5 covers the inference preference alone, with a session of eight search queries. This prototype covers input collection, metadata collection, and inference in one interaction.

| | Prototype 5 | Prototype 6 |
|---|---|---|
| Preferences covered | inference | input collection, metadata collection, inference |
| Scenario | 8 search queries | 1 email polished |
| Source of the inference | query text (input only) | submitted text *and* passive behavior, labeled per attribute |
| Partial assertion | not modeled | `--scope=input,behavior,derived`, any subset |
| What the user never sent | not modeled | a deleted sentence drives two of the four attributes |
