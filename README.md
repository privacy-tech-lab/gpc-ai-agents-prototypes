# GPC AI Agents Prototypes

Experimental prototypes exploring how the Global Privacy Control (GPC) signal propagates and is enforced across multi-agent AI pipelines. Each architecture simulates a realistic agentic workflow and tests whether a user's opt-out survives the full chain.

---

## Architectures

| Architecture | GPC category | Core mechanism |
|---|---|---|
| [A](architecture-a/README.md) | Presence, Use, Persistence, Behavioral influence | Four-layer signal propagation: transport header, agent protocol envelope, JWT trust boundary, data-layer interceptor |
| [B](architecture-b/README.md) | Use, Persistence, Behavioral influence | Purpose-scoped enforcement: a single interaction fans out to secondary pipelines gated by declared purpose; partial opt-out via `gpc_scope` |
| [C](architecture-c/README.md) | A1 (no integration-by-update), A2 (opt-in only) | Consent-scoped tool registry: new tools added by platform updates are quarantined until the user approves; GPC auto-declines non-primary categories |
| [D](architecture-d/README.md) | E1 (provider as new privacy boundary), E2 (provider-side commitments) | Fanout aggregation surface: the LLM provider observes every outbound call and can derive cross-session profiles even when all downstream sites enforce GPC correctly |
| [E](architecture-e/README.md) | B3 (derived-collection opt-out) | Inference firewall: a classifier that infers personal attributes from queries is intercepted at the boundary; attributes are never written when B3 is on |

---

## Shared layer (`core/`)

The five architectures share a `core/` module for the network calls they have in common: Tavily search (used by arch-A and arch-D) and Ollama chat completion (used by all five). Each arch keeps its own enforcement, envelope construction, and agent-loop semantics; only the raw IO is shared.

The same module also owns the fixture-gate (`TAVILY_FIXTURE` and `OLLAMA_FIXTURE` env vars), so a fresh clone can run any AI demo deterministically without an API key or a local Ollama. See [`core/`](core/) for the implementation and tests.

---

## Architecture A: Signal Propagation in a Multi-Agent Pipeline

**Scenario:** a user asks an AI assistant to plan a 5-day trip to Japan. The assistant searches the web, synthesises an itinerary, and (without GPC) saves the result to the user's profile and syncs to a third-party vendor.

GPC enforcement spans four layers: the W3C Baggage header carries the signal at transport, an MCP `_meta` envelope threads it through every tool call, a signed RS256 JWT gates the third-party vendor independently, and a `withGpc()` interceptor wraps sensitive tool handlers at the data layer. The user gets an equally good itinerary whether GPC is on or off; with GPC on, nothing is stored.

See [architecture-a/README.md](architecture-a/README.md) for setup, demo, and test instructions.

---

## Architecture B: Purpose-Scoped Enforcement

**Scenario:** a patient asks a medical assistant what their blood pressure reading means. The same interaction also feeds an analytics log, a model-training dataset, and a pharma ad-targeting platform.

Where Architecture A blocks tools entirely, Architecture B gates by declared purpose. Each secondary pipeline declares its purpose (`analytics`, `model_training`, `ad_targeting`); a `withPurposeCheck()` wrapper blocks writes when that purpose is in the user's opt-out scope. An optional `gpc_scope` array enables partial opt-out (e.g., block ad targeting while allowing analytics). The primary answer is never affected.

See [architecture-b/README.md](architecture-b/README.md) for setup, demo, and test instructions.

---

## Architecture C: Consent-Scoped Tool Registry

**Scenario:** a user consents to file access and web search when signing up for an AI productivity platform. A later update silently adds an email sender and a behavior tracker to the MCP server.

Architecture C introduces a versioned consent manifest. Every tool invocation is checked against the manifest before executing; tools added after the user's last consent version are quarantined until approved or declined. When GPC is on, the signal auto-declines non-primary capability categories without requiring a per-tool prompt, and the decision is written durably so it persists across future updates.

See [architecture-c/README.md](architecture-c/README.md) for setup, demo, and test instructions.

---

## Architecture D: Fanout and Provider Aggregation Surface

**Scenario:** a user asks an AI assistant to research the iPhone 17 across eight tech publishers simultaneously.

Even when every publisher enforces GPC correctly, the LLM provider sits at a chokepoint that observes every outbound call: the user's query, which publishers were contacted, and the GPC state of every call. Across sessions, the provider can derive GPC adoption rates, topic distributions, and per-user interest profiles — derivations no browser-era intermediary could make. Architecture D makes this structural invariant explicit and introduces provider-side data-handling commitments as a mitigation.

See [architecture-d/README.md](architecture-d/README.md) for setup, demo, and test instructions.

---

## Architecture E: Inference Firewall

**Scenario:** a user runs eight ordinary search queries. Each query is fed through a classifier that infers personal attributes (health conditions, financial situation, employment status) without the user ever disclosing them explicitly.

Architecture E implements a GPC B3 firewall between the classifier and the profile store. When the B3 signal is on, inference is intercepted at the boundary: the answer reaches the user, but no derived attributes are written. When B3 is off, the same pipeline silently builds a detailed shadow profile.

See [architecture-e/README.md](architecture-e/README.md) for setup, demo, and test instructions.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the issue template, PR conventions, and the writing rules we use across this repo.

---

## Copyright

Copyright 2026 Privacy Tech Lab at Wesleyan University. Licensed under the MIT License — see [LICENSE](LICENSE).
