# Architecture A: Tool-Level Blocking, Compared Across Protocols

## What it demonstrates

A user with GPC enabled asks an AI assistant to plan a 5-day trip to Japan. The assistant searches the web, synthesises an itinerary, and (without GPC) saves the result to the user's profile and logs the interaction. With GPC on, storage is blocked mid-call; retrieval and the answer are not.

This scenario is implemented twice, once per agent-communication protocol, so the same enforcement question can be asked of each: **where does the opt-out signal actually live in a tool call, and what happens to it if the protocol has no field meant for it?**

- [`mcp/`](mcp/README.md) — implemented over the Model Context Protocol (MCP).
- [`a2a/`](a2a/README.md) — implemented over the Agent2Agent Protocol (A2A).

Each implementation covers two variants:

1. **Current**: the signal riding in whatever generic metadata bag the protocol already offers.
2. **Proposed**: a dedicated top-level field, sibling to the protocol's other request fields, plus a test against the real, installed SDK proving why the current approach is the only one that survives today.

## Protocols compared

| | Today (current) | Proposed | Real-SDK evidence |
|---|---|---|---|
| **MCP** | `_meta.gpc`, an unnamespaced key in MCP's generic `_meta` envelope | `privacySignals: { gpc: true }`, a top-level field alongside `name`/`arguments`/`_meta` | `@modelcontextprotocol/sdk`'s `CallToolRequestSchema.parse()` silently strips `privacySignals`; `_meta` survives. A **validation-stripping gap**. |
| **A2A** | `metadata.gpc`, A2A's equivalent open bag, optionally paired with a declared `extensions` URI | `privacySignals: { gpc: true }`, a top-level field alongside `metadata`/`parts`/`extensions` | `@a2a-js/sdk`'s `Message` type declares nine fields; `privacySignals` isn't one of them, `metadata` is. Nothing strips it at runtime (the SDK does no schema validation), but no compliant reader has a reason to look for it. A **documented-contract gap**, not a validation-stripping one. |

Two different protocols, two different flavors of the same underlying hack: a privacy opt-out signal common and consequential enough across tool/agent calls to deserve a first-class field of its own, not a key buried in a bag meant for anything.

---

See [`mcp/README.md`](mcp/README.md) and [`a2a/README.md`](a2a/README.md) for setup, demo, and test instructions for each.
