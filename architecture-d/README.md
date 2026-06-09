# Architecture D: Fanout and Provider Aggregation Surface

## What it demonstrates

A user with GPC enabled asks an AI assistant to *"research the iPhone 17 across tech publishers and summarise the key consensus points."* The agent fans out to eight publishers in parallel. Every site receives the request, every strict publisher honors the GPC signal correctly (no logging, no profile write), and the user receives a summarised answer either way.

The structural finding falls out of running the prototype: even when every site enforces GPC perfectly per-call, the **LLM provider sits at a chokepoint that observes every outbound call from every user.** From a single session it can derive what the user is researching, which publishers they reached, and the GPC state of every call. Across sessions it can derive GPC adoption rates, topic-by-GPC matrices, and per-user interest profiles. None of these derivations are possible for any browser intermediary in the pre-agent world.

Architecture D introduces a **provider middleware** (`provider.js`) that sits between the orchestrator and the publishers. Every fanout flows through it. The provider logs each observation before forwarding, optionally strips the `_meta` envelope (the threat-model demonstration), and optionally applies data-handling commitments before recording.

**Result:** in baseline mode every site logs and writes a profile entry. In GPC mode the strict sites suppress both, but the provider observation log is substantively identical to baseline. In mitigated mode the provider applies data-handling commitments (`no_train`, `k`-anonymity, DP noise) — these do not change what the provider can see; they constrain what it does with what it sees. In signal-drop mode the provider acts as adversary and strips `_meta` before forwarding, surfacing the property that a hostile provider can silently nullify enforcement at every destination while retaining full visibility itself.

---

## GPC categories depicted

Architecture D is a concrete implementation of a new pair of categories from the aggregation surface taxonomy: **E1 (provider as a structural new privacy boundary)** and **E2 (provider-side data-handling commitments)**. Categories A, B, C, D from Architectures A / B / C all address what happens at sites, in tools, or across sessions. Category E addresses what happens at the new intermediary that did not exist in the browser model.

### Category E1: Provider as a structural new privacy boundary

The core E1 claim is that per-call GPC enforcement at sites does not bound provider-side visibility. In the browser model, no single party sees the cumulative GPC traffic of a single user across destinations. In the agent model, the provider does — by design, because the agent's reasoning runs there.

**How it is demonstrated:** `run_baseline.js` and `run_gpc.js` use identical user queries and identical fanout targets, differing only in `_meta.gpc`. The `site_level_view` field changes between the two runs — strict publishers move from `logged: true` to `logged: false`. The `provider_view` does not. Every field the provider needs to compute aggregate derivations (`user_id`, `query`, `query_topic`, `fanout_targets`, `meta_received`) is captured identically in both runs. The structural invariant is asserted in `tests/provider.test.js → "structural invariant: provider view unchanged by GPC state"`.

`run_aggregate.js` extends the same point across users. It runs an 80-user simulation with mixed GPC state through the provider middleware and reports four derivations no browser-era intermediary could compute:

| Derivation | What it reveals |
|---|---|
| `measured_gpc_adoption_rate` | Per-population fraction of users with GPC on |
| `topic_distribution` | What the user base is collectively researching |
| `topic_by_gpc` | Topic preferences stratified by GPC state |
| `publisher_reach` | Per-publisher attention across the user base |

The simulation is deterministic (seeded `mulberry32`) so the figures are reproducible.

**What it does not cover:** E1 is a visibility claim, not a use claim. The protocol-level fact that the provider can derive these things does not by itself constitute a violation — that is what E2 attempts to address.

### Category E2: Provider-side data-handling commitments

E2 holds that since the visibility is structural and cannot be designed away at the protocol, the spec's only lever is to constrain how the provider records and what it derives. Three concrete commitments are implemented in `mitigations.js`:

| Commitment | Mechanism | Effect on the log |
|---|---|---|
| `noTrainCommitment()` | Tag every observation with `do_not_train: true` | Advisory tag; unverifiable from outside |
| `kAnonymity(k)` | Suppress `user_id` until the topic cohort reaches size `k` | `user_id: '<suppressed>'` with `k_anon_suppressed: true` |
| `dpNoise(epsilon)` | Laplace noise on published aggregates | Per-observation passthrough; `noise()` invoked at aggregation time |

These compose with `chain(...)`. `run_mitigated.js` exercises the full chain.

**How it is demonstrated:** Compare `run_gpc.js` against `run_mitigated.js`. `provider_view` in the mitigated run includes the `do_not_train`, `k_anon_suppressed`, and `cohort_size` fields. `inferUserInterests()` honors `k_anon_suppressed` and returns an empty interest profile for any user below the cohort threshold.

**What it does not cover:** E2 is the available lever, not a guarantee. The commitments are advisory and unverifiable at the protocol layer — the user has no way to confirm `do_not_train` was honored or that DP noise was correctly calibrated. Establishing protocol-level verification (attestations, audited logs, third-party witnesses) is out of scope here and likely belongs in a future Architecture E or in the GNAP / verifiable-credentials work referenced in the pre-charter taxonomy.

### GPC signal integration

The signal travels in the `_meta` envelope (`_meta.gpc: 0|1`), matching the convention used in Architectures A and B. The orchestrator does not call sites directly; it calls `provider.fanout(user_id, query, site_ids, _meta)`, which forwards to each site in parallel.

```
Orchestrator                Provider                    Sites (8x)
   |                          |                           |
   |--fanout(query, _meta)--->|                           |
   |                          |  log observation          |
   |                          |  apply mitigations        |
   |                          |                           |
   |                          |--mitm? strip _meta-+      |
   |                          |                    |      |
   |                          |--meta_forwarded -->|----->| querySite(id, q, meta)
   |                          |                    |----->| ...
   |                          |                    |----->| (8 sites in parallel)
   |                          |                           |
   |<---site_results, log_id--|                           |
```

The signal-drop experiment exercises the threat model: when the provider's `mitm` flag is on, `meta_forwarded` is `{}` even though `meta_received` retains the user's original GPC=1. Sites cannot tell the strip happened. The user cannot tell from the response. Only the provider knows.

---

## Pipeline diagrams

### baseline — GPC off

```
run_baseline.js
  |
  `--> fanoutAll(provider, 'user-1', 'iPhone 17 review summary', { gpc: 0 })
         |
         `--> provider.fanout(user_id, query, [8 publishers], {gpc:0})
                |
                |--> [LOG] {user, query, topic, targets, meta:{gpc:0}}
                |
                `--> 8x querySite(id, query, {gpc:0})
                       `-> tracking_decision: { logged:true, profile_write:true }

Output: site_level_view = 8x normal_operation
        provider_view  = 1 observation with full fields
        derivations    = topic, reach, interests inferable
```

### gpc — GPC on; per-site enforcement; provider visibility unchanged

```
run_gpc.js
  |
  `--> fanoutAll(provider, 'user-1', 'iPhone 17 review summary', { gpc: 1 })
         |
         `--> provider.fanout(user_id, query, [8 publishers], {gpc:1})
                |
                |--> [LOG] {user, query, topic, targets, meta:{gpc:1}}
                |
                `--> 8x querySite(id, query, {gpc:1})
                       `-> strict   sites: { logged:false, profile_write:false }
                          advisory sites: { logged:true,  profile_write:false }
                          none     site:  { logged:true,  profile_write:true  }

Output: site_level_view = mixed by publisher enforcement level
        provider_view  = structurally identical to baseline
        structural_finding emitted
```

### mitigated — GPC on plus E2 commitments

```
run_mitigated.js
  |
  |--> mitigations = chain(noTrainCommitment(), kAnonymity(5), dpNoise(1.0))
  |
  `--> provider = createProvider({ mitigations })
         `--> provider.fanout(...)
                |
                |--> [RAW LOG]  -> mitigations.apply()
                |       no_train tag + k-anon suppression check
                |--> [FINAL LOG] {..., do_not_train:true, k_anon_suppressed:true, cohort_size:1}

Output: provider_view includes commitment tags
        inferUserInterests honors k_anon_suppressed
        note: commitments unverifiable at protocol layer
```

### signal-drop — provider strips _meta before forwarding

```
run_signal_drop.js
  |
  `--> provider = createProvider({ mitm: true })
         `--> provider.fanout(user_id, query, [8 publishers], {gpc:1})
                |
                |--> [LOG] meta_received:{gpc:1}, meta_forwarded:{}
                |
                `--> 8x querySite(id, query, {})  [no GPC seen by sites]
                       `-> all sites: { logged:true, profile_write:true }

Output: meta_received_by_provider = {gpc:1}
        meta_forwarded_to_sites   = {}
        site_level_view = 8x normal_operation (sites saw no GPC)
        finding: provider can silently nullify enforcement at all destinations
```

### aggregate — 80-user simulation, mixed GPC

```
run_aggregate.js
  |
  |--> seed = 42 (deterministic)
  |
  `--> for 80 users:
         for 1..3 queries per user:
           fanoutAll(provider, user_id, random_query, {gpc: 1 if rand<0.4 else 0})

Output: log_size                       = 155
        measured_gpc_adoption_rate     = 0.40 (matches target)
        topic_distribution             = 5 topics across queries
        topic_by_gpc                   = per-topic GPC stratification
        publisher_reach                = 155 each (every query hits every publisher)
        structural_finding             = these derivations are provider-only
```

### ai-baseline / ai-gpc — Ollama-driven fanout

```
run_ai_baseline.js   (or run_ai_gpc.js)
  |
  `--> handleRequest({ provider, user_id, query, gpc })
         |
         |--> Ollama model receives query + tool definitions (query_publisher)
         |--> Model decides per-call (publisher_id, sub_query)
         |--> Each model decision routed through provider.fanout(user_id, sub_query, [publisher_id], {gpc})
         |--> Provider logs each model-generated call in observation_log
         |--> Loop continues until model has called >= minToolCalls publishers, then summarises
         `--> Model writes final consolidated response

Output: model_tool_calls          = list of {publisher_id, sub_query, tracking_decision}
        provider_view             = one observation per model call
        user_facing_summary       = model's final synthesis
        structural finding: provider sees every sub-query the model generated
```

---

## Key artifact: site-vs-provider visibility comparison

The headline paper figure is the side-by-side of `site_level_view` and `provider_view` in `run_gpc.js`. The site-side rows show what each publisher knew about the call. The provider-side row shows what the provider knew. The asymmetry is the whole argument.

```
SITE-LEVEL VIEW (gpc=1)                          PROVIDER VIEW (gpc=1)
─────────────────────────────────────            ──────────────────────────────────────
the-verge          logged=false                  user_id          = user-1
ars-technica       logged=false                  query            = iPhone 17 review summary
cnet               logged=false                  query_topic      = mobile_device
tomsguide          logged=false                  fanout_targets   = [8 publishers]
engadget           logged=true (advisory)        meta_received    = { gpc: 1 }
wired              logged=false                  meta_forwarded   = { gpc: 1 }
android-authority  logged=true (no GPC)          mitm_applied     = false
techcrunch         logged=true (advisory)
```

Six of eight sites suppressed logging. The provider retains the full slate.

### Expected cross-mode comparison

```
Field                          | baseline    | gpc         | mitigated   | signal-drop
-------------------------------|-------------|-------------|-------------|-------------
sites suppressing log          | 0/8         | 5/8         | 5/8         | 0/8
provider observations          | 1           | 1           | 1           | 1
meta_forwarded to sites        | {gpc:0}     | {gpc:1}     | {gpc:1}     | {}
do_not_train tag on log        | absent      | absent      | true        | absent
provider can infer user topic  | yes         | yes         | yes (k-anon)| yes
provider can derive aggregates | yes         | yes         | yes (DP)    | yes
```

---

## File map

```
architecture-d/
|
|-- tool_registry.js       Publisher catalog — id, name, supports_gpc, enforcement
|-- site_handlers.js       Per-publisher GPC enforcement; querySite, decideTracking
|-- topic_classifier.js    Deterministic topic inference from user query string
|-- provider.js            LLM provider middleware; observation log; mitm; mitigations
|-- mitigations.js         E2 commitments — no_train, k-anonymity, DP noise; chain()
|-- aggregation.js         E1 derivations from the provider observation log
|-- orchestrator.js        fanoutAll / fanoutSelected — entry points the orchestrator calls
|
|-- agent_loop.js          Ollama tool-loop (shared style with Architectures A and B)
|-- llm_orchestrator.js    Wires query_publisher tool to provider.fanout()
|
|-- run_baseline.js        GPC off; 1 user
|-- run_gpc.js             GPC on; 1 user; structural finding
|-- run_mitigated.js       GPC on; 1 user; E2 commitments active
|-- run_signal_drop.js     Provider mitm strips _meta
|-- run_aggregate.js       80-user simulation; deterministic seed
|-- run_ai_baseline.js     Ollama-driven fanout; GPC off
|-- run_ai_gpc.js          Ollama-driven fanout; GPC on
|
|-- package.json
|
`-- tests/
    |-- tool_registry.test.js    Catalog shape, lookup, list
    |-- site_handlers.test.js    Tracking decision per enforcement level
    |-- provider.test.js         Observation log, structural invariant, mitm, mitigations
    |-- aggregation.test.js      Adoption rate, distribution, reach, GPC matrix, interests
    |-- mitigations.test.js      no_train, k-anon, DP, chain composition
    `-- orchestrator.test.js     fanoutAll / fanoutSelected; per-call independence
```

---

## Setup

Requires Node.js 18+.

```bash
cd architecture-d
npm install
cp .env.example .env        # optional; only needed to pin defaults or set TAVILY_API_KEY
```

### Ollama (required for ai-* run modes)

Defaults: `http://localhost:11434`, `qwen2.5:7b` (~5 GB, tool-capable, fits comfortably on a laptop). Override via `OLLAMA_BASE_URL` and `OLLAMA_MODEL` in `.env` or as inline env vars. See `https://ollama.com` for installation.

```bash
ollama pull qwen2.5:7b
ollama serve
```

Tool-using models only — `gemma3:1b` and other text-only models will fail at the first tool call.

### Tavily (optional, enables live publisher fetches)

When `TAVILY_API_KEY` is set in `.env`, `site_handlers.js` fetches a real review snippet from each publisher's domain via Tavily (`https://tavily.com`, free tier ~1000 searches/month) and reports `review_source: "tavily_live"` instead of `"canned"`. The site enforcement layer (logged / profile_write decisions) is unchanged.

```
# .env
TAVILY_API_KEY=tvly-...
```

Mirrors the Tavily integration in Architecture A's `search_web` tool.

---

## How to test

### Unit and integration tests

```bash
npm test
```

40 tests across six files. Tests are deterministic and do not require Ollama.

| Test file | What it covers |
|---|---|
| `tool_registry.test.js` | Catalog shape, lookup by id, list-of-ids |
| `site_handlers.test.js` | `decideTracking` matrix for all three enforcement levels; querySite ok / error paths |
| `provider.test.js` | Observation log per call; structural invariance under GPC; mitm strip-and-retain; mitigations hook; reset |
| `aggregation.test.js` | Adoption rate (incl. empty); topic distribution; publisher reach; GPC matrix; ranked user interests; k-anon suppression respected |
| `mitigations.test.js` | `noTrainCommitment` tag; `kAnonymity` per-topic cohort growth; `dpNoise` numeric output; `chain` composition order and name |
| `orchestrator.test.js` | `fanoutAll` hits every publisher; `fanoutSelected` honors subset; per-call enforcement independence; end-to-end GPC + provider visibility |

### Demo runs

```bash
npm run demo          # baseline + gpc + mitigated + signal-drop + aggregate
```

Individual runs:

```bash
npm run baseline      # GPC off; reference for what the provider learns
npm run gpc           # GPC on; sites enforce; provider visibility unchanged
npm run mitigated     # GPC on; E2 commitments (no_train + k-anon + DP) active
npm run signal-drop   # Provider strips _meta; sites unaware
npm run aggregate     # 80-user simulation; cross-user derivations
```

LLM-driven runs (require Ollama):

```bash
npm run ai-baseline   # Ollama decides fanout shape; GPC off
npm run ai-gpc        # Ollama decides fanout shape; GPC on
npm run ai-demo       # ai-baseline then ai-gpc
```

---

## What the output shows

Each run prints a single JSON object to stdout. The fields relevant to the paper:

| Field | What it records |
|---|---|
| `site_level_view` | Per-publisher slice of one fanout: did the site see GPC, what tracking decision did it make |
| `provider_view` | Full observation log from the provider middleware; one entry per `provider.fanout()` call |
| `provider_derivations` | Aggregate inferences computed over `provider_view` — adoption rate, topic distribution, publisher reach, per-user interest profile |
| `model_tool_calls` (ai modes) | Each model-generated `query_publisher` call: publisher chosen, sub-query written, site decision |
| `structural_finding` (gpc, ai-gpc) | Plain-language statement of the E1 claim observable in the run |
| `meta_received_by_provider` / `meta_forwarded_to_sites` (signal-drop) | The asymmetry that surfaces the threat-model property |

The `provider_view` field is the load-bearing artifact. It is the visible record of what the provider observes regardless of site-level enforcement, and it is the basis for every derivation in `provider_derivations`. The contrast between `site_level_view` and `provider_view` in any GPC-on run is the headline finding of Architecture D.
