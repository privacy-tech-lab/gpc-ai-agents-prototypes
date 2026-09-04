<p align="center">
  <a href="https://github.com/privacy-tech-lab/gpc-ai-agents-prototypes/releases"><img alt="GitHub release (latest by date)" src="https://img.shields.io/github/v/release/privacy-tech-lab/gpc-ai-agents-prototypes"></a>
  <a href="https://github.com/privacy-tech-lab/gpc-ai-agents-prototypes/releases"><img alt="GitHub Release Date" src="https://img.shields.io/github/release-date/privacy-tech-lab/gpc-ai-agents-prototypes"></a>
  <a href="https://github.com/privacy-tech-lab/gpc-ai-agents-prototypes/commits/main"><img alt="GitHub last commit" src="https://img.shields.io/github/last-commit/privacy-tech-lab/gpc-ai-agents-prototypes"></a>
  <a href="https://github.com/privacy-tech-lab/gpc-ai-agents-prototypes/issues"><img alt="GitHub issues" src="https://img.shields.io/github/issues-raw/privacy-tech-lab/gpc-ai-agents-prototypes"></a>
  <a href="https://github.com/privacy-tech-lab/gpc-ai-agents-prototypes/issues?q=is%3Aissue+is%3Aclosed"><img alt="GitHub closed issues" src="https://img.shields.io/github/issues-closed-raw/privacy-tech-lab/gpc-ai-agents-prototypes"></a>
  <a href="https://github.com/privacy-tech-lab/gpc-ai-agents-prototypes/blob/main/LICENSE.md"><img alt="GitHub" src="https://img.shields.io/github/license/privacy-tech-lab/gpc-ai-agents-prototypes"></a>
  <a href="https://github.com/privacy-tech-lab/gpc-ai-agents-prototypes/watchers"><img alt="GitHub watchers" src="https://img.shields.io/github/watchers/privacy-tech-lab/gpc-ai-agents-prototypes?style=social"></a>
  <a href="https://github.com/privacy-tech-lab/gpc-ai-agents-prototypes/stargazers"><img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/privacy-tech-lab/gpc-ai-agents-prototypes?style=social"></a>
  <a href="https://github.com/privacy-tech-lab/gpc-ai-agents-prototypes/network/members"><img alt="GitHub forks" src="https://img.shields.io/github/forks/privacy-tech-lab/gpc-ai-agents-prototypes?style=social"></a>
  <a href="https://github.com/sponsors/privacy-tech-lab"><img alt="GitHub sponsors" src="https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&color=%23fe8e86"></a>
</p>

# GPC AI Agents Prototypes

The GPC AI Agent Prototypes are developed and maintained by the [OptMeowt team](https://github.com/privacy-tech-lab/gpc-optmeowt#optmeowt-).

This repo contains experimental prototypes exploring how the [Global Privacy Control (GPC) signal](https://globalprivacycontrol.org/) propagates and is enforced across multi-agent AI pipelines. Each prototype simulates a realistic agentic workflow and tests a specific question: does the user's opt-out actually stop data from being shared, or does it only carry the signal forward and leave enforcement to whoever is downstream?

[1. Prototypes](#1-prototypes)  
[2. Shared Infrastructure](#2-shared-infrastructure)  
[3. Contributing](#3-contributing)  
[4. Thank You!](#4-thank-you)

## 1. Prototypes

| Prototype | Folder                     | What it enforces                                                   | Typology coverage                                                  |
| --------- | -------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| 1         | [prototype-1](prototype-1) | Tool-level blocking via an MCP interceptor                         | Category D, D1                                                     |
| 2         | [prototype-2](prototype-2) | Secondary pipeline gating after the agent                          | Category C, C1 to C3                                               |
| 3         | [prototype-3](prototype-3) | Consent-scoped tool registry                                       | Category A, A1 and A2                                              |
| 4         | [prototype-4](prototype-4) | Signal propagation and the provider visibility gap                 | A gap the typology does not cover; its mechanisms touch C4, C3, B3 |
| 5         | [prototype-5](prototype-5) | Inference firewall for derived attributes                          | Category B, B3                                                     |
| 6         | [prototype-6](prototype-6) | Collection gate at input, behavioral, and derived boundaries       | Category B, B1 to B3                                               |
| 7         | [prototype-7](prototype-7) | Retention boundaries at session end, recall, and profile synthesis | Category D, D1 to D3                                               |
| 8         | [prototype-8](prototype-8) | Delegation tiering with a decline-by-default fallback              | Category E, E1                                                     |

### 1.1 Prototype 1: Tool-Level Blocking via MCP Interceptor

**Scenario:** a user asks an AI assistant to plan a 5-day trip to Japan. The assistant searches the web, synthesizes an itinerary, and (without GPC) saves the result to the user's profile and syncs to a third-party vendor.

**Enforcement:** the GPC signal is read from the `Sec-GPC` header and placed into a `_meta` envelope that travels with every MCP tool call. An interceptor at the MCP layer checks the envelope before each tool executes. Sensitive storage tools (`save_to_profile`, `log_interaction`) are blocked mid-call; the agent tries to invoke them and is stopped. Search still runs because it is not a sensitive tool.

**What it prevents:** the agent completing storage actions against user data.

**What it does not prevent:** the agent from running or from returning an answer.

See [prototype-1/README.md](prototype-1/README.md) for setup, demo, and test instructions.

### 1.2 Prototype 2: Secondary Pipeline Gating After the Agent

**Scenario:** a patient asks a medical assistant what their blood pressure reading means. The same interaction also feeds an analytics log, a model-training dataset, and a pharma ad-targeting platform.

**Enforcement:** the agent runs to completion and the patient always gets an answer. After the agent finishes, the orchestrator fans out to secondary pipelines. A `withPurposeCheck` wrapper gates each pipeline against the GPC signal and the declared purpose of that pipeline. Full opt-out blocks all three; partial opt-out (via `gpc_scope`) lets the user block specific purposes while allowing others.

**What it prevents:** secondary uses of the agent's output (analytics, training, ad targeting).

**What it does not prevent:** the primary task. The retrieval tool and the answer are never gated.

See [prototype-2/README.md](prototype-2/README.md) for setup, demo, and test instructions.

### 1.3 Prototype 3: Consent-Scoped Tool Registry

**Scenario:** a user consents to file access and web search when signing up for an AI productivity platform. A later platform update silently adds an email sender and a behavior tracker to the MCP server.

**Enforcement:** before the agent starts, the tool registry filters the available catalog based on the user's consent state and GPC signal. Tools the user has not consented to are removed from the catalog. The agent never sees them and cannot call them. With GPC active, expansion tools added after signup are quarantined even if the user previously approved the platform.

**What it prevents:** the agent from accessing capabilities the user did not consent to, including tools added after initial consent.

**What it does not prevent:** tools that were in scope at the time of consent.

See [prototype-3/README.md](prototype-3/README.md) for setup, demo, and test instructions.

### 1.4 Prototype 4: Signal Propagation and the Provider Visibility Gap

**Scenario:** a user asks an AI assistant to research the iPhone 17 across eight tech publishers simultaneously.

**Enforcement:** the GPC signal travels in a W3C baggage header from the orchestrator through a provider middleware layer to each publisher. Sites with strict enforcement stop logging the visit. Sites with advisory enforcement stop writing to the visitor profile. Sites that do not support GPC track normally.

**What it prevents:** tracking at individual publisher sites that honor the signal.

**What it does not prevent:** the provider layer from observing every query. The provider sits between the user's agent and the publishers and records each fanout regardless of the GPC bit. This is the prototype's finding: the AI provider is a structural new privacy boundary that GPC as currently specified does not reach. The signal propagates downstream to sites, but the platform operating the agent sees everything.

See [prototype-4/README.md](prototype-4/README.md) for setup, demo, and test instructions.

### 1.5 Prototype 5: Inference Firewall for Derived Attributes

**Scenario:** a user runs eight ordinary search queries. Each query is fed through a classifier that infers personal attributes (health conditions, financial situation, employment status) without the user ever disclosing them explicitly.

**Enforcement:** when the GPC B3 signal is active, the inference engine is replaced by a firewall that refuses to write derived attributes to the user profile. The agent still runs the same queries against the same sources. The difference is what the platform does internally with the traffic it observes: without GPC, it builds a profile; with GPC, the firewall blocks that step.

**What it prevents:** the platform from accumulating an inferred profile from the user's query traffic.

**What it does not prevent:** the queries from reaching external sources, or the platform from observing the queries themselves.

See [prototype-5/README.md](prototype-5/README.md) for setup, demo, and test instructions.

Prototypes 1 through 5 are each organized around one enforcement mechanism. Prototypes 6 through 8 are organized the other way, by the opt-out typology: one prototype per category, covering that category's subtypes exactly. They complement the first five rather than replacing them.

### 1.6 Prototype 6: Collection

**Scenario:** a user asks an AI writing assistant to polish one email to their manager about a raise. While composing, they deleted a sentence about treatment costs before submitting, paused 42 seconds over the salary line, and rewrote the opening three times.

**Enforcement:** a collection gate at three boundaries. B1 (input): the submission completes the task and is then discarded instead of logged. B2 (behavioral): passively generated telemetry is suppressed. B3 (derived): the inference firewall blocks profile writes, with each attribute labeled by whether it came from submitted input or from behavior. A bare GPC signal asserts all three; a scope list asserts any subset.

**What it prevents:** the platform retaining what the user submitted, recording what they unknowingly produced, and writing inferences derived from either. Two of the four inferred attributes come from a sentence the user chose not to send.

**What it does not prevent:** the task. The polished email is returned identically in every mode.

See [prototype-6/README.md](prototype-6/README.md) for setup, demo, flowchart, and test instructions.

### 1.7 Prototype 7: Persistence

**Scenario:** a user talks to Aria, a memory-enabled assistant, across two sessions. In session 1 they mention being vegetarian on a tight budget while asking for dinner recipes. Session 2 tests whether any of that carries forward.

**Enforcement:** three retention boundaries. D1 (session scope): at session end, transcripts and disclosed facts are discarded instead of archived. D2 (cross-session scope): at session start, the archive exists but returns nothing to the new session. D3 (long-term profile scope): the synthesis step is skipped and sessions stay inert transcripts. The subtypes form a hierarchy, so a bare GPC signal asserts the strictest scope.

**What it prevents:** data surviving the session, past sessions informing future ones, and a durable behavioral model being built from what is retained.

**What it does not prevent:** within-session coherence. Aria still uses what the user said earlier in the same session, in every mode including D1.

See [prototype-7/README.md](prototype-7/README.md) for setup, demo, and test instructions.

### 1.8 Prototype 8: Delegation

**Scenario:** a user asks a travel agent to book a weekend trip. Finishing the job takes six actions: search flights, hold a hotel room, buy a non-refundable ticket with the card on file, send passport details to the airline, and around the session, enable fare tracking and a newsletter. The six are not equivalent in reversibility, sensitivity, or consequence.

**Enforcement:** the user partitions actions into tiers and grants the agent standing in some while withholding it in others. A user assignment always beats the vendor's proposed tiering, and anything nobody assigned falls to the most restrictive treatment. The GPC signal does not set tiers; it voids the vendor's proposed ones, on the grounds that a global opt-out means consent to a tier may not be inferred from a platform default.

**What it prevents:** the agent charging a card, sending passport data, enabling tracking, and subscribing the user, four actions it had no standing for.

**What it does not prevent:** the searches and the hotel hold, which the user granted and which still run unattended.

See [prototype-8/README.md](prototype-8/README.md) for setup, demo, and test instructions.

## 2. Shared Infrastructure

The prototypes are npm workspaces with one lockfile at the repository root. Install once, then work inside any prototype:

```bash
npm install                  # from the repository root, installs all eight prototypes
npm test                     # every prototype's suite
cd prototype-5 && npm test   # one prototype
```

The `core/` directory holds modules used across multiple prototypes:

- `ollama.js`: Ollama chat-completion caller with a fixture gate for offline testing (used by all architectures)
- `tavily.js`: Wavily search caller with timeout and fixture support (used by arch-A and arch-D)
- `agent_loop.js`: shared LLM turn loop with `requiredTools` enforcement (used by arch-A, arch-C, and arch-E as thin wrappers)
- `gpc.js`: shared `buildPrivacyContext` helper that reads the GPC signal from an Express request (used by arch-B and arch-D)

## 3. Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the issue template, PR conventions, and the writing rules we use across this repo.

## 4. Thank You!

<p align="center"><strong>We would like to thank our supporters!</strong></p><br>

<p align="center">Major financial support provided by the National Science Foundation under awards <a href="https://nsf.gov/awardsearch/showAward?AWD_ID=2055196">#2055196</a> and <a href="https://www.nsf.gov/awardsearch/show-award/?AWD_ID=2618248">#2618248</a>.</p>

<p align="center">
   <img class="img-fluid" src="./nsf.png" height="100px" alt="National Science Foundation Logo">
</p>

<p align="center">Additional financial support provided by Wesleyan University and the Anil Fernando Endowment.</p>

<p align="center">
  <a href="https://www.wesleyan.edu/mathcs/cs/index.html">
    <img class="img-fluid" src="./wesleyan_shield.png" height="70px" alt="Wesleyan University Logo">
  </a>
</p>

<p align="center">Conclusions reached or positions taken are our own and not necessarily those of our financial supporters, its trustees, officers, or staff.</p>

##

<p align="center">
  <a href="https://privacytechlab.org/"><img src="./plt_logo.png" width="200px" height="200px" alt="privacy-tech-lab logo"></a>
<p>
