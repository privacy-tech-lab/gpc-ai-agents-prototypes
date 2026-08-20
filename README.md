# GPC AI Agents Prototypes

Experimental prototypes exploring how the Global Privacy Control (GPC) signal propagates and is enforced across multi-agent AI pipelines. Each architecture simulates a realistic agentic workflow and tests a specific question: does the user's opt-out actually stop data from being shared, or does it only carry the signal forward and leave enforcement to whoever is downstream?

---

## Architectures

### Architecture A: Tool-Level Blocking via MCP Interceptor

**Scenario:** a user asks an AI assistant to plan a 5-day trip to Japan. The assistant searches the web, synthesises an itinerary, and (without GPC) saves the result to the user's profile and syncs to a third-party vendor.

**Enforcement:** the GPC signal is read from the `Sec-GPC` header and placed into a `_meta` envelope that travels with every MCP tool call. An interceptor at the MCP layer checks the envelope before each tool executes. Sensitive storage tools (`save_to_profile`, `log_interaction`) are blocked mid-call; the agent tries to invoke them and is stopped. Search still runs because it is not a sensitive tool.

**What it prevents:** the agent completing storage actions against user data.

**What it does not prevent:** the agent from running or from returning an answer.

See [prototype-1/README.md](prototype-1/README.md) for setup, demo, and test instructions.

---

### Architecture B: Secondary Pipeline Gating After the Agent

**Scenario:** a patient asks a medical assistant what their blood pressure reading means. The same interaction also feeds an analytics log, a model-training dataset, and a pharma ad-targeting platform.

**Enforcement:** the agent runs to completion and the patient always gets an answer. After the agent finishes, the orchestrator fans out to secondary pipelines. A `withPurposeCheck` wrapper gates each pipeline against the GPC signal and the declared purpose of that pipeline. Full opt-out blocks all three; partial opt-out (via `gpc_scope`) lets the user block specific purposes while allowing others.

**What it prevents:** secondary uses of the agent's output (analytics, training, ad targeting).

**What it does not prevent:** the primary task. The retrieval tool and the answer are never gated.

See [prototype-2/README.md](prototype-2/README.md) for setup, demo, and test instructions.

---

### Architecture C: Consent-Scoped Tool Registry

**Scenario:** a user consents to file access and web search when signing up for an AI productivity platform. A later platform update silently adds an email sender and a behavior tracker to the MCP server.

**Enforcement:** before the agent starts, the tool registry filters the available catalog based on the user's consent state and GPC signal. Tools the user has not consented to are removed from the catalog. The agent never sees them and cannot call them. With GPC active, expansion tools added after signup are quarantined even if the user previously approved the platform.

**What it prevents:** the agent from accessing capabilities the user did not consent to, including tools added after initial consent.

**What it does not prevent:** tools that were in scope at the time of consent.

See [prototype-3/README.md](prototype-3/README.md) for setup, demo, and test instructions.

---

### Architecture D: Signal Propagation and the Provider Visibility Gap

**Scenario:** a user asks an AI assistant to research the iPhone 17 across eight tech publishers simultaneously.

**Enforcement:** the GPC signal travels in a W3C baggage header from the orchestrator through a provider middleware layer to each publisher. Sites with strict enforcement stop logging the visit. Sites with advisory enforcement stop writing to the visitor profile. Sites that do not support GPC track normally.

**What it prevents:** tracking at individual publisher sites that honor the signal.

**What it does not prevent:** the provider layer from observing every query. The provider sits between the user's agent and the publishers and records each fanout regardless of the GPC bit. This is the architecture's finding: the AI provider is a structural new privacy boundary that GPC as currently specified does not reach. The signal propagates downstream to sites, but the platform operating the agent sees everything.

See [prototype-4/README.md](prototype-4/README.md) for setup, demo, and test instructions.

---

### Architecture E: Inference Firewall for Derived Attributes

**Scenario:** a user runs eight ordinary search queries. Each query is fed through a classifier that infers personal attributes (health conditions, financial situation, employment status) without the user ever disclosing them explicitly.

**Enforcement:** when the GPC B3 signal is active, the inference engine is replaced by a firewall that refuses to write derived attributes to the user profile. The agent still runs the same queries against the same sources. The difference is what the platform does internally with the traffic it observes: without GPC, it builds a profile; with GPC, the firewall blocks that step.

**What it prevents:** the platform from accumulating an inferred profile from the user's query traffic.

**What it does not prevent:** the queries from reaching external sources, or the platform from observing the queries themselves.

See [prototype-5/README.md](prototype-5/README.md) for setup, demo, and test instructions.

---

## Category prototypes

The architectures above are each organized around one enforcement mechanism. These prototypes are organized the other way, by the opt-out typology: one prototype per category, covering that category's subtypes exactly. They complement the architectures rather than replacing them.

### Category B: Collection

**Scenario:** a user asks an AI writing assistant to polish one email to their manager about a raise. While composing, they deleted a sentence about treatment costs before submitting, paused 42 seconds over the salary line, and rewrote the opening three times.

**Enforcement:** a collection gate at three boundaries. B1 (input): the submission completes the task and is then discarded instead of logged. B2 (behavioral): passively generated telemetry is suppressed. B3 (derived): the inference firewall blocks profile writes, with each attribute labeled by whether it came from submitted input or from behavior. A bare GPC signal asserts all three; a scope list asserts any subset.

**What it prevents:** the platform retaining what the user submitted, recording what they unknowingly produced, and writing inferences derived from either. Two of the four inferred attributes come from a sentence the user chose not to send.

**What it does not prevent:** the task. The polished email is returned identically in every mode.

See [prototype-6/README.md](prototype-6/README.md) for setup, demo, flowchart, and test instructions.

---

## Shared Infrastructure

The `core/` directory holds modules used across multiple architectures:

- `ollama.js`: Ollama chat-completion caller with a fixture gate for offline testing (used by all architectures)
- `tavily.js`: Tavily search caller with timeout and fixture support (used by arch-A and arch-D)
- `agent_loop.js`: shared LLM turn loop with `requiredTools` enforcement (used by arch-A, arch-C, and arch-E as thin wrappers)
- `gpc.js`: shared `buildPrivacyContext` helper that reads the GPC signal from an Express request (used by arch-B and arch-D)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the issue template, PR conventions, and the writing rules we use across this repo.

---

## Copyright

Copyright 2026 Privacy Tech Lab at Wesleyan University. Licensed under the MIT License — see [LICENSE](LICENSE).
