# Architecture B — Purpose-Based GPC Enforcement

**Scenario:** A patient consults a medical assistant. The assistant retrieves their health records and answers their query. In the background, the same session data could feed an analytics log, a model training dataset, and a pharmaceutical ad-targeting pipeline. GPC enforcement here is not about blocking the retrieval tool — it is about blocking the *purposes* for which its output travels downstream.

## Key distinction from Architecture A

Architecture A's `withGpc()` performs a binary block: if a tool is GPC-sensitive, it is blocked entirely when `gpc=1`.

Architecture B's `withPurposeCheck()` evaluates a *combination*: `gpc` + `purpose` (the declared downstream use). `get_medical_records` runs in all three modes — only the purposes attached to secondary pipelines are blocked.

## File structure

```
mcp-server/
  purpose_registry.js   — source of truth: tool → declared_purposes + gpc_restricted_purposes
  tool_handlers.js      — raw tool implementations (no GPC logic)
  server.js             — MCP server, wraps handlers with withPurposeCheck()

orchestrator/
  baggage.js            — W3C Baggage helpers; also decodes gpc_scope for partial opt-outs
  mcp_client.js         — in-process client that applies the same interceptors
  orchestrator.js       — dispatches primary task + four secondary pipelines in parallel

agents/
  ad_platform.js        — mock pharmaceutical ad platform (Express); enforces purpose at
                          the HTTP boundary — models the B2 Storage layer

harness/
  run_baseline.js       — gpc=0; all pipelines execute
  run_gpc_full.js       — gpc=1, no scope; all secondary purposes blocked
  run_gpc_partial.js    — gpc=1, scope=ad_targeting|model_training; partial block
  compare_results.js    — prints the purpose matrix + B2 layer analysis

tests/
  purpose_registry.test.js — unit tests for registry structure and withPurposeCheck logic
  interceptor.test.js      — integration tests through callTool()
  orchestrator.test.js     — end-to-end orchestrator tests with live ad platform stub
```

## Running

```bash
npm install

# Individual runs
npm run baseline
npm run gpc-full
npm run gpc-partial

# Full demo + matrix report
npm run demo

# Tests
npm test
```

## The Purpose Matrix

The `compare_results.js` report produces a table of `tool × purpose × result` across all three run modes:

| Tool | Purpose | B2 Layer | Baseline | GPC Full | GPC Partial |
|---|---|---|---|---|---|
| get_medical_records | primary_task | Primary | ✓ ok | ✓ ok | ✓ ok |
| answer_question | primary_task | Primary | ✓ ok | ✓ ok | ✓ ok |
| log_interaction | analytics | Collection | ✓ ok | ✗ BLOCKED | ✓ ok |
| add_to_training_set | model_training | Processing | ✓ ok | ✗ BLOCKED | ✗ BLOCKED |
| update_interest_profile | personalization | Inference | ✓ ok | ✗ BLOCKED | ✓ ok |
| ad_platform | ad_targeting | Storage | ✓ ok | ✗ BLOCKED | ✗ BLOCKED |

**The critical column is GPC Partial:** `log_interaction` executes while `add_to_training_set` is blocked. Same tool category (secondary pipeline), different declared purpose, different outcome. This makes the argument that opt-out is purpose-scoped rather than tool-scoped.

## B2 Operation Layers

Each secondary pipeline maps to one of B2's four operation types:

| Layer | Tool | What is blocked |
|---|---|---|
| Collection | `log_interaction` | Raw query never recorded in the analytics log |
| Processing | `add_to_training_set` | Collected data cannot be repurposed for model training |
| Inference | `update_interest_profile` | No behavioral profile derived from the session |
| Storage | `ad_platform` (vector DB write) | Derived interest data never reaches the ad store |

## Partial opt-out via gpc_scope

The W3C Baggage header carries an optional `gpc_scope` field: a pipe-delimited list of purposes the user has opted out of. The interceptor uses this list instead of the registry defaults:

```
baggage: gpc=1,gpc_scope=ad_targeting|model_training
```

If `gpc_scope` is absent and `gpc=1`, all `gpc_restricted_purposes` from the registry are blocked (full GPC).

## Missing purpose field

If a tool call omits `meta.purpose` entirely, `withPurposeCheck()` treats it as maximally restricted and returns:

```json
{ "status": "blocked", "reason": "missing_purpose_field" }
```

This motivates purpose declaration as a required field in any agent protocol specification.
