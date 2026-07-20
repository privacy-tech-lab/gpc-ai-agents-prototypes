/**
 * Evidence for the dedicated-field proposal (see proposal-dedicated-field/
 * and the "Proposal: a dedicated opt-out field" section of the README).
 *
 * Unlike mcp/tests/schema_gap.test.js, this is not a validation-stripping
 * test: @a2a-js/sdk ships no zod/ajv and does no runtime schema validation
 * (confirmed: no such dependency in its package.json), so a privacySignals
 * field placed on a Message would simply ride along at runtime today,
 * nothing removes it.
 *
 * The real gap is a documented-contract one: this test reads the Message
 * interface directly out of the installed @a2a-js/sdk's own shipped type
 * declarations and proves privacySignals is not one of its fields, while
 * metadata is. No compliant client, codegen tool, or future stricter
 * implementation has a reason to read a field the type contract never
 * declared, so it is invisible in practice even though nothing strips it
 * on the wire.
 */

const fs = require('fs');
const path = require('path');

function findDeclaredDtsFiles() {
  // "@a2a-js/sdk"'s package.json is not itself part of its exports map, so it
  // can't be require.resolve()'d directly. Resolve the main entry instead
  // (dist/index.cjs) and walk up to the package root.
  const distDir = path.dirname(require.resolve('@a2a-js/sdk'));
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.d.ts') || entry.name.endsWith('.d.cts')) out.push(full);
    }
  })(distDir);
  return out;
}

// Locate the shipped `Message` interface: "The message object being sent to
// the agent." Bundled builds re-export it under a few aliased names
// (Message, Message1, ...); they are the same type, so the first match is
// representative.
function findMessageInterfaceFields() {
  for (const file of findDeclaredDtsFiles()) {
    const src = fs.readFileSync(file, 'utf8');
    const match = src.match(
      /The message object being sent to the agent\.\s*\*\/\s*interface\s+\w+\s*\{([\s\S]*?)\n\}/,
    );
    if (match) {
      const fields = [...match[1].matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1]);
      return { file, fields };
    }
  }
  return null;
}

describe('A2A Message type contract gap', () => {
  test('the real installed @a2a-js/sdk Message type has no privacy/opt-out field', () => {
    const found = findMessageInterfaceFields();
    expect(found).not.toBeNull();

    // metadata is the generic bag; A2A's equivalent of MCP's _meta
    expect(found.fields).toContain('metadata');
    // extensions only carries URIs declaring an extension is present, not its payload
    expect(found.fields).toContain('extensions');
    // no dedicated privacy/opt-out field exists in the shipped type contract
    expect(found.fields).not.toContain('privacySignals');
    expect(found.fields).not.toContain('privacy');
    expect(found.fields).not.toContain('optOut');
  });
});
