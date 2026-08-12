'use strict';

/**
 * mermaid.js
 *
 * Emits the same 18 figures as Mermaid source, in the idiom already used by
 * the architecture READMEs: flowchart TD, quoted labels, `-- "label" -->`
 * edges, `{"..."}` decisions, and a `category` classDef for the nodes the
 * opt-out acts on.
 *
 * Paste a block into draw.io with Extras > Insert > Advanced > Mermaid, and
 * pick Image rather than Diagram.
 *
 *   node mermaid.js
 *
 * Writes mermaid/NN-slug.mmd for each figure plus MERMAID.md holding all 18
 * in one place for copy and paste.
 */

const fs = require('fs');
const path = require('path');
const { DIAGRAMS } = require('./diagrams');

// Blue is carried over verbatim from the architecture READMEs, so the typology
// figures and the architecture figures read as one set. Green and red mark end
// states only.
const CLASSDEFS = [
  'classDef category fill:#5b8def,stroke:#2f5fce,color:#fff',
  'classDef respected fill:#d5e8d4,stroke:#82b366,color:#000',
  'classDef violated fill:#f8cecc,stroke:#b85450,color:#000',
];

// Node roles map onto those class names. Plain steps and decisions stay
// unstyled, which is what makes the colored nodes carry meaning.
const CLASS_FOR = { enforced: 'category', respected: 'respected', violated: 'violated' };

const slug = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Mermaid keywords cannot be used as node ids. `end` is the one that bites,
// since Category D has a node for a session ending, and Mermaid reads it as
// the close of a subgraph.
const RESERVED = new Set([
  'end', 'graph', 'subgraph', 'class', 'classDef', 'click', 'style',
  'linkStyle', 'direction', 'default', 'call', 'href', 'o', 'x',
]);

// Ids allow letters, digits, and underscores, so this catches hyphens and the
// note ids as well as the keywords.
const ref = id => {
  const clean = id.replace(/[^A-Za-z0-9_]/g, '_');
  return RESERVED.has(clean) ? `n_${clean}` : clean;
};

// Quoted labels keep punctuation such as ? and : from being read as syntax.
// The literal backslash-n is what Mermaid takes as a line break.
const label = text => `"${String(text).replace(/"/g, "'").replace(/\n/g, '\\n')}"`;

const shape = node => (node.decision ? `{${label(node.label)}}` : `[${label(node.label)}]`);

function render(spec) {
  // The title is YAML, and every title here carries a colon, so it has to be
  // quoted or the front matter fails to parse.
  const lines = ['---', `title: ${label(spec.title)}`, '---', 'flowchart TD'];

  for (const n of spec.nodes) lines.push(`    ${ref(n.id)}${shape(n)}`);

  lines.push('');
  for (const e of spec.edges) {
    lines.push(
      e.label
        ? `    ${ref(e.from)} -- ${label(e.label)} --> ${ref(e.to)}`
        : `    ${ref(e.from)} --> ${ref(e.to)}`
    );
  }

  lines.push('');
  for (const def of CLASSDEFS) lines.push(`    ${def}`);

  for (const [role, className] of Object.entries(CLASS_FOR)) {
    const ids = spec.nodes.filter(n => n.role === role).map(n => ref(n.id));
    if (ids.length) lines.push(`    class ${ids.join(',')} ${className}`);
  }

  (spec.notes || []).forEach((note, i) => {
    const id = ref(`note${i + 1}_${note.target}`);
    lines.push(`    ${id}[${label(note.text)}]:::category -.-> ${ref(note.target)}`);
  });

  return lines.join('\n') + '\n';
}

function main() {
  const dir = path.join(__dirname, 'mermaid');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.mmd')) fs.unlinkSync(path.join(dir, f));
  }

  const doc = [
    '# Mermaid source',
    '',
    'The same 18 figures as [opt-out-typology.drawio](opt-out-typology.drawio), in Mermaid.',
    '',
    'To put one into a draw.io page: Extras > Insert > Advanced > Mermaid, paste the block, and pick Image rather than Diagram. They also render as is in a README or on GitHub.',
    '',
    'Generated from [diagrams.js](diagrams.js) by [mermaid.js](mermaid.js). Edit the spec and rerun `node mermaid.js` rather than editing these by hand.',
    '',
  ];

  DIAGRAMS.forEach((spec, i) => {
    const name = `${String(i + 1).padStart(2, '0')}-${slug(spec.name)}`;
    const source = render(spec);
    fs.writeFileSync(path.join(dir, `${name}.mmd`), source);
    doc.push(`## ${spec.name}`, '', '```mermaid', source.trimEnd(), '```', '');
    console.log(`  mermaid/${name}.mmd`);
  });

  fs.writeFileSync(path.join(__dirname, 'MERMAID.md'), doc.join('\n'));
  console.log(`Wrote ${DIAGRAMS.length} Mermaid figures and MERMAID.md`);
}

main();
