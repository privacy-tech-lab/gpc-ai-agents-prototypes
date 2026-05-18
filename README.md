# GPC AI Agents Prototypes

This repository contains experimental prototypes exploring how the Global Privacy Control (GPC) signal can be propagated, preserved, and enforced across multi-agent AI pipelines. Each prototype simulates a realistic agentic workflow spanning orchestrators, sub-agents, tool servers, and third-party service boundaries, and tests whether a GPC opt-out survives the full chain intact.

---

## Architecture A: Simple Pipeline

### Summary

Architecture A demonstrates GPC signal propagation through a four-layer pipeline in which a user asks an AI assistant to research a topic and save a summary to their profile. The scenario naturally exercises every enforcement layer:

- **Layer 1 (Transport):** The GPC signal is written into the W3C `baggage` HTTP header at the orchestrator entry point. OpenTelemetry-style propagation forwards it automatically on every outbound call without per-agent code.
- **Layer 2 (Agent protocol):** The orchestrator embeds the signal in the `_meta` field of each MCP tool-call envelope so every downstream agent receives it alongside the task arguments.
- **Layer 3 (Trust boundary):** Before any call crosses to the simulated third-party vendor, the orchestrator obtains a signed RS256 JWT from a local identity provider. The JWT carries a `gpc` claim. The vendor verifies the signature independently and rejects writes when `gpc=true`.
- **Layer 4 (Data layer):** The MCP server wraps every tool handler with a `withGpc()` policy interceptor. If `gpc=1` appears in the incoming `_meta` and the tool is marked sensitive, the interceptor returns a blocked response without executing.

The prototype includes a **signal-drop experiment** in which one agent strips the `_meta` field before forwarding. This causes Layer 4 enforcement to fail silently while Layer 3 (the JWT) continues to hold, providing empirical motivation for a spec-level requirement to propagate the metadata field.

**Tools exposed by the MCP server**

| Tool | GPC-sensitive |
|---|---|
| `user_profile_lookup` | Yes |
| `save_to_profile` | Yes |
| `log_interaction` | Yes |
| `search_web` | No |

**Without GPC:** the user gets a personalized response, their query is logged, their profile is updated, and the result is stored in the third-party vector store.

**With GPC:** the search still runs and the response is returned, but nothing is stored anywhere and no personal data is accessed.

---

### Prerequisites

- Node.js 18 or later (native `fetch` required). Install via Homebrew: `brew install node`
- npm (bundled with Node.js)
- [Ollama](https://ollama.com) for the AI agent runs

### Running locally

```bash
# 1. Clone the repository
git clone <repo-url>
cd gpc-ai-agents-prototypes/architecture-a

# 2. Install dependencies
npm install

# 3. Generate the RSA keypair used for JWT signing
node -e "
const crypto = require('crypto');
const fs = require('fs');
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
fs.writeFileSync('keys/private.pem', privateKey);
fs.writeFileSync('keys/public.pem',  publicKey);
"

# 4. Run the scripted demo (no model required)
#    Baseline, GPC, signal-drop runs followed by a comparison report
npm run demo
```

Individual scripted runs:

```bash
npm run baseline      # GPC off  — all tools execute
npm run gpc           # GPC on   — sensitive tools blocked
npm run signal-drop   # GPC on, but one agent strips _meta
npm run compare       # Print the comparison report from existing output files
```

#### AI agent runs (Ollama)

The AI runs use a local LLM via Ollama. The model autonomously decides which tools to call; the same GPC enforcement layer applies.

Recommended models (tool use support required):

```bash
ollama pull llama3.1   # 8 B — best balance of speed and reliability
ollama pull qwen2.5    # 7 B — strong at following tool schemas
```

Start Ollama, then run:

```bash
npm run ai-baseline    # GPC off  — model calls all tools, data is written
npm run ai-gpc         # GPC on   — model receives blocked responses, data is not written
npm run ai-demo        # Both runs back to back
```

To use a different model:

```bash
OLLAMA_MODEL=qwen2.5 npm run ai-gpc
```

Run the test suite:

```bash
npm test
```

---

### Expected results

#### Baseline run (`npm run baseline`)

All five operations complete and data is written to disk:

- `user_profile_lookup` — returns the user's existing profile (or null on first run)
- `log_interaction` — appends an entry to `output/interaction_log.jsonl`
- `save_to_profile` — updates `output/profiles.json`
- `search_web` — returns simulated search results
- `third_party_store` — writes an entry to `output/vector_store.json`

#### GPC run (`npm run gpc`)

The search executes; all personal-data operations are blocked before touching storage:

- `user_profile_lookup` — `{ "status": "blocked", "reason": "gpc_opt_out" }`
- `log_interaction` — `{ "status": "blocked", "reason": "gpc_opt_out" }`
- `save_to_profile` — `{ "status": "blocked", "reason": "gpc_opt_out" }`
- `search_web` — executes normally
- `third_party_store` — `{ "status": "blocked", "reason": "gpc_opt_out", "layer": "trust_boundary_jwt" }`

The interaction log and vector store do not grow between GPC runs.

#### Signal-drop experiment (`npm run signal-drop`)

The Baggage header still carries `gpc=1`, but the data agent strips the `_meta` field before calling tools. Layer 4 (MCP policy) fails: the three sensitive MCP tools execute as if GPC were off. Layer 3 (JWT) holds: the third-party store remains blocked because the JWT was signed by the orchestrator before the drop.

#### Comparison report (`npm run compare`)

```
Tool                         | Baseline     | GPC          | Signal-drop
--------------------------------------------------------------------
search_web                   | ok           | ok           | ok
user_profile_lookup          | ok           | BLOCKED      | ok
log_interaction              | ok           | BLOCKED      | ok
save_to_profile              | ok           | BLOCKED      | ok
third_party_store            | ok           | BLOCKED      | BLOCKED
```

The signal-drop section of the report identifies which MCP tools ran despite the opt-out and confirms that the JWT trust-boundary backstop held.

#### Test suite (`npm test`)

49 tests across four files, all expected to pass:

- `tests/gpc_policy.test.js` — unit tests for the `withGpc()` interceptor
- `tests/baggage.test.js` — unit tests for W3C Baggage encode/decode helpers
- `tests/identity_provider.test.js` — unit tests for JWT sign and verify
- `tests/orchestrator.test.js` — integration tests covering all four layers

---

## Copyright

Copyright 2024 Privacy Tech Lab at Wesleyan University.

Licensed under the MIT License. See [LICENSE](LICENSE) for details.
