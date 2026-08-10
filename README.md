# GPC AI Agents Prototypes

Experimental prototypes exploring how the Global Privacy Control (GPC) signal propagates and is enforced across multi-agent AI pipelines. Each architecture simulates a realistic agentic workflow and tests a specific question: does the user's opt-out actually stop data from being shared, or does it only carry the signal forward and leave enforcement to whoever is downstream?

---

## Architectures

### Architecture A: Tool-Level Blocking via MCP Interceptor

**Scenario:** a user asks an AI assistant to plan a 5-day trip to Japan. The assistant searches the web, synthesises an itinerary, and (without GPC) saves the result to the user's profile and syncs to a third-party vendor.

**Enforcement:** the GPC signal is read from the `Sec-GPC` header and placed into a `_meta` envelope that travels with every MCP tool call. An interceptor at the MCP layer checks the envelope before each tool executes. Sensitive storage tools (`save_to_profile`, `log_interaction`) are blocked mid-call; the agent tries to invoke them and is stopped. Search still runs because it is not a sensitive tool.

**What it prevents:** the agent completing storage actions against user data.

**What it does not prevent:** the agent from running or from returning an answer.

See [architecture-a/README.md](architecture-a/README.md) for setup, demo, and test instructions.

---

### Category C: Use

**Scenario:** a patient asks HealthAssist what a 158/96 blood pressure reading means. Around the one answer, the platform attempts an insurance risk assessment, a personalization update, analytics, pharma ad targeting, and a training append, and the task's sub-agent chain runs two hops (a pharmacy price agent that needs only the medication name, and a wellness marketing vendor that wants the full health context).

**Enforcement:** a use gate on every downstream attempt. C1 blocks same-platform reuse beyond the task, C1a blocks personalization, C2 blocks analytics, C2a blocks targeting, C3 blocks the training append, and C4 minimizes the necessary chain hop to its required fields while refusing the unnecessary one. Bare GPC asserts all six; a scope list asserts any subset, with c1 implying c1a and c2 implying c2a. The answer is never gated.

**What it prevents:** collected data leaving its task context, on the platform or along the agent chain.

**What it does not prevent:** the task itself, or anything in Categories A, B, D, and E.

See [category-c-use/README.md](category-c-use/README.md) for setup, demo, flowcharts, and test instructions. This prototype replaces the former Architectures B and D.

---

### Architecture C: Consent-Scoped Tool Registry

**Scenario:** a user consents to file access and web search when signing up for an AI productivity platform. A later platform update silently adds an email sender and a behavior tracker to the MCP server.

**Enforcement:** before the agent starts, the tool registry filters the available catalog based on the user's consent state and GPC signal. Tools the user has not consented to are removed from the catalog. The agent never sees them and cannot call them. With GPC active, expansion tools added after signup are quarantined even if the user previously approved the platform.

**What it prevents:** the agent from accessing capabilities the user did not consent to, including tools added after initial consent.

**What it does not prevent:** tools that were in scope at the time of consent.

See [architecture-c/README.md](architecture-c/README.md) for setup, demo, and test instructions.

---

### Architecture E: Inference Firewall for Derived Attributes

**Scenario:** a user runs eight ordinary search queries. Each query is fed through a classifier that infers personal attributes (health conditions, financial situation, employment status) without the user ever disclosing them explicitly.

**Enforcement:** when the GPC B3 signal is active, the inference engine is replaced by a firewall that refuses to write derived attributes to the user profile. The agent still runs the same queries against the same sources. The difference is what the platform does internally with the traffic it observes: without GPC, it builds a profile; with GPC, the firewall blocks that step.

**What it prevents:** the platform from accumulating an inferred profile from the user's query traffic.

**What it does not prevent:** the queries from reaching external sources, or the platform from observing the queries themselves.

See [architecture-e/README.md](architecture-e/README.md) for setup, demo, and test instructions.

---

## Shared Infrastructure

The `core/` directory holds modules used across multiple architectures:

- `ollama.js`: Ollama chat-completion caller with a fixture gate for offline testing (used by all architectures)
- `tavily.js`: Tavily search caller with timeout and fixture support (used by arch-A)
- `agent_loop.js`: shared LLM turn loop with `requiredTools` enforcement (used as a thin wrapper by arch-A, arch-C, arch-E, and the category prototypes)
- `gpc.js`: shared `buildPrivacyContext` helper that reads the GPC signal from an Express request

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the issue template, PR conventions, and the writing rules we use across this repo.

---

## Copyright

Copyright 2026 Privacy Tech Lab at Wesleyan University. Licensed under the MIT License — see [LICENSE](LICENSE).
