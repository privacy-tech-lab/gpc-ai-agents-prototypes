'use strict';

/**
 * diagrams.js
 *
 * The 18 diagram specs: one per subtype (13) plus one overview per
 * category (5). C1a and C2a are sub-subtypes and share a page with their
 * parent, which is why the count is 18 and not 20.
 *
 * Spec shape:
 *   id       stable page id, used as the draw.io diagram id
 *   name     short tab label
 *   title    heading drawn on the page
 *   nodes    [{ id, label, decision?, role? }]
 *              role: step (default) | decision | enforced | respected | violated
 *   edges    [{ from, to, label? }]
 *   notes    [{ target, text }]  typology annotation, dashed line to target
 *
 * One scenario per category, carried across that category's pages:
 *   A  NoteFlow, a note app that ships AI in an update
 *   B  ComposeMate, polishing one email
 *   C  HealthAssist, one blood pressure question
 *   D  Aria, a memory-enabled assistant across two sessions
 *   E  TripPilot, booking a weekend trip
 */

const DIAGRAMS = [
  // Category A: Presence
  {
    id: 'cat-a',
    name: 'Category A',
    title: 'Category A (Presence): opting out of AI being in your environment at all',
    nodes: [
      { id: 'install', label: 'User installs NoteFlow v1.0\nno AI features' },
      { id: 'update', label: 'v2.0 update ships an AI summarizer\nand an ambient copilot' },
      { id: 'a1q', label: 'A1: has the user affirmatively\nenabled this AI feature?', decision: true },
      { id: 'a1off', label: 'Feature stays off,\nacross later updates too', role: 'enforced' },
      { id: 'a2q', label: 'A2: is this invocation\npassive?', decision: true },
      { id: 'ondemand', label: 'User invoked it:\nintent already expressed', role: 'respected' },
      { id: 'ambq', label: 'Ambient mode\nexplicitly enabled?', decision: true },
      { id: 'ambon', label: 'Ambient AI runs', role: 'respected' },
      { id: 'amboff', label: 'Integrated but inactive', role: 'enforced' },
    ],
    edges: [
      { from: 'install', to: 'update' },
      { from: 'update', to: 'a1q' },
      { from: 'a1q', to: 'a1off', label: 'no' },
      { from: 'a1q', to: 'a2q', label: 'yes' },
      { from: 'a2q', to: 'ondemand', label: 'no, on demand' },
      { from: 'a2q', to: 'ambq', label: 'yes, passive' },
      { from: 'ambq', to: 'ambon', label: 'yes' },
      { from: 'ambq', to: 'amboff', label: 'no' },
    ],
    notes: [
      { target: 'a1off', text: 'A1 integration opt-out: AI added by an update is off until the user affirmatively enables it' },
      { target: 'amboff', text: 'A2 activation opt-out: passive AI needs its own grant, separate from A1' },
    ],
  },
  {
    id: 'a1',
    name: 'A1 Integration',
    title: 'A1: integration opt-out. How AI enters a system',
    nodes: [
      { id: 'install', label: 'User installs an app\nwith no AI features' },
      { id: 'update', label: 'Update ships a\nnew AI capability' },
      { id: 'q', label: 'Is the AI feature\noff by default?', decision: true },
      { id: 'active', label: 'AI runs without consent' },
      { id: 'viol', label: 'A1 violated:\ninherited, not chosen', role: 'violated' },
      { id: 'inactive', label: 'Feature stays inactive' },
      { id: 'prompt', label: 'User sees an opt-in prompt' },
      { id: 'optin', label: 'User actively opts in?', decision: true },
      { id: 'on', label: 'AI feature activates', role: 'respected' },
      { id: 'off', label: 'AI stays off indefinitely', role: 'enforced' },
    ],
    edges: [
      { from: 'install', to: 'update' },
      { from: 'update', to: 'q' },
      { from: 'q', to: 'active', label: 'no, shipped active' },
      { from: 'active', to: 'viol' },
      { from: 'q', to: 'inactive', label: 'yes, default off' },
      { from: 'inactive', to: 'prompt' },
      { from: 'prompt', to: 'optin' },
      { from: 'optin', to: 'on', label: 'yes' },
      { from: 'optin', to: 'off', label: 'no, or GPC declines' },
    ],
    notes: [
      { target: 'off', text: 'A1 integration opt-out: the decision persists through later platform updates until the user reverses it' },
    ],
  },
  {
    id: 'a2',
    name: 'A2 Activation',
    title: 'A2: activation opt-out. Whether AI is present without your active intent',
    nodes: [
      { id: 'device', label: 'App has AI features' },
      { id: 'how', label: 'How is the AI invoked?', decision: true },
      { id: 'fg', label: 'User presses a button\nor gives a command' },
      { id: 'fgok', label: 'Foreground, on-demand use:\nno separate opt-out needed', role: 'respected' },
      { id: 'passive', label: 'AI listens or acts\npassively in the background' },
      { id: 'ambq', label: 'Did the user explicitly\nenable ambient mode?', decision: true },
      { id: 'ambok', label: 'Ambient AI runs,\nA2 respected', role: 'respected' },
      { id: 'blocked', label: 'Blocked: integrated\nbut inactive', role: 'enforced' },
      { id: 'anyway', label: 'Ambient AI runs anyway' },
      { id: 'viol', label: 'A2 violated:\npresence without intent', role: 'violated' },
    ],
    edges: [
      { from: 'device', to: 'how' },
      { from: 'how', to: 'fg', label: 'explicit command' },
      { from: 'fg', to: 'fgok' },
      { from: 'how', to: 'passive', label: 'passive or ambient' },
      { from: 'passive', to: 'ambq' },
      { from: 'ambq', to: 'ambok', label: 'yes' },
      { from: 'ambq', to: 'blocked', label: 'no, enforced' },
      { from: 'ambq', to: 'anyway', label: 'no, unenforced' },
      { from: 'anyway', to: 'viol' },
    ],
    notes: [
      { target: 'blocked', text: 'A2 activation opt-out: governs unsolicited or ambient AI only, never foreground on-demand use' },
    ],
  },

  // Category B: Collection
  {
    id: 'cat-b',
    name: 'Category B',
    title: 'Category B (Collection): opting out of what gets gathered about you',
    nodes: [
      { id: 'submit', label: 'User submits a draft email\nand an instruction' },
      { id: 'b1q', label: 'B1 asserted?', decision: true },
      { id: 'b1keep', label: 'Raw draft retained\nin the input log' },
      { id: 'b1drop', label: 'Used for the task,\nthen discarded', role: 'enforced' },
      { id: 'tele', label: 'Platform observes composition:\ndeleted sentence, 42s pause,\n3 rewrites' },
      { id: 'b2q', label: 'B2 asserted?', decision: true },
      { id: 'b2keep', label: 'Telemetry recorded' },
      { id: 'b2drop', label: 'Events suppressed', role: 'enforced' },
      { id: 'cls', label: 'Classifier derives 4 attributes' },
      { id: 'b3q', label: 'B3 asserted?', decision: true },
      { id: 'b3keep', label: 'Attributes written,\n2 of them from behavior' },
      { id: 'b3drop', label: 'Inference firewall\nblocks the write', role: 'enforced' },
      { id: 'ans', label: 'Polished email returned,\nidentical in every mode', role: 'respected' },
    ],
    edges: [
      { from: 'submit', to: 'b1q' },
      { from: 'b1q', to: 'b1keep', label: 'no' },
      { from: 'b1q', to: 'b1drop', label: 'yes' },
      { from: 'b1keep', to: 'tele' },
      { from: 'b1drop', to: 'tele' },
      { from: 'tele', to: 'b2q' },
      { from: 'b2q', to: 'b2keep', label: 'no' },
      { from: 'b2q', to: 'b2drop', label: 'yes' },
      { from: 'b2keep', to: 'cls' },
      { from: 'b2drop', to: 'cls' },
      { from: 'cls', to: 'b3q' },
      { from: 'b3q', to: 'b3keep', label: 'no' },
      { from: 'b3q', to: 'b3drop', label: 'yes' },
      { from: 'b3keep', to: 'ans' },
      { from: 'b3drop', to: 'ans' },
    ],
    notes: [
      { target: 'b1drop', text: 'B1: what the user knowingly submits' },
      { target: 'b2drop', text: 'B2: what the user unknowingly generates' },
      { target: 'b3drop', text: 'B3: what the system concludes on its own. Possible only because B1 or B2 happened first' },
    ],
  },
  {
    id: 'b1',
    name: 'B1 Input',
    title: 'B1: input collection opt-out. What you knowingly submit',
    nodes: [
      { id: 'submit', label: 'User submits a draft\nand an instruction' },
      { id: 'task', label: 'Task runs:\nthe email is polished' },
      { id: 'q', label: 'B1 asserted?', decision: true },
      { id: 'log', label: 'Raw draft and instruction\nwritten to the input log' },
      { id: 'drop', label: 'Used to complete the task,\nthen discarded', role: 'enforced' },
      { id: 'empty', label: 'Input log stays empty', role: 'respected' },
    ],
    edges: [
      { from: 'submit', to: 'task' },
      { from: 'submit', to: 'q' },
      { from: 'q', to: 'log', label: 'no' },
      { from: 'q', to: 'drop', label: 'yes' },
      { from: 'drop', to: 'empty' },
    ],
    notes: [
      { target: 'drop', text: 'B1 input collection opt-out: material completes the task and is not logged, stored, or retained beyond it' },
    ],
  },
  {
    id: 'b2',
    name: 'B2 Behavioral',
    title: 'B2: behavioral collection opt-out. What you unknowingly generate',
    nodes: [
      { id: 'compose', label: 'User composes the draft' },
      { id: 'observe', label: 'Platform observes:\ndeleted sentence, 42s pause,\n3 rewrites' },
      { id: 'q', label: 'B2 asserted?', decision: true },
      { id: 'rec', label: 'Telemetry written to the\nbehavior log, including text\nthe user chose to delete' },
      { id: 'sup', label: 'Events suppressed', role: 'enforced' },
      { id: 'empty', label: 'Behavior log stays empty', role: 'respected' },
    ],
    edges: [
      { from: 'compose', to: 'observe' },
      { from: 'observe', to: 'q' },
      { from: 'q', to: 'rec', label: 'no' },
      { from: 'q', to: 'sup', label: 'yes' },
      { from: 'sup', to: 'empty' },
    ],
    notes: [
      { target: 'sup', text: 'B2 behavioral collection opt-out: hovers, hesitations, deletions, and corrections are not recorded' },
    ],
  },
  {
    id: 'b3',
    name: 'B3 Derived',
    title: 'B3: derived collection opt-out. What the system concludes about you',
    nodes: [
      { id: 'mat', label: 'Collected material:\ndraft text (B1) and\ntelemetry (B2)' },
      { id: 'cls', label: 'Classifier derives 4 attributes' },
      { id: 'q', label: 'B3 asserted?', decision: true },
      { id: 'write', label: 'Attributes written to the profile,\n2 of them from behavior\nthe user never shared' },
      { id: 'fw', label: 'Inference firewall\nblocks the write', role: 'enforced' },
      { id: 'audit', label: 'Profile stays empty,\nwould_have_written recorded', role: 'respected' },
    ],
    edges: [
      { from: 'mat', to: 'cls' },
      { from: 'cls', to: 'q' },
      { from: 'q', to: 'write', label: 'no' },
      { from: 'q', to: 'fw', label: 'yes' },
      { from: 'fw', to: 'audit' },
    ],
    notes: [
      { target: 'fw', text: 'B3 derived collection opt-out: enforced at the storage boundary, so the inference is computed but never kept' },
    ],
  },

  // Category C: Use
  {
    id: 'cat-c',
    name: 'Category C',
    title: 'Category C (Use): opting out of what collected data is used for',
    nodes: [
      { id: 'ask', label: 'Patient asks what a\n158/96 reading means' },
      { id: 'ans', label: 'Answer delivered,\nnever gated', role: 'respected' },
      { id: 'scope', label: 'Is this use within the task\nthe user invoked?', decision: true },
      { id: 'inscope', label: 'Permitted:\nanswering the question', role: 'respected' },
      { id: 'out', label: 'Outside the task context:\ninsurance (C1), personalization (C1a),\nanalytics (C2), ad targeting (C2a),\ntraining (C3)' },
      { id: 'gate', label: 'Corresponding subtype\nasserted?', decision: true },
      { id: 'runs', label: 'Use proceeds' },
      { id: 'blocked', label: 'Blocked,\nwould_have_written recorded', role: 'enforced' },
      { id: 'chain', label: 'Task delegates along\na sub-agent chain' },
      { id: 'c4q', label: 'C4 asserted?', decision: true },
      { id: 'full', label: 'Every hop receives\nthe full payload' },
      { id: 'min', label: 'Necessary hop minimized,\nunnecessary hop refused', role: 'enforced' },
    ],
    edges: [
      { from: 'ask', to: 'ans' },
      { from: 'ask', to: 'scope' },
      { from: 'scope', to: 'inscope', label: 'yes' },
      { from: 'scope', to: 'out', label: 'no' },
      { from: 'out', to: 'gate' },
      { from: 'gate', to: 'runs', label: 'no' },
      { from: 'gate', to: 'blocked', label: 'yes' },
      { from: 'ask', to: 'chain' },
      { from: 'chain', to: 'c4q' },
      { from: 'c4q', to: 'full', label: 'no' },
      { from: 'c4q', to: 'min', label: 'yes' },
    ],
    notes: [
      { target: 'blocked', text: 'C1, C1a, C2, C2a, C3: the boundary is context. Asserting C1 asserts C1a, asserting C2 asserts C2a' },
      { target: 'min', text: 'C4 sharing restriction: how far data travels along the chain the task itself created' },
    ],
  },
  {
    id: 'c1',
    name: 'C1 Primary use',
    title: 'C1: primary use restriction, with C1a personalization',
    nodes: [
      { id: 'data', label: 'Reading collected to answer\nthe patient question' },
      { id: 'q', label: 'Use beyond that task, even\nby the same platform?', decision: true },
      { id: 'within', label: 'Within scope:\nthe answer itself', role: 'respected' },
      { id: 'beyond', label: 'Beyond scope:\ninsurance risk model (C1),\npersonalization profile (C1a)' },
      { id: 'gate', label: 'C1 or C1a asserted?', decision: true },
      { id: 'reuse', label: 'Reading reused for underwriting;\nresponses tailored from\ninferred preferences' },
      { id: 'blocked', label: 'Blocked: data stays bound\nto the task context', role: 'enforced' },
    ],
    edges: [
      { from: 'data', to: 'q' },
      { from: 'q', to: 'within', label: 'no' },
      { from: 'q', to: 'beyond', label: 'yes' },
      { from: 'beyond', to: 'gate' },
      { from: 'gate', to: 'reuse', label: 'no' },
      { from: 'gate', to: 'blocked', label: 'yes' },
    ],
    notes: [
      { target: 'blocked', text: 'C1 primary use restriction. C1a personalization is its sub-subtype: asserting C1 asserts C1a' },
    ],
  },
  {
    id: 'c2',
    name: 'C2 Secondary use',
    title: 'C2: secondary use restriction, with C2a targeting',
    nodes: [
      { id: 'ex', label: 'The health exchange exists\non the platform' },
      { id: 'q', label: 'Commercial or analytical use\noutside the user task?', decision: true },
      { id: 'an', label: 'Analytics aggregation (C2)' },
      { id: 'ad', label: 'Pharma ad segment (C2a)' },
      { id: 'g1', label: 'C2 asserted?', decision: true },
      { id: 'g2', label: 'C2 or C2a asserted?', decision: true },
      { id: 'log', label: 'Query joins the analytics log' },
      { id: 'bl1', label: 'Blocked', role: 'enforced' },
      { id: 'targ', label: 'User added to the\nhypertension_candidates segment' },
      { id: 'bl2', label: 'Blocked: data does not decide\nwhat the user is shown', role: 'enforced' },
    ],
    edges: [
      { from: 'ex', to: 'q' },
      { from: 'q', to: 'an', label: 'analytics' },
      { from: 'q', to: 'ad', label: 'targeting' },
      { from: 'an', to: 'g1' },
      { from: 'ad', to: 'g2' },
      { from: 'g1', to: 'log', label: 'no' },
      { from: 'g1', to: 'bl1', label: 'yes' },
      { from: 'g2', to: 'targ', label: 'no' },
      { from: 'g2', to: 'bl2', label: 'yes' },
    ],
    notes: [
      { target: 'bl2', text: 'C2 secondary use restriction. C2a targeting is its sub-subtype: asserting C2 asserts C2a' },
    ],
  },
  {
    id: 'c3',
    name: 'C3 Repurposing',
    title: 'C3: data repurposing restriction. Training, fine-tuning, evaluation',
    nodes: [
      { id: 'pair', label: 'Question and answer pair' },
      { id: 'q', label: 'C3 asserted?', decision: true },
      { id: 'train', label: 'Appended to the training set:\nasking a question became\ntraining material' },
      { id: 'blocked', label: 'Blocked before the append', role: 'enforced' },
      { id: 'ok', label: 'Interacting with a system\nis not consent to improve it', role: 'respected' },
    ],
    edges: [
      { from: 'pair', to: 'q' },
      { from: 'q', to: 'train', label: 'no' },
      { from: 'q', to: 'blocked', label: 'yes' },
      { from: 'blocked', to: 'ok' },
    ],
    notes: [
      { target: 'blocked', text: 'C3 data repurposing restriction: inputs may not be used to build or improve AI systems' },
    ],
  },
  {
    id: 'c4',
    name: 'C4 Sharing',
    title: 'C4: sharing restriction. How far data travels along the task chain',
    nodes: [
      { id: 'del', label: 'Task delegates to sub-agents' },
      { id: 'h1', label: 'Pharmacy price agent:\nneeds the medication name' },
      { id: 'h2', label: 'Wellness marketing vendor:\nno task reason to receive data' },
      { id: 'q1', label: 'C4 asserted?', decision: true },
      { id: 'q2', label: 'C4 asserted?', decision: true },
      { id: 'f1', label: 'Receives the full\nhealth payload' },
      { id: 'm1', label: 'Receives the medication\nfield only', role: 'enforced' },
      { id: 'f2', label: 'Receives the full\nhealth payload' },
      { id: 'r2', label: 'Refused: the chain ends\nwhere necessity ends', role: 'enforced' },
    ],
    edges: [
      { from: 'del', to: 'h1' },
      { from: 'del', to: 'h2' },
      { from: 'h1', to: 'q1' },
      { from: 'h2', to: 'q2' },
      { from: 'q1', to: 'f1', label: 'no' },
      { from: 'q1', to: 'm1', label: 'yes' },
      { from: 'q2', to: 'f2', label: 'no' },
      { from: 'q2', to: 'r2', label: 'yes' },
    ],
    notes: [
      { target: 'm1', text: 'C4 sharing restriction: a transfer is appropriate only if the receiving system operates in the same context' },
    ],
  },

  // Category D: Persistence
  {
    id: 'cat-d',
    name: 'Category D',
    title: 'Category D (Persistence): opting out of how long data survives',
    nodes: [
      { id: 's1', label: 'Session 1: user mentions\nvegetarian, tight budget' },
      { id: 'within', label: 'Same-session context used\nin the next turn:\nalways permitted', role: 'respected' },
      { id: 'end', label: 'Session 1 ends' },
      { id: 'd1q', label: 'D1 asserted?', decision: true },
      { id: 'arch', label: 'Transcript archived' },
      { id: 'disc', label: 'Everything discarded', role: 'enforced' },
      { id: 's2', label: 'Session 2:\nrestaurant question' },
      { id: 'd2q', label: 'D2 asserted?', decision: true },
      { id: 'recall', label: 'Archive recalled:\ntailored answer' },
      { id: 'fresh', label: 'Nothing recalled:\nclean-slate answer', role: 'enforced' },
      { id: 'syn', label: 'Profile synthesis attempted' },
      { id: 'd3q', label: 'D3 asserted?', decision: true },
      { id: 'model', label: 'Behavioral model written' },
      { id: 'inert', label: 'Sessions stay\ninert transcripts', role: 'enforced' },
    ],
    edges: [
      { from: 's1', to: 'within' },
      { from: 's1', to: 'end' },
      { from: 'end', to: 'd1q' },
      { from: 'd1q', to: 'arch', label: 'no' },
      { from: 'd1q', to: 'disc', label: 'yes' },
      { from: 'arch', to: 's2' },
      { from: 'disc', to: 's2' },
      { from: 's2', to: 'd2q' },
      { from: 'd2q', to: 'recall', label: 'no' },
      { from: 'd2q', to: 'fresh', label: 'yes' },
      { from: 'recall', to: 'syn' },
      { from: 'fresh', to: 'syn' },
      { from: 'syn', to: 'd3q' },
      { from: 'd3q', to: 'model', label: 'no' },
      { from: 'd3q', to: 'inert', label: 'yes' },
    ],
    notes: [
      { target: 'disc', text: 'The three form a hierarchy: asserting D1 implies D2 and D3, and asserting D2 implies D3' },
      { target: 'inert', text: 'D3 long-term profile scope: retention permitted, synthesis into a durable model refused' },
    ],
  },
  {
    id: 'd1',
    name: 'D1 Session',
    title: 'D1: session scope. Nothing persists once the interaction ends',
    nodes: [
      { id: 'within', label: 'During the session, the assistant\nuses what the user said earlier' },
      { id: 'coh', label: 'Always allowed:\noperational coherence', role: 'respected' },
      { id: 'ends', label: 'Session ends' },
      { id: 'q', label: 'D1 asserted?', decision: true },
      { id: 'arch', label: 'Transcript and disclosed\nfacts archived' },
      { id: 'disc', label: 'Everything discarded', role: 'enforced' },
      { id: 'clean', label: 'Next interaction starts\nfrom a clean slate', role: 'respected' },
    ],
    edges: [
      { from: 'within', to: 'coh' },
      { from: 'within', to: 'ends' },
      { from: 'ends', to: 'q' },
      { from: 'q', to: 'arch', label: 'no' },
      { from: 'q', to: 'disc', label: 'yes' },
      { from: 'disc', to: 'clean' },
    ],
    notes: [
      { target: 'disc', text: 'D1 session scope, the strictest: implies D2 and D3. Within-session use stays permitted' },
    ],
  },
  {
    id: 'd2',
    name: 'D2 Cross-session',
    title: 'D2: cross-session scope. Past interactions may not inform future ones',
    nodes: [
      { id: 'new', label: 'Session 2 starts:\nrestaurant question' },
      { id: 'q', label: 'D2 asserted?', decision: true },
      { id: 'rec', label: 'Archive recalled:\nvegetarian, tight budget' },
      { id: 'tail', label: 'Tailored answer:\na vegetarian restaurant' },
      { id: 'fresh', label: 'Archive exists for the user\nbut returns nothing\nto the system', role: 'enforced' },
      { id: 'gen', label: 'Clean-slate answer:\nthe assistant asks preferences', role: 'respected' },
    ],
    edges: [
      { from: 'new', to: 'q' },
      { from: 'q', to: 'rec', label: 'no' },
      { from: 'rec', to: 'tail' },
      { from: 'q', to: 'fresh', label: 'yes' },
      { from: 'fresh', to: 'gen' },
    ],
    notes: [
      { target: 'fresh', text: 'D2 cross-session scope: the user keeps their history, the system may not use it for continuity. Implies D3' },
    ],
  },
  {
    id: 'd3',
    name: 'D3 Profile',
    title: 'D3: long-term profile scope. Remembered, never modeled',
    nodes: [
      { id: 'arch', label: 'Two retained sessions' },
      { id: 'q', label: 'D3 asserted?', decision: true },
      { id: 'model', label: 'Synthesized into a behavioral model:\nvegetarian, price sensitive,\nplans weekly' },
      { id: 'inert', label: 'Sessions stay as\ninert transcripts', role: 'enforced' },
      { id: 'rem', label: 'Prior interactions remembered,\nnever synthesized into a profile', role: 'respected' },
    ],
    edges: [
      { from: 'arch', to: 'q' },
      { from: 'q', to: 'model', label: 'no' },
      { from: 'q', to: 'inert', label: 'yes' },
      { from: 'inert', to: 'rem' },
    ],
    notes: [
      { target: 'inert', text: 'D3 long-term profile scope: session and cross-session retention permitted, the durable user model is not' },
    ],
  },

  // Category E: Delegation
  {
    id: 'cat-e',
    name: 'Category E',
    title: 'Category E (Delegation): opting out of the agent resolving choices on your behalf',
    nodes: [
      { id: 'req', label: 'User asks the agent\nto book a trip' },
      { id: 'enc', label: 'Agent encounters six actions,\nfrom a flight search to\na passport transfer' },
      { id: 'ua', label: 'User assigned a tier?', decision: true },
      { id: 'userwins', label: 'User assignment applies:\nsearch runs alone,\nbooking asks first' },
      { id: 'vd', label: 'Vendor proposed a tier?', decision: true },
      { id: 'gpcq', label: 'GPC active?', decision: true },
      { id: 'vdauto', label: 'Vendor default stands:\nfare tracking runs unasked' },
      { id: 'voided', label: 'Vendor default voided:\nfare tracking asks first', role: 'enforced' },
      { id: 'none', label: 'No tier anywhere:\ndeclined, not assumed', role: 'enforced' },
      { id: 'out', label: 'Trip booked in every mode.\nOnly the unasked actions differ', role: 'respected' },
    ],
    edges: [
      { from: 'req', to: 'enc' },
      { from: 'enc', to: 'ua' },
      { from: 'ua', to: 'userwins', label: 'yes' },
      { from: 'ua', to: 'vd', label: 'no' },
      { from: 'vd', to: 'gpcq', label: 'yes' },
      { from: 'vd', to: 'none', label: 'no' },
      { from: 'gpcq', to: 'voided', label: 'yes' },
      { from: 'gpcq', to: 'vdauto', label: 'no' },
      { from: 'userwins', to: 'out' },
      { from: 'voided', to: 'out' },
      { from: 'vdauto', to: 'out' },
      { from: 'none', to: 'out' },
    ],
    notes: [
      { target: 'none', text: 'The user assignment overrides the vendor proposal. GPC voids vendor defaults. Unassigned falls to the most restrictive treatment' },
    ],
  },
  {
    id: 'e1',
    name: 'E1 Delegation',
    title: 'E1: selective delegation opt-out. Which decisions the agent may resolve alone',
    nodes: [
      { id: 'act', label: 'Agent encounters an action,\ntiered by reversibility,\nsensitivity, and consequence' },
      { id: 'tier', label: 'Effective tier?', decision: true },
      { id: 'auto', label: 'User granted autonomy\n(search, reversible hold)' },
      { id: 'exec', label: 'Executes', role: 'respected' },
      { id: 'p', label: 'User available?', decision: true },
      { id: 'appr', label: 'User approves?', decision: true },
      { id: 'ok', label: 'Executed after approval', role: 'respected' },
      { id: 'no', label: 'Declined by the user', role: 'enforced' },
      { id: 'dec', label: 'Declined rather than assumed:\ndefault_restrictive_no_user', role: 'enforced' },
    ],
    edges: [
      { from: 'act', to: 'tier' },
      { from: 'tier', to: 'auto', label: 'autonomous' },
      { from: 'auto', to: 'exec' },
      { from: 'tier', to: 'p', label: 'ask user' },
      { from: 'p', to: 'appr', label: 'yes' },
      { from: 'appr', to: 'ok', label: 'yes' },
      { from: 'appr', to: 'no', label: 'no' },
      { from: 'p', to: 'dec', label: 'no user available' },
    ],
    notes: [
      { target: 'dec', text: 'E1 selective delegation: where no tier was assigned, or no user is present, the agent declines rather than proceeds' },
    ],
  },
];

module.exports = { DIAGRAMS };
