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

| Prototype | Folder                     | What it shows                                                       |
| --------- | -------------------------- | ------------------------------------------------------------------- |
| 1         | [prototype-1](prototype-1) | Tool-level blocking via an MCP interceptor                          |
| 2         | [prototype-2](prototype-2) | Purpose-based gating of secondary pipelines after the agent answers |
| 3         | [prototype-3](prototype-3) | Per-call consent checks for tools added after signup                |
| 4         | [prototype-4](prototype-4) | Signal propagation and the provider visibility gap                  |
| 5         | [prototype-5](prototype-5) | Inference firewall for derived attributes                           |
| 6         | [prototype-6](prototype-6) | Collection gates for input, behavior, and derived data              |
| 7         | [prototype-7](prototype-7) | Retention limits at session end, recall, and profile synthesis      |
| 8         | [prototype-8](prototype-8) | Delegation tiers with a decline-by-default fallback                 |

### 1.1 Prototype 1: Tool-Level Blocking via MCP Interceptor

**Scenario:** a user asks an AI assistant to plan a 5-day trip to Japan. A search agent and a synthesis agent (reached over A2A) research the trip and write an itinerary. Without GPC, the assistant also reads the user's past interactions and profile to personalize the answer, then saves the result to the user's profile and logs the interaction.

**How it works:** the GPC signal is read from the `Sec-GPC` header and placed into a `_meta` envelope that travels with every MCP tool call and A2A message. A `withGpc()` interceptor at the MCP layer checks the envelope before each tool runs. Sensitive tools (`user_profile_lookup`, `save_to_profile`, `log_interaction`) are blocked; `search_web` is not sensitive and always runs. An optional `persistence_scope` of `profile` lets the assistant read raw past interactions while still blocking the profile and all writes.

**What it shows:** the agent tries to call the storage tools and is stopped mid-call, so nothing about the user is read from or written to storage. The answer is returned either way.

See [prototype-1/README.md](prototype-1/README.md) for setup, demo, and test instructions.

### 1.2 Prototype 2: Purpose-Based Gating After the Agent

**Scenario:** a patient asks a medical assistant what their blood pressure reading means. The same interaction also feeds an analytics log, a model-training dataset, and a pharma ad-targeting platform.

**How it works:** the agent retrieves the patient's records over MCP and answers. That primary use is never gated. After the agent finishes, the orchestrator fans out to the three secondary pipelines, each tagged with a declared purpose (`analytics`, `model_training`, `ad_targeting`). Analytics and training are wrapped with `withPurposeCheck`; the ad platform runs the same check at its own HTTP boundary. A full GPC signal blocks all three. A partial opt-out (via `gpc_scope`) blocks only the listed purposes.

**What it shows:** the patient always gets an answer, while each secondary use of the conversation can be turned off on its own. The partial run blocks ad targeting and leaves analytics and training running.

See [prototype-2/README.md](prototype-2/README.md) for setup, demo, and test instructions.

### 1.3 Prototype 3: Per-Call Consent for New Tools

**Scenario:** a user consents to file access and web search when signing up for an AI productivity platform. A later platform update silently adds an email sender and a behavior tracker to the MCP server.

**How it works:** every tool call goes through `withConsentCheck()` before it reaches the MCP server. The check compares the tool's capability category against a versioned consent manifest. A tool from a category added after signup is quarantined: the call pauses and the user is asked to approve or decline. Declines are saved to disk, so a declined tool stays blocked through later platform updates. With GPC on, new non-primary categories are declined automatically with no prompt. Silent mode turns the check off to show what happens with no enforcement.

**What it shows:** without the check, new tools are callable the moment they ship. With it, they only run after the user approves, and with GPC they never run. The behavior tracker, which the platform fires on its own rather than the agent choosing it, goes through the same check.

See [prototype-3/README.md](prototype-3/README.md) for setup, demo, and test instructions.

### 1.4 Prototype 4: Signal Propagation and the Provider Visibility Gap

**Scenario:** a user asks an AI assistant to research the iPhone 17 across eight tech publishers at once.

**How it works:** the GPC signal enters as a W3C baggage header (or `Sec-GPC`) and rides in a `_meta` envelope. Every publisher call goes through a provider middleware layer, which logs the call and then forwards it over MCP. Each publisher applies its own enforcement level: strict sites stop logging the visit, advisory sites stop writing to the visitor profile, and sites without GPC support track normally. Extra modes show the provider applying data-handling commitments (`no_train`, k-anonymity, differential privacy noise), the provider stripping the signal before forwarding, and an 80-user simulation.

**What it shows:** publishers that honor GPC do stop tracking, but the provider's observation log is the same with GPC on or off. The provider sees every query, every publisher, and every user's GPC state, and can build interest profiles and GPC adoption stats from it. Commitments limit what the provider does with that view, not what it can see. If the provider strips the signal, no publisher can honor it.

See [prototype-4/README.md](prototype-4/README.md) for setup, demo, and test instructions.

### 1.5 Prototype 5: Inference Firewall for Derived Attributes

**Scenario:** a user runs eight ordinary search queries. A classifier reads each query and infers personal attributes (health conditions, financial situation, employment status) the user never disclosed.

**How it works:** with the GPC signal on, the inference engine is replaced by a firewall that refuses to write derived attributes to the user's profile. The classifier still runs, because it also produces the answer, and the firewall records what it would have written. In the live agent version, the firewall runs inside the search tool, so the model only ever sees the answer.

**What it shows:** without GPC, eight queries leave eleven inferred attributes in a shadow profile. With GPC, the profile stays empty and all eight inferences are recorded as blocked. The answers are the same in both modes.

See [prototype-5/README.md](prototype-5/README.md) for setup, demo, and test instructions.

### 1.6 Prototype 6: Collection Gates for Input, Behavior, and Derived Data

**Scenario:** a user asks an AI writing assistant to polish one email to their manager about a raise. While composing, they deleted a sentence about treatment costs before submitting, paused 42 seconds over the salary line, and rewrote the opening three times.

**How it works:** a collection gate sits at three points. Input: the submitted draft is used for the task, then discarded instead of logged. Behavior: the deletion, pause, and rewrites are not recorded. Derived: the inference firewall blocks profile writes, and each inferred attribute is labeled by whether it came from the submitted text or from behavior. A bare GPC signal turns on all three; a `--scope` list turns on any subset.

**What it shows:** without opt-outs, one email leaves a stored draft, three telemetry events, and four inferred attributes, two of them drawn from a sentence the user chose not to send. With all three opt-outs, every store is empty and each suppression is recorded. Blocking input and behavior alone does not stop the inference, which is why the derived gate exists. The polished email is identical in every mode.

See [prototype-6/README.md](prototype-6/README.md) for setup, demo, flowchart, and test instructions.

### 1.7 Prototype 7: Retention Limits Across Sessions

**Scenario:** a user talks to Aria, a memory-enabled assistant, across two sessions. In session 1 they mention being vegetarian on a tight budget while asking for dinner recipes. Session 2 asks for a restaurant and tests whether any of that carries forward.

**How it works:** a persistence gate sits at three points. `session`: at session end, transcripts and disclosed facts are discarded instead of archived. `cross_session`: at the start of a new session, the archive exists but returns nothing. `profile`: the step that turns past sessions into a behavioral profile is skipped. The scopes nest, so `session` also applies the other two and `cross_session` also applies `profile`. A bare GPC signal applies `session`.

**What it shows:** with no opt-outs, session 2 gets a tailored vegetarian suggestion and a profile is built. With `profile`, recall still works but no profile is built. With `cross_session`, Aria has to ask for preferences again. With `session`, nothing survives at all. Aria still uses what the user said earlier in the same session in every mode.

See [prototype-7/README.md](prototype-7/README.md) for setup, demo, and test instructions.

### 1.8 Prototype 8: Delegation Tiers with Decline by Default

**Scenario:** a user asks a travel agent to book a weekend trip. Finishing the job takes six actions: search flights, hold a hotel room, buy a non-refundable ticket with the card on file, send passport details to the airline, and, around the session, enable fare tracking and a newsletter. The six differ in how reversible, sensitive, and costly they are.

**How it works:** each action is assigned a tier: `autonomous` (the agent may just do it) or `ask_user` (the user must approve). The user's own assignments always win over the vendor's proposed defaults, and any action nobody assigned is treated as `ask_user`. If no user is available to answer, an `ask_user` action is declined rather than assumed. The GPC signal voids the vendor's proposed defaults, so consent is never inferred from a platform default. Every action passes through the gate before it reaches the MCP server.

**What it shows:** the silent baseline charges the card, sends the passport, enables tracking, and subscribes the user, four actions the user never granted. With enforcement, those actions are surfaced for approval or declined, while the searches and the hotel hold still run on their own.

See [prototype-8/README.md](prototype-8/README.md) for setup, demo, and test instructions.

## 2. Shared Infrastructure

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
