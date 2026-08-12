# Diagram standard

One visual language for every opt-out typology flowchart, so 18 figures read as one set.

The standard is enforced by [generate.js](generate.js) rather than by discipline. Node roles map to fixed styles in one table at the top of that file; changing a color there changes all 18 figures at once.

## Files

| File | What it is |
|---|---|
| `diagrams.js` | The 18 diagram specs. Content lives here. |
| `generate.js` | Styles, layout, and draw.io XML emitter. Appearance lives here. |
| `opt-out-typology.drawio` | Generated. One file, 18 pages, one page per figure. |

```bash
cd paper-diagrams
node generate.js
```

Open `opt-out-typology.drawio` in draw.io. It edits like any hand-drawn file. Regenerating overwrites manual edits, so change `diagrams.js` and regenerate rather than editing the output directly.

## The 18 figures

13 subtypes plus 5 category overviews. C1a and C2a are sub-subtypes and share a page with their parent, which is why the count is 18 and not 20.

| Category | Pages |
|---|---|
| A: Presence | Category A, A1 Integration, A2 Activation |
| B: Collection | Category B, B1 Input, B2 Behavioral, B3 Derived |
| C: Use | Category C, C1 Primary use, C2 Secondary use, C3 Repurposing, C4 Sharing |
| D: Persistence | Category D, D1 Session, D2 Cross-session, D3 Profile |
| E: Delegation | Category E, E1 Delegation |

One scenario per category, carried across all of that category's pages, so a reader who follows a category from overview to subtype stays in the same story:

| Category | Scenario |
|---|---|
| A | NoteFlow, a note app that ships AI in an update |
| B | ComposeMate, polishing one email |
| C | HealthAssist, one blood pressure question |
| D | Aria, a memory-enabled assistant across two sessions |
| E | TripPilot, booking a weekend trip |

## Node roles

Five roles, white background throughout. Color carries meaning, so nothing is tinted for decoration.

| Role | Shape | Fill | Stroke | Means |
|---|---|---|---|---|
| `step` | rectangle | `#FFFFFF` | `#333333` | Ordinary pipeline step |
| `decision` | diamond | `#FFFFFF` | `#333333` | A branch point |
| `enforced` | rectangle | `#5B8DEF` | `#2F5FCE` | The opt-out acted here: blocked, suppressed, discarded, minimized |
| `respected` | rectangle | `#D5E8D4` | `#82B366` | Terminal where the outcome honors the opt-out |
| `violated` | rectangle | `#F8CECC` | `#B85450` | Terminal where it does not |

Blue is the load-bearing color: it marks the one place in each figure where the signal changed what the system did. The permitted path stays white so the contrast is visible at a glance. Green and red mark end states only, matching the typology document's own diagrams.

## Edges

| Kind | Style | Use |
|---|---|---|
| Flow | solid, orthogonal, `#333333`, arrow | Control flow between steps |
| Annotation | dashed, `#2F5FCE`, open arrow | From a typology label to the node it describes |

Edge labels are lowercase and plain: `yes`, `no`, `no, on demand`, `no user available`. Protocol hops use their own wording where relevant: `MCP _meta.gpc`, `A2A Message.metadata.gpc`.

## Annotation labels

Blue box, left aligned, placed to the right of the flow, dashed line pointing at the node it explains.

Format: subtype id, short name, colon, one plain sentence of what is enforced.

> B3 derived collection opt-out: enforced at the storage boundary, so the inference is computed but never kept

No em dashes anywhere, per [CONTRIBUTING.md](../CONTRIBUTING.md). Use a colon or a comma.

## Layout

Top to bottom. Nodes are ranked by longest path from the entry node, so an arrow always points at a strictly lower row and the figure reads downward. Rows are centered on a shared axis. Annotations sit in a right-hand column, vertically aligned to their target.

Sizes are fixed so figures scale consistently in print: 210 by 60 for steps, 190 by 90 for decisions, 250 by 78 for annotations, 46 horizontal gap, 66 vertical gap.

## Adding or changing a figure

Edit `diagrams.js` and regenerate. A spec looks like this:

```js
{
  id: 'b1',                    // stable page id
  name: 'B1 Input',            // tab label
  title: 'B1: input collection opt-out. What you knowingly submit',
  nodes: [
    { id: 'submit', label: 'User submits a draft\nand an instruction' },
    { id: 'q', label: 'B1 asserted?', decision: true },
    { id: 'drop', label: 'Used to complete the task,\nthen discarded', role: 'enforced' },
  ],
  edges: [
    { from: 'submit', to: 'q' },
    { from: 'q', to: 'drop', label: 'yes' },
  ],
  notes: [
    { target: 'drop', text: 'B1 input collection opt-out: material completes the task and is not retained beyond it' },
  ],
}
```

`generate.js` validates before writing: duplicate page ids, duplicate node ids, edges pointing at nodes that do not exist, notes targeting nodes that do not exist, and unknown roles all fail loudly rather than producing a broken figure.

## Conventions worth keeping

- Keep subtype figures to roughly 5 to 10 nodes. Category overviews may run larger since they carry the whole flow.
- Every figure should make the same point visually: the task output is unchanged, and only the blue node differs between modes.
- Where a subtype has an explicit exemption in the typology, draw the exempt path rather than omitting it. A2's foreground on-demand branch and D1's within-session branch both exist for this reason.
- Where subtypes imply one another, say so in the annotation rather than drawing extra arrows. C1 implies C1a, C2 implies C2a, D1 implies D2 and D3, D2 implies D3.
