# GPC AI Agents Prototypes

Experimental prototypes exploring how the Global Privacy Control (GPC) signal propagates and is enforced across multi-agent AI pipelines. Each architecture simulates a realistic agentic workflow and tests whether a user's opt-out survives the full chain.

---

# Architectures

## Architecture A: Signal Propagation in a Multi-Agent Pipeline

**Scenario:** a user asks an AI assistant to plan a 5-day trip to Japan. The assistant searches the web, synthesises an itinerary, and (without GPC) saves the result to the user's profile and syncs to a third-party vendor.

See [architecture-a/README.md](architecture-a/README.md) for setup, demo, and test instructions.

---

## Architecture B: Purpose-Scoped Enforcement

**Scenario:** a patient asks a medical assistant what their blood pressure reading means. The same interaction also feeds an analytics log, a model-training dataset, and a pharma ad-targeting platform.

See [architecture-b/README.md](architecture-b/README.md) for setup, demo, and test instructions.

---

## Architecture C: Consent-Scoped Tool Registry

**Scenario:** a user consents to file access and web search when signing up for an AI productivity platform. A later update silently adds an email sender and a behavior tracker to the MCP server.

See [architecture-c/README.md](architecture-c/README.md) for setup, demo, and test instructions.

---

## Architecture D: Fanout and Provider Aggregation Surface

**Scenario:** a user asks an AI assistant to research the iPhone 17 across eight tech publishers simultaneously.

See [architecture-d/README.md](architecture-d/README.md) for setup, demo, and test instructions.

---

## Architecture E: Inference Firewall

**Scenario:** a user runs eight ordinary search queries. Each query is fed through a classifier that infers personal attributes (health conditions, financial situation, employment status) without the user ever disclosing them explicitly.

See [architecture-e/README.md](architecture-e/README.md) for setup, demo, and test instructions.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the issue template, PR conventions, and the writing rules we use across this repo.

---

## Copyright

Copyright 2026 Privacy Tech Lab at Wesleyan University. Licensed under the MIT License — see [LICENSE](LICENSE).
