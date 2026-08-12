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
const LEFT = 40;
// Width reserved in a row for a long edge passing through it.
const LANE_W = 30;

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

  // Expand the graph so no edge skips a row. An edge spanning several ranks
  // gets an invisible placeholder in each row it crosses, which reserves a
  // lane for it. Without that reservation, draw.io routes the long edge
  // straight over whatever box happens to sit in the way and drops the edge
  // label on top of that box's text.
  const items = spec.nodes.map(n => ({ id: n.id, node: n, rank: rank.get(n.id) }));
  const routes = new Map();
  spec.edges.forEach((e, i) => {
    if (rank.get(e.to) - rank.get(e.from) <= 1) return;
    const chain = [];
    for (let r = rank.get(e.from) + 1; r < rank.get(e.to); r++) {
      const id = `__lane${i}_${r}`;
      items.push({ id, dummy: true, rank: r });
      chain.push(id);
    }
    routes.set(i, chain);
  });

  const wOf = it => (it.dummy ? LANE_W : widthOf(it.node));
  const hOf = it => (it.dummy ? 0 : heightOf(it.node));

  // Parent lists over the expanded graph, so a placeholder inherits the
  // horizontal pull of whatever it is carrying.
  const parents = new Map(items.map(it => [it.id, []]));
  spec.edges.forEach((e, i) => {
    const chain = routes.get(i);
    if (!chain) {
      parents.get(e.to).push(e.from);
      return;
    }
    let prev = e.from;
    for (const d of chain) {
      parents.get(d).push(prev);
      prev = d;
    }
    parents.get(e.to).push(prev);
  });

  const rows = new Map();
  for (const it of items) {
    if (!rows.has(it.rank)) rows.set(it.rank, []);
    rows.get(it.rank).push(it);
  }
  const ranks = [...rows.keys()].sort((a, b) => a - b);

  const rowWidth = r => r.reduce((sum, it) => sum + wOf(it), 0) + GAP_X * (r.length - 1);
  const widest = Math.max(...[...rows.values()].map(rowWidth));
  const axis = LEFT + widest / 2;

  const pos = new Map();
  const center = new Map();
  const rowTop = new Map();
  let y = TOP;

  for (const r of ranks) {
    const row = rows.get(r);
    const rowHeight = Math.max(...row.map(hOf));
    rowTop.set(r, y);

    // Each item wants to sit under the average of its parents. Ties and
    // overlaps are broken by sliding right, then the whole row slides back
    // so it stays balanced on the parents rather than drifting rightward.
    const want = row.map(it => {
      const ps = parents.get(it.id).filter(p => center.has(p));
      const c = ps.length ? ps.reduce((s, p) => s + center.get(p), 0) / ps.length : axis;
      return { it, c };
    });
    want.sort((a, b) => a.c - b.c);

    let cursor = -Infinity;
    for (const w of want) {
      w.x = Math.max(w.c - wOf(w.it) / 2, cursor);
      cursor = w.x + wOf(w.it) + GAP_X;
    }
    const drift =
      want.reduce((s, w) => s + (w.x + wOf(w.it) / 2 - w.c), 0) / want.length;
    for (const w of want) w.x -= drift;

    const spill = LEFT - Math.min(...want.map(w => w.x));
    if (spill > 0) for (const w of want) w.x += spill;

    for (const w of want) {
      pos.set(w.it.id, {
        x: w.x,
        y: y + (rowHeight - hOf(w.it)) / 2,
        w: wOf(w.it),
        h: hOf(w.it),
      });
      center.set(w.it.id, w.x + wOf(w.it) / 2);
    }
    y += rowHeight + GAP_Y;
  }

  // Waypoints for the long edges, one per row they cross. The turn sits in
  // the empty band above the row, so the sideways move never happens at the
  // height of a box.
  const waypoints = new Map();
  for (const [i, chain] of routes) {
    const first = rank.get(spec.edges[i].from) + 1;
    waypoints.set(
      i,
      chain.map((id, j) => ({
        x: Math.round(pos.get(id).x + pos.get(id).w / 2),
        y: Math.round(rowTop.get(first + j) - GAP_Y / 2),
      }))
    );
  }

  // Annotations sit beside their target, on whichever side of the flow that
  // target is nearer to, so the dashed line does not cross the diagram.
  const flowLeft = Math.min(...spec.nodes.map(n => pos.get(n.id).x));
  const flowRight = Math.max(...spec.nodes.map(n => pos.get(n.id).x + pos.get(n.id).w));
  const mid = (flowLeft + flowRight) / 2;
  (spec.notes || []).forEach((note, i) => {
    const t = pos.get(note.target);
    pos.set(`note_${note.target}_${i}`, {
      x: t && t.x + t.w / 2 < mid ? flowLeft - 70 - W.note : flowRight + 70,
      y: t ? t.y + t.h / 2 - H.note / 2 : TOP + i * (H.note + 20),
      w: W.note,
      h: H.note,
    });
  });

  // A note on the left can run past the margin, so slide the page back.
  const spillLeft = LEFT - Math.min(...[...pos.values()].map(p => p.x));
  if (spillLeft > 0) {
    for (const p of pos.values()) p.x += spillLeft;
    for (const via of waypoints.values()) for (const pt of via) pt.x += spillLeft;
  }

  const right = Math.max(...[...pos.values()].map(p => p.x + p.w));
  return { pos, waypoints, canvasWidth: right + LEFT, canvasHeight: y + 40 };
}

const esc = s =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '&#10;');

function cellsFor(spec) {
  const { pos, waypoints, canvasWidth, canvasHeight } = layout(spec);
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
    const via = waypoints.get(i);
    const geometry = via
      ? `<mxGeometry relative="1" as="geometry"><Array as="points">` +
        via.map(p => `<mxPoint x="${p.x}" y="${p.y}"/>`).join('') +
        `</Array></mxGeometry>`
      : `<mxGeometry relative="1" as="geometry"/>`;
    out.push(
      `        <mxCell id="e${i}" value="${esc(e.label || '')}" style="${EDGE}" edge="1" parent="1" source="${e.from}" target="${e.to}">` +
        `${geometry}</mxCell>`
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
