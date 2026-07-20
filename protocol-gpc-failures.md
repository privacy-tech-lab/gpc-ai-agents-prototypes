# Why `_meta` Is Not a Substitute for a Protocol-Level Field

There are two failure modes that make `_meta` unsuitable as a
place to carry a signal like an opt-out flag.

---

## Failure Mode 1: the field never survives validation

`CallToolRequestSchema` in `@modelcontextprotocol/sdk` builds `params` on
top of `BaseRequestParamsSchema`, which is defined roughly as:

```js
z.object({
  _meta: RequestMetaSchema.optional()
})
```

This is a [Zod](https://zod.dev) object schema with **no** `.passthrough()`
or `.strict()` applied, so it uses Zod's **default strip mode**:

| Zod mode | Behavior on unrecognized keys |
|---|---|
| `strict` | validation throws an error |
| **strip (default)** | **unrecognized keys are silently deleted** |
| `passthrough` | unrecognized keys are kept as-is |

**Consequence:** any top-level key placed directly on `params` (other than
`_meta`) is dropped when parsed through the real SDK.

This means `_meta` is not one convenient option among several for carrying
extension data; it is currently **the only key that survives** the
schema at all. 

---

## Failure Mode 2: no shared contract for what's inside `_meta`

Even granting that data placed inside `_meta` does survive, `_meta` itself
offers no interoperability guarantees, for three reasons:

### a) No schema enforcement on key names or value shapes
`_meta` is typed as an open bag (effectively `Record<string, unknown>`).
Nothing in the protocol specifies a canonical key name or type for any
given signal. Different implementations may independently choose:

- `_meta['optOut']`
- `_meta['mcp.optOut']`
- `_meta['skipTracking']`
- a boolean vs. an enum string vs. a nested object

There is no single key for a client or server to reliably check.

### b) No authority over who can set or overwrite it
Because `_meta` is unstructured, any party in the request path (client,
intermediate proxy, or the receiving server itself) can write to it
without restriction. A signal meant to represent genuine user intent (like
an opt-out) has no protection from being overwritten, stripped, or spoofed
by an intermediate layer. A protocol-level field can be given defined
semantics ("this field, if present, MUST be respected by conforming
servers"); a `_meta` convention carries no such weight.

### c) No cross-implementation guarantee
Since naming and shape are unstandardized, the same logical signal can work
between one client/server pair and do nothing between another. This is because the two sides chose different `_meta` keys. The field is present in the request, so nothing looks
wrong, but the receiving side never reads that particular key, and the
signal is ignored.