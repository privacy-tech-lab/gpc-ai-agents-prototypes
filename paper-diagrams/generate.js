'use strict';

/**
 * generate.js
 *
 * Emits opt-out-typology.drawio: one draw.io file, one page per diagram,
 * from the specs in diagrams.js.
 *
 * The point of generating rather than drawing is that the visual standard
 * in DIAGRAM_STANDARD.md holds by construction. Every node of a given role
 * gets the same fill, every edge the same stroke, every rank the same
 * spacing. Editing a color here changes all 18 diagrams at once.
 *
 * Output opens and edits in draw.io like any hand-drawn file.
 *
 *   node generate.js
 */

const fs = require('fs');
const path = require('path');
const { DIAGRAMS } = require('./diagrams');

// Visual standard: four node roles, light background. See DIAGRAM_STANDARD.md.

const FONT = 'fontFamily=Helvetica;fontSize=12;';

const STYLE = {
  // Ordinary pipeline step.
  step: `rounded=0;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=#333333;fontColor=#000000;${FONT}`,
  // Decision point.
  decision: `rhombus;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=#333333;fontColor=#000000;${FONT}`,
  // The opt-out acted here: blocked, suppressed, discarded, minimized.
  enforced: `rounded=0;whiteSpace=wrap;html=1;fillColor=#5B8DEF;strokeColor=#2F5FCE;fontColor=#FFFFFF;${FONT}`,
  // Terminal where the opt-out was honored.
  respected: `rounded=0;whiteSpace=wrap;html=1;fillColor=#D5E8D4;strokeColor=#82B366;fontColor=#000000;${FONT}`,
  // Terminal where it was not.
  violated: `rounded=0;whiteSpace=wrap;html=1;fillColor=#F8CECC;strokeColor=#B85450;fontColor=#000000;${FONT}`,
  // Typology annotation label.
  note: `rounded=0;whiteSpace=wrap;html=1;fillColor=#5B8DEF;strokeColor=#2F5FCE;fontColor=#FFFFFF;align=left;spacingLeft=8;${FONT}`,
  // Page title.
  title: 'text;html=1;align=left;verticalAlign=middle;fontFamily=Helvetica;fontSize=16;fontStyle=1;fontColor=#000000;',
};

const EDGE = 'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;strokeColor=#333333;fontColor=#000000;fontFamily=Helvetica;fontSize=11;labelBackgroundColor=#FFFFFF;';
const NOTE_EDGE = 'edgeStyle=none;html=1;dashed=1;endArrow=open;endSize=8;strokeColor=#2F5FCE;';

const W = { step: 210, decision: 190, note: 250 };
const H = { step: 60, decision: 90, note: 78 };
const GAP_X = 46;
const GAP_Y = 66;
const TITLE_Y = 20;
const TOP = 90;

const roleOf = n => n.role || (n.decision ? 'decision' : 'step');
const widthOf = n => (n.decision ? W.decision : W.step);
const heightOf = n => (n.decision ? H.decision : H.step);

/**
 * Rank nodes top-down by longest path from any source, so an edge always
 * points at a strictly lower row and the flow reads downward.
 */
function rankNodes(nodes, edges) {
  const rank = new Map(nodes.map(n => [n.id, 0]));
  const incoming = new Map(nodes.map(n => [n.id, []]));
  for (const e of edges) incoming.get(e.to).push(e.from);

  // Iterate to a fixed point. Diagrams are tiny, so this is cheap and it
  // tolerates the occasional back edge without special-casing cycles.
  for (let pass = 0; pass < nodes.length; pass++) {
    let moved = false;
    for (const n of nodes) {
      const parents = incoming.get(n.id);
      if (!parents.length) continue;
      const want = Math.max(...parents.map(p => rank.get(p) + 1));
      if (want > rank.get(n.id)) {
        rank.set(n.id, want);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return rank;
}

function layout(spec) {
  const rank = rankNodes(spec.nodes, spec.edges);

  const rows = new Map();
  for (const n of spec.nodes) {
    const r = rank.get(n.id);
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r).push(n);
  }

  // Every row is centered on the same axis, set by the widest row.
  const rowWidth = r => r.reduce((sum, n) => sum + widthOf(n), 0) + GAP_X * (r.length - 1);
  const widest = Math.max(...[...rows.values()].map(rowWidth));

  const pos = new Map();
  let y = TOP;
  for (const r of [...rows.keys()].sort((a, b) => a - b)) {
    const row = rows.get(r);
    let x = 40 + (widest - rowWidth(row)) / 2;
    const rowHeight = Math.max(...row.map(heightOf));
    for (const n of row) {
      pos.set(n.id, {
        x,
        y: y + (rowHeight - heightOf(n)) / 2,
        w: widthOf(n),
        h: heightOf(n),
      });
      x += widthOf(n) + GAP_X;
    }
    y += rowHeight + GAP_Y;
  }

  // Annotations sit to the right of the widest row, beside their target.
  const noteX = 40 + widest + 70;
  (spec.notes || []).forEach((note, i) => {
    const t = pos.get(note.target);
    pos.set(`note_${note.target}_${i}`, {
      x: noteX,
      y: t ? t.y + t.h / 2 - H.note / 2 : TOP + i * (H.note + 20),
      w: W.note,
      h: H.note,
    });
  });

  return { pos, canvasWidth: noteX + W.note + 40, canvasHeight: y + 40 };
}

const esc = s =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '&#10;');

function cellsFor(spec) {
  const { pos, canvasWidth, canvasHeight } = layout(spec);
  const out = [];

  out.push(
    `        <mxCell id="title" value="${esc(spec.title)}" style="${STYLE.title}" vertex="1" parent="1">` +
      `<mxGeometry x="40" y="${TITLE_Y}" width="${canvasWidth - 80}" height="30" as="geometry"/></mxCell>`
  );

  for (const n of spec.nodes) {
    const p = pos.get(n.id);
    out.push(
      `        <mxCell id="${n.id}" value="${esc(n.label)}" style="${STYLE[roleOf(n)]}" vertex="1" parent="1">` +
        `<mxGeometry x="${Math.round(p.x)}" y="${Math.round(p.y)}" width="${p.w}" height="${p.h}" as="geometry"/></mxCell>`
    );
  }

  (spec.notes || []).forEach((note, i) => {
    const id = `note_${note.target}_${i}`;
    const p = pos.get(id);
    out.push(
      `        <mxCell id="${id}" value="${esc(note.text)}" style="${STYLE.note}" vertex="1" parent="1">` +
        `<mxGeometry x="${Math.round(p.x)}" y="${Math.round(p.y)}" width="${p.w}" height="${p.h}" as="geometry"/></mxCell>`
    );
    out.push(
      `        <mxCell id="${id}_edge" style="${NOTE_EDGE}" edge="1" parent="1" source="${id}" target="${note.target}">` +
        `<mxGeometry relative="1" as="geometry"/></mxCell>`
    );
  });

  spec.edges.forEach((e, i) => {
    out.push(
      `        <mxCell id="e${i}" value="${esc(e.label || '')}" style="${EDGE}" edge="1" parent="1" source="${e.from}" target="${e.to}">` +
        `<mxGeometry relative="1" as="geometry"/></mxCell>`
    );
  });

  return { cells: out.join('\n'), canvasWidth, canvasHeight };
}

function pageFor(spec) {
  const { cells, canvasWidth, canvasHeight } = cellsFor(spec);
  return [
    `  <diagram id="${spec.id}" name="${esc(spec.name)}">`,
    `    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${canvasWidth}" pageHeight="${canvasHeight}" background="#FFFFFF" math="0" shadow="0">`,
    '      <root>',
    '        <mxCell id="0"/>',
    '        <mxCell id="1" parent="0"/>',
    cells,
    '      </root>',
    '    </mxGraphModel>',
    '  </diagram>',
  ].join('\n');
}

function validate() {
  const seen = new Set();
  for (const d of DIAGRAMS) {
    if (seen.has(d.id)) throw new Error(`Duplicate diagram id: ${d.id}`);
    seen.add(d.id);
    const ids = new Set(d.nodes.map(n => n.id));
    if (ids.size !== d.nodes.length) throw new Error(`${d.id}: duplicate node id`);
    for (const e of d.edges) {
      if (!ids.has(e.from)) throw new Error(`${d.id}: edge from unknown node "${e.from}"`);
      if (!ids.has(e.to)) throw new Error(`${d.id}: edge to unknown node "${e.to}"`);
    }
    for (const n of d.notes || []) {
      if (!ids.has(n.target)) throw new Error(`${d.id}: note targets unknown node "${n.target}"`);
    }
    for (const n of d.nodes) {
      if (!STYLE[roleOf(n)]) throw new Error(`${d.id}: node "${n.id}" has unknown role "${roleOf(n)}"`);
    }
  }
}

function main() {
  validate();

  const xml = [
    '<mxfile host="app.diagrams.net" type="device">',
    DIAGRAMS.map(pageFor).join('\n'),
    '</mxfile>',
    '',
  ].join('\n');

  const outPath = path.join(__dirname, 'opt-out-typology.drawio');
  fs.writeFileSync(outPath, xml);
  console.log(`Wrote ${path.basename(outPath)}: ${DIAGRAMS.length} pages`);
  for (const d of DIAGRAMS) {
    console.log(`  ${d.name.padEnd(30)} ${String(d.nodes.length).padStart(2)} nodes, ${String(d.edges.length).padStart(2)} edges`);
  }
}

main();
