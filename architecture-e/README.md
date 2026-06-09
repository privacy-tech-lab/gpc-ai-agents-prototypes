# Architecture E — Inference Firewall

**GPC Category:** B3 — Derived-Collection Opt-Out  
**Pattern:** Intercept inference before attributes are written to the shadow profile  
**Stack:** Node.js · Jest · Deterministic classifier (no LLM dependency)

---

## What It Demonstrates

Every time you search for something, the text of your query can be fed through a
classifier that infers personal attributes — health conditions, financial situation,
employment status, housing circumstances — without you ever disclosing them
explicitly.  This process is called *derived collection*, and it is one of the
hardest GPC-adjacent harms to prevent because:

1. The answer is still useful (you still want to know about medication side effects).
2. The inference happens server-side — the user never sees it.
3. Standard consent flows only gate *first-party* data, not derived profiles.

Architecture E implements a **GPC B3 firewall** that sits between the query
classifier and the profile store.  When the B3 signal is on, inference is
intercepted at the boundary: the answer reaches the user, but no attributes are
ever written.  When B3 is off, the same pipeline silently builds a detailed
shadow profile from eight ordinary search queries.

---

## GPC Category B3 — Derived-Collection Opt-Out

| | B3 Off (baseline) | B3 On (enforced) |
|---|---|---|
| Query answered? | ✓ Yes | ✓ Yes |
| Attributes written to profile? | ✓ Yes | ✗ No |
| Shadow profile at session end | 11 attributes | 0 attributes |
| Inference attempts blocked | 0 | 8 |

The key insight: **B3 does not degrade the user experience**.  The canned answer
is delivered regardless of signal state.  The only difference is whether the
system gets to *keep* what it inferred.

---

## Eight Queries and What They Reveal

| Query | Inferred Attributes |
|---|---|
| What are the side effects of metformin? | `health_flags: [possible_diabetes]`, `medical_interest: true` |
| How do I negotiate a lower rent? | `housing_situation: renting`, `financial_pressure: true` |
| What is the average cost of a hearing aid? | `health_flags: [possible_hearing_loss]`, `age_indicator: older` |
| How do I apply for SNAP benefits? | `income_bracket: low`, `benefit_eligible: true` |
| What are low-sodium meal ideas? | `dietary_restriction: low_sodium`, `health_flags: [cardiovascular_concern]` |
| How do I dispute a medical bill? | `healthcare_access: strained`, `financial_pressure: true` |
| What are signs of anxiety? | `mental_health_flags: [possible_anxiety]` |
| What is a good entry-level resume template? | `employment_status: job_seeking` |

None of these queries require the user to disclose personal information.
Together they paint a detailed demographic and health picture.

---

## Pipeline Diagram

### B3 Off (Baseline — failure case)

```
User query
    │
    ▼
query_classifier.classify()
    │
    │  { inferred_attributes, answer }
    ▼
inference_engine.derive()
    │
    │  writes attributes to profile store
    ▼
profile_store.write()        ← shadow profile grows
    │
    ▼
{ status: 'derived', attributes, answer }
```

### B3 On (Firewall — success case)

```
User query
    │
    ▼
query_classifier.classify()
    │
    │  { inferred_attributes, answer }
    ▼
inference_firewall.block()   ← intercepted here
    │
    │  increments blocked_count
    │  does NOT call profile_store.write()
    ▼
{ status: 'blocked', reason: 'b3_inference_firewall',
  would_have_written: {...}, answer }
```

---

## Capability Timeline

| Phase | Tool | Status | Profile Impact |
|---|---|---|---|
| B3 off | query_classifier | executed | — |
| B3 off | inference_engine | derived | **attributes written** |
| B3 off | profile_store | written | **shadow profile grows** |
| B3 on | query_classifier | executed | — |
| B3 on | inference_firewall | blocked | **zero attributes written** |
| B3 on | profile_store | untouched | **profile stays empty** |

---

## File Map

```
architecture-e/
├── query_classifier.js    — maps 8 queries to inferred attributes + canned answer
├── profile_store.js       — createProfileStore() factory, tracks attributes + blocked_count
├── inference_engine.js    — derive(): writes classified attributes to profile store
├── inference_firewall.js  — block(): intercepts derive, records would_have_written
├── orchestrator.js        — run(b3): processes all 8 queries in sequence
├── run_baseline.js        — B3 off: shadow profile accumulates
├── run_b3.js              — B3 on: inference blocked, profile stays empty
├── package.json
└── tests/
    ├── query_classifier.test.js    — 22 tests
    ├── profile_store.test.js       — 22 tests
    ├── inference_firewall.test.js  — 27 tests
    └── orchestrator.test.js        — 16 tests
```

---

## Setup

```bash
cd architecture-e
npm install
```

No API keys needed — the classifier is a static lookup table and the pipeline
is fully deterministic.

---

## How to Run

```bash
# Baseline — shadow profile accumulates (B3 off)
npm run baseline

# Enforced — inference blocked, profile stays empty (B3 on)
npm run b3

# Both in sequence
npm run demo
```

---

## How to Test

```bash
npm test
```

All 87 tests pass.  `--runInBand` is not required here (no shared on-disk state),
but the flag is harmless if you run from the root workspace.

---

## Output Description

Both run scripts produce a JSON blob followed by a human-readable summary.

### Baseline output structure

```jsonc
{
  "b3_active": false,
  "mode": "baseline",
  "query_results": [
    {
      "status": "derived",
      "query": "What are the side effects of metformin?",
      "attributes": { "health_flags": ["possible_diabetes"], "medical_interest": true },
      "answer": "Common side effects of metformin include..."
    }
    // ... 7 more
  ],
  "shadow_profile": {
    "attributes": {
      "health_flags": ["possible_diabetes", "possible_hearing_loss", "cardiovascular_concern"],
      "medical_interest": true,
      "housing_situation": "renting",
      "financial_pressure": true,
      "age_indicator": "older",
      "income_bracket": "low",
      "benefit_eligible": true,
      "dietary_restriction": "low_sodium",
      "healthcare_access": "strained",
      "mental_health_flags": ["possible_anxiety"],
      "employment_status": "job_seeking"
    },
    "blocked_count": 0
  },
  "profile_attribute_count": 11,
  "inference_blocked_count": 0
}
```

### B3-enforced output structure

```jsonc
{
  "b3_active": true,
  "mode": "b3_enforced",
  "query_results": [
    {
      "status": "blocked",
      "reason": "b3_inference_firewall",
      "query": "What are the side effects of metformin?",
      "would_have_written": { "health_flags": ["possible_diabetes"], "medical_interest": true },
      "answer": "Common side effects of metformin include..."
    }
    // ... 7 more
  ],
  "shadow_profile": { "attributes": {}, "blocked_count": 8 },
  "profile_attribute_count": 0,
  "inference_blocked_count": 8
}
```

`would_have_written` is the audit trail — it records exactly what the system
*intended* to infer, surfaced transparently for the user's inspection.

---

## How It Differs from Architecture C

| | Architecture C | Architecture E |
|---|---|---|
| GPC category | A1 / A2 (opt-in only) | B3 (derived-collection opt-out) |
| What is gated? | Tool *execution* | Attribute *writing* |
| User prompt involved? | Yes — consent prompt fires for new tools | No — B3 is a signal, not a dialogue |
| Profile / manifest | Consent manifest on disk | In-memory profile store per session |
| New tools need consent? | Yes, per category | N/A — inference is the gated action |
| Answer suppressed by signal? | Sometimes (tool is quarantined) | Never — answer always delivered |
