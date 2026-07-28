const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, TableOfContents,
  LevelFormat, PageOrientation,
} = require('docx');

const NAVY = '15263a', TEAL = '5f9299', RUST = 'b3502e', GRAY = '5a6672', LIGHT = 'eef2f6';
const MONO = 'Consolas';

// ---------- helpers ----------
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 120 }, children: [new TextRun({ text: t, color: NAVY, bold: true })] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 220, after: 80 }, children: [new TextRun({ text: t, color: NAVY, bold: true })] });
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 160, after: 60 }, children: [new TextRun({ text: t, color: TEAL, bold: true })] });
const P = (runs, opts = {}) => new Paragraph({ spacing: { after: 100, line: 276 }, children: Array.isArray(runs) ? runs : [new TextRun(runs)], ...opts });
const T = (t, o = {}) => new TextRun({ text: t, ...o });
const bullet = (runs) => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: 60, line: 272 }, children: Array.isArray(runs) ? runs : [new TextRun(runs)] });
const bullet2 = (runs) => new Paragraph({ numbering: { reference: 'bullets', level: 1 }, spacing: { after: 40, line: 272 }, children: Array.isArray(runs) ? runs : [new TextRun(runs)] });
const num = (runs) => new Paragraph({ numbering: { reference: 'steps', level: 0 }, spacing: { after: 60, line: 272 }, children: Array.isArray(runs) ? runs : [new TextRun(runs)] });
const code = (t) => new TextRun({ text: t, font: MONO, size: 19, color: '244022' });
const codeBlock = (lines) => new Paragraph({
  spacing: { before: 60, after: 120 },
  shading: { type: ShadingType.CLEAR, fill: 'f3f5f8' },
  border: { left: { style: BorderStyle.SINGLE, size: 18, color: TEAL, space: 8 } },
  children: lines.flatMap((l, i) => i === 0 ? [new TextRun({ text: l, font: MONO, size: 18, color: '2b3b2b' })] : [new TextRun({ break: 1, text: l, font: MONO, size: 18, color: '2b3b2b' })]),
});

// simple 2-col reference table
function refTable(rows, col0 = 3200, col1 = 6100, head) {
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'cdd6da' };
  const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };
  const headRow = new TableRow({
    tableHeader: true,
    children: head.map((h, i) => new TableCell({
      width: { size: i === 0 ? col0 : col1, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: NAVY },
      margins: { top: 60, bottom: 60, left: 110, right: 110 },
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: 'ffffff', size: 19 })] })],
    })),
  });
  const bodyRows = rows.map((r, ri) => new TableRow({
    children: r.map((c, i) => new TableCell({
      width: { size: i === 0 ? col0 : col1, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: ri % 2 ? 'f4f7f9' : 'ffffff' },
      margins: { top: 50, bottom: 50, left: 110, right: 110 },
      children: [new Paragraph({ children: Array.isArray(c) ? c : [new TextRun({ text: c, size: 19, font: i === 0 ? MONO : undefined, color: i === 0 ? '244022' : '222b33' })] })],
    })),
  }));
  return new Table({ columnWidths: [col0, col1], width: { size: col0 + col1, type: WidthType.DXA }, borders, rows: [headRow, ...bodyRows] });
}

const rule = () => new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: TEAL, space: 4 } }, spacing: { after: 120 } });

// ---------- content ----------
const doc = new Document({
  creator: 'TUUCI Continuous Improvement',
  title: '3D Mezzanine Model — User & Handoff Guide',
  styles: {
    default: { document: { run: { font: 'Calibri', size: 21, color: '222b33' } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 30, bold: true, color: NAVY }, paragraph: { spacing: { before: 320, after: 120 } } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 25, bold: true, color: NAVY }, paragraph: { spacing: { before: 220, after: 80 } } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 22, bold: true, color: TEAL }, paragraph: { spacing: { before: 160, after: 60 } } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [
        { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 220 } } } },
        { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 220 } } } },
      ] },
      { reference: 'steps', levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } } } },
      ] },
    ],
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1100, bottom: 1100, left: 1200, right: 1200 } } },
    children: [
      // ---------------- TITLE PAGE ----------------
      new Paragraph({ spacing: { before: 1700, after: 0 }, border: { bottom: { style: BorderStyle.SINGLE, size: 16, color: TEAL, space: 10 } }, children: [
        new TextRun({ text: 'TUUCI', bold: true, size: 40, color: NAVY }),
        new TextRun({ text: '  |  Continuous Improvement', size: 26, color: GRAY }),
      ] }),
      new Paragraph({ spacing: { before: 260, after: 40 }, children: [new TextRun({ text: '3D Mezzanine Model', bold: true, size: 60, color: NAVY })] }),
      new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'User Guide & Technical Handoff', size: 32, color: TEAL })] }),
      new Paragraph({ spacing: { before: 500 }, children: [new TextRun({ text: 'A single-file, in-browser 3D simulation of the mezzanine assembly lines (Meritage, Sola, Canyon Crew), plus imported floors. This document is in two parts: a complete guide to using the app, and a technical section a programmer or AI can use to maintain and extend it.', size: 22, color: '333d47' })] }),
      new Paragraph({ spacing: { before: 900 }, children: [new TextRun({ text: 'Prepared by: Mac O’Keefe', size: 22, color: '333d47' })] }),
      new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'Repository: macokeefe/claude-code-system', size: 22, color: '333d47' })] }),
      new Paragraph({ children: [new TextRun({ text: 'App location in repo: standard-work/standalone/', size: 22, font: MONO, color: '244022' })] }),

      new Paragraph({ children: [new PageBreak()] }),

      // ---------------- TOC (static, always renders) ----------------
      H1('Contents'),
      ...[
        ['PART 1 — USING THE APP', true],
        ['What the app is', false],
        ['Reading the screen', false],
        ['The Analyze tools', false],
        ['Editing the layout', false],
        ['Working with floors', false],
        ['Saving and sharing layouts', false],
        ['PART 2 — TECHNICAL HANDOFF', true],
        ['The one file that matters', false],
        ['How to build', false],
        ['How the app is organized (inside entry.js)', false],
        ['Data model and local storage', false],
        ['Shared / cloud storage (company-wide updates)', false],
        ['Floors, CAD import, and DWG', false],
        ['Making changes safely', false],
        ['The other app in this repo (context)', false],
        ['Reference documents in the repo', false],
      ].map(([t, part]) => new Paragraph({
        spacing: { before: part ? 140 : 20, after: 20 },
        indent: { left: part ? 0 : 360 },
        children: [new TextRun({ text: t, bold: part, color: part ? TEAL : '2b3b45', size: part ? 20 : 21 })],
      })),
      new Paragraph({ children: [new PageBreak()] }),

      // ================= PART 1 =================
      new Paragraph({ spacing: { before: 40, after: 60 }, children: [new TextRun({ text: 'PART 1', bold: true, size: 24, color: TEAL })] }),
      H1('What the app is'),
      P('The 3D Mezzanine Model is a self-contained web page. It opens in any modern browser by double-clicking one file. There is no server to run, no login required, and no installation. Everything, the 3D scene, the simulation math, and your saved layouts, lives inside that one HTML file.'),
      P([T('There are two identical builds: ', {}), code('Meritage_3D_Line.html'), T(' (plain) and ', {}), code('Meritage_3D_Line_TUUCI.html'), T(' (TUUCI-branded). Use whichever you prefer; they behave the same.', {})]),
      P('The floor is modeled as three production lines that run at the same time:'),
      bullet([T('Meritage', { bold: true }), T('  the raised mezzanine deck: feeder stations building up to Full Assembly, then cushions and packing.')]),
      bullet([T('Sola', { bold: true }), T('  a flow line of added stations to the right of Meritage.')]),
      bullet([T('Canyon Crew', { bold: true }), T('  a second flow line further right.')]),
      P('You can also import additional floors from CAD drawings and give each one its own lines. The app calculates cycle time, line pace, daily capacity, and the bottleneck for every line, live, as you change the layout or the work content.'),

      H2('Opening it'),
      num('Double-click the HTML file. It opens in your default browser.'),
      num('Everything you do is saved automatically in that browser. Closing and reopening brings you back where you left off.'),
      num([T('To move your work to another computer, use ', {}), T('Layouts ▸ Save into app', { bold: true }), T(' (explained under Layouts) or turn on cloud sync (explained in Part 2).')]),

      // ---- The screen ----
      H1('Reading the screen'),
      H2('The KPI cards (top)'),
      P('Each line has a row of cards across the top. They update instantly whenever you edit the line.'),
      refTable([
        ['Clock', 'The simulation clock in minutes once you press Play.'],
        ['Shipped', 'Units finished so far out of the target (the Chairs number).'],
        ['Cycle', 'Total hands-on labor to build one unit (sum of every station’s work).'],
        ['Current pace', 'The real line pace, minutes per unit. Set by the busiest station, so this is the number that actually limits output.'],
        ['Capacity', 'Units per day at the current pace, based on the day length you set.'],
        ['Bottleneck', 'The station setting the pace, with its time. Fix this station to speed up the line.'],
      ], 2400, 6900, ['Card', 'What it means']),
      P([T('The difference between ', {}), T('Cycle', { bold: true }), T(' and ', {}), T('Current pace', { bold: true }), T(' is the whole point: Cycle is total work; Current pace is what the slowest station forces on everyone. Balancing work between stations lowers Current pace without changing Cycle.')]),

      H2('The Run controls (top toolbar)'),
      refTable([
        ['Play / Reset', 'Start or restart the animation. Parts flow through the stations and ship.'],
        ['Chairs', 'How many units to build in the run (the target).'],
        ['Speed', 'How fast the animation plays. Does not change any results.'],
        ['Both / Meritage / Sola+Canyon', 'Which line(s) the Play button runs.'],
        ['All lines ▾', 'Line focus: show one line by itself and hide the others.'],
        ['Run carts', 'Animate the materials carts driving their delivery loops.'],
      ], 2600, 6700, ['Control', 'What it does']),

      // ================= USING EACH TOOL =================
      H1('The Analyze tools'),
      P('These buttons open panels on the right. They all read the current layout, so anything you change is reflected immediately.'),

      H3('Edit times'),
      P('The core editing panel. Every line is a column of station cards. For each station you can:'),
      bullet('Rename it (click the name).'),
      bullet('Edit each step’s name and minutes.'),
      bullet('Add or delete steps.'),
      bullet([T('Set how many people work there (', {}), T('👤', {}), T('), which divides the work into a per-operator time.')]),
      bullet([T('Mark a station as ', {}), T('covered by', { bold: true }), T(' another station’s crew, instead of having its own operators.')]),
      bullet([T('Move a step to another station: use the ', {}), T('⇄', { bold: true }), T(' dropdown, or drag the step by its ', {}), T('⠿', { bold: true }), T(' grip onto any other station on that line.')]),
      bullet([T('Add a station to a line with the ', {}), T('＋ Add station', { bold: true }), T(' button at the bottom of each column.')]),

      H3('Products per line (the Running selector)'),
      P('Each line can build more than one product. The Running dropdown on the KPI card (and the Editing dropdown in Edit times) picks which product that line is currently set up for. A product can either scale the base times by a percentage, or carry its own set of station steps. The Takt board and Planner use these products.'),

      H3('Help paths'),
      P([T('A help path is one operator walking over to help another station for a few minutes per unit. Click ', {}), T('🤝 Help paths', { bold: true }), T(' (or the ', {}), T('➤ Help arrow', { bold: true }), T(' tool in Edit Layout), then click the station the operator comes FROM, then the station they help. Help paths are tied to the product a line is building, and they lower that receiving station’s time, which can lower the whole line’s pace.')]),

      H3('Flow lines'),
      P([T('On the added lines (Sola, Canyon, and imported floors), a flow line sets the order parts move through the stations. Use the ', {}), T('⇢ Flow line', { bold: true }), T(' tool: click FROM station then TO station. The simulation then flows units in that order. With no flow line drawn, stations run left to right.')]),

      H3('Idle / day, Task chart'),
      bullet([T('Idle / day', { bold: true }), T('  shows how busy each operator is over a full day: blue is working, the rest is idle. Great for spotting under-loaded people.')]),
      bullet([T('Task chart', { bold: true }), T('  a bar chart of every station’s time against the line pace, so the bottleneck is obvious.')]),

      H3('Planner'),
      P('Builds a daily plan per line: pick furniture, a quantity, and the order they arrive, and the Planner lays out the day and tells you whether it fits the shift. Drag the entries to reorder.'),

      H3('Takt board + Optimize'),
      P('The Takt board compares every product on every line: its pace bar against its takt (the pace you must hit to meet the day’s demand). Set each product’s target per day and the red takt line moves. Green means you meet takt; red means you are over.'),
      P([T('The ', {}), T('⚡ Optimize', { bold: true }), T(' button is a planning aid: choose the maximum number of help paths you are willing to run, and the app shows the best help setup it can find to lower the pace, side by side with today’s number. It only shows the proposal; it does not change your real help paths.')]),

      H3('Floor screen'),
      P('A full-screen wall display for the plant floor with zero per-unit input. It reads the day’s Planner sequence and the wall clock and shows, per line, what should be building right now, unit x of y, what is next and when, how many units should be done by now, the bottleneck, and who helps whom. Use Preview the day to fast-forward through a whole day in about a minute. Esc exits.'),

      H3('Avail time, Report'),
      bullet([T('Avail time', { bold: true }), T('  sets the day length (shift hours). Everything that reads units per day uses this.')]),
      bullet([T('Report', { bold: true }), T('  a printable summary of the current lines and their numbers.')]),

      // ---- Editing the layout ----
      H1('Editing the layout'),
      P([T('Click ', {}), T('✱ Floor tools', { bold: true }), T(' to reveal the layout tools, then ', {}), T('✵ Edit layout', { bold: true }), T('. In edit mode a yard grid appears and you can move things.')]),
      H3('Camera and moving things'),
      bullet('Turn the camera: drag an empty part of the floor.'),
      bullet('Pan: right-drag. Zoom: scroll or pinch.'),
      bullet('Move a station: drag the table. It stays inside its own line unless you hold Shift to cross a boundary.'),
      bullet([T('Rotate a selected table 90° with ', {}), T('⟳ Rotate table', { bold: true }), T('.')]),
      H3('Carts, access points, racks'),
      bullet([T('＋ Cart waypoint', { bold: true }), T('  add a dot to a cart’s delivery path; drag dots to route carts around benches; right-click a dot to delete it.')]),
      bullet([T('＠ Access pt', { bold: true }), T('  a forklift pickup point; finished furniture lanes end at the nearest one.')]),
      bullet([T('▦ Rack', { bold: true }), T('  a finished-goods rack.')]),
      P([T('Click ', {}), T('✓ Done editing', { bold: true }), T(' to save. Everything you do is saved automatically as you go.')]),

      // ---- Floors ----
      H1('Working with floors'),
      P([T('The mezzanine is the original floor. You can add more floors, each its own space, and switch between them with the floor dropdown in the ', {}), T('View', { bold: true }), T(' group (🏠 Mezzanine / 🏗 your floors).')]),
      H2('Adding a floor'),
      P([T('Open ', {}), T('🏗 Floors', { bold: true }), T('. You have two ways to create one:')]),
      bullet([T('Import CAD floor (.dwg / .dxf)', { bold: true }), T('  bring in a DraftSight drawing. The walls and any table-sized rectangles are detected and scaled to real meters.')]),
      bullet([T('Blank floor', { bold: true }), T('  name it and give it a size (e.g. 20 x 14 meters).')]),
      H2('Splitting a floor into named lines'),
      P('A floor starts as one space. Draw dividers to split it into lines, exactly like the mezzanine’s three lines:'),
      num([T('In the Floors panel, click ', {}), T('＋ Add line (draw a divider on the floor)', { bold: true }), T('.')]),
      num('Click points across the floor to lay the divider (it can jog). Double-click or ✓ Finish, then name the new line.'),
      num('Whichever side of the divider a station sits on decides its line. Station labels recolor to their line, and each line paces independently.'),
      num([T('Rename lines inline; remove a divider with ', {}), T('┄✕', { bold: true }), T(' to merge two lines back into one.')]),
      H2('Importing standard work onto a floor'),
      P([T('With a floor open, use ', {}), T('Import standard work (.csv) → stations', { bold: true }), T('. If the floor already has two or more tables, the steps are balanced across them (contiguous chunks, about equal minutes each). With no tables yet, one station is created carrying the whole sheet. After import, drag any step (', {}), T('⠿', {}), T(' grip) onto another station to rebalance by hand.')]),
      P('While you are viewing a floor, the whole app scopes to it: the KPI cards, Edit times, Takt board, Idle/day, Task chart, and Help paths all show only that floor’s lines. Fly back to Mezzanine and everything returns.'),

      // ---- Layouts ----
      H1('Saving and sharing layouts'),
      P([T('The ', {}), T('💾 Layouts ▾', { bold: true }), T(' menu is how you keep versions and move work between machines.')]),
      refTable([
        ['Save as…', 'Save the current arrangement under a name.'],
        ['Layout dropdown', 'Switch between saved layouts.'],
        ['Set selected as default on open', 'The app opens on this layout on a fresh machine.'],
        ['Save into app', 'Download a copy of the HTML with your current and saved layouts baked in, so they appear on any computer that opens that copy.'],
        ['Export file / Import file', 'Save one layout as a small file to share, or load one someone shared.'],
        ['☁ (cloud chip)', 'When IT configures cloud sync, this connects the app to the shared company store so changes update everywhere (see Part 2).'],
      ], 3000, 6300, ['Menu item', 'What it does']),

      // ================= PART 2 =================
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ spacing: { before: 40, after: 60 }, children: [new TextRun({ text: 'PART 2', bold: true, size: 24, color: TEAL })] }),
      H1('Technical handoff (for a programmer or AI)'),
      P('This section describes how the app is built and where everything lives, so a developer or an AI assistant can maintain and extend it. All paths are relative to the repository root of macokeefe/claude-code-system.'),

      H2('The one file that matters'),
      P([T('The app is authored as one source file and compiled into a single self-contained HTML page. There is no runtime backend for the standalone app; it runs entirely in the browser.')]),
      refTable([
        ['standard-work/standalone/', 'Everything for the standalone 3D app lives here.'],
        ['  Meritage_3D_Line.entry.js', 'THE SOURCE OF TRUTH. ~5,600 lines of JavaScript: the whole app (Three.js scene, simulation, UI, storage, cloud, floors). Edit this file.'],
        ['  Meritage_3D_Line.html', 'Built output (plain). Generated — do not hand-edit.'],
        ['  Meritage_3D_Line_TUUCI.html', 'Built output (TUUCI-branded). Generated — do not hand-edit.'],
        ['  build/', 'The build tooling (see below).'],
      ], 3400, 5900, ['Path', 'Role']),

      H2('How to build'),
      P([T('The build folder is self-contained and repo-relative. From ', {}), code('standard-work/standalone/build/'), T(' run:')]),
      codeBlock(['cd standard-work/client && npm install    # once: three, msal, libredwg, esbuild', 'cd ../standalone/build && bash build.sh    # produces both HTML builds']),
      P([T('What ', {}), code('build.sh'), T(' does:')]),
      num([code('esbuild'), T(' bundles ', {}), code('Meritage_3D_Line.entry.js'), T(' (iife, minified), aliasing ', {}), code('three'), T(', ', {}), code('@azure/msal-browser'), T(', and ', {}), code('@mlightcad/libredwg-web'), T(' to the client’s node_modules.')]),
      num([T('It splices the bundle together with ', {}), code('m3d_head.html'), T(' (the page <head>, styles, and toolbar markup) and injects ', {}), code('dwg_wasm.gz.b64'), T(' (the LibreDWG WebAssembly, gzip+base64) into ', {}), code('window.__DWG_WASM_GZB64'), T('.')]),
      num([T('It writes ', {}), code('Meritage_3D_Line.html'), T(', then runs ', {}), code('tuuci_theme.py'), T(' to produce the branded ', {}), code('Meritage_3D_Line_TUUCI.html'), T('.')]),
      P('Contents of the build folder:'),
      refTable([
        ['build/build.sh', 'The one command that rebuilds both HTML files. Repo-relative; no absolute paths.'],
        ['build/m3d_head.html', 'The <head>, all CSS, the toolbar and panel markup, and the window.M3D_CLOUD config block.'],
        ['build/tuuci_theme.py', 'Regenerates the TUUCI-branded build from the same bundle + head.'],
        ['build/dwg_wasm.gz.b64', 'LibreDWG wasm (gzip+base64, ~3 MB) for reading .dwg files in the browser.'],
        ['build/tuuci_logo_white.b64', 'The TUUCI logo (base64 PNG) used by the branded build.'],
        ['build/m3d_bundle.js', 'Intermediate esbuild output. Git-ignored; regenerated each build.'],
      ], 3400, 5900, ['File', 'Role']),

      H2('How the app is organized (inside entry.js)'),
      P('The file is one long IIFE. The major systems, in rough order of appearance:'),
      refTable([
        ['Scene + world', 'Three.js scene, lights, the concrete ground plane, the raised mezzanine deck, columns, elevator.'],
        ['Stations (ST) + nodes', 'ST is the fixed Meritage stations; nodes[id] holds every station’s data, meshes, position, steps, and crew. extraStations[] holds all added (Sola/Canyon/floor) stations.'],
        ['Sections', 'sectionOf(x,z) decides which line a point is in: mezzanine lines by CAD boundary, or an imported floor’s line by its drawn dividers. This is the backbone of per-line math.'],
        ['Simulation', 'schedule() paces Meritage; buildSolaSched()/solaUpdate() run the added lines on their own clock (Ts). Help paths and flow lines feed these.'],
        ['Metrics', 'opLoad, lineCyc, secCyc, productMetrics compute pace, capacity, bottleneck, takt.'],
        ['UI panels', 'renderTimes, renderIdle, renderTaskChart, renderPlanner, renderTaktBoard, plus the Floor-screen kiosk (renderKiosk).'],
        ['Floors', 'customFloors[] plus addFloor, buildFloorGroup, addFloorDivider, parseDXF, parseDWG, importSWIFiles, and the floor-view isolation (setViewFloor).'],
        ['Persistence', 'buildWorkingLayout / applyWorkingLayout / saveLayout / loadLayout and the named-layout store.'],
        ['Cloud', 'The CLOUD module: MSAL sign-in + Microsoft Graph SharePoint sync.'],
      ], 2700, 6600, ['System', 'Where / what']),

      H2('Data model and local storage'),
      P([T('The entire state of a layout is one plain object built by ', {}), code('buildWorkingLayout()'), T(' and re-applied by ', {}), code('applyWorkingLayout()'), T('. That object is the single funnel for save, load, export, bake-into-file, and cloud sync, so any new persistent field only has to be added in those two places.')]),
      P('Browser localStorage keys:'),
      refTable([
        ['m3d_layout_v2', 'The current working layout (auto-saved on every change).'],
        ['m3d_layouts_v2', 'All named layouts (Save as…).'],
        ['m3d_default_layout', 'The name of the layout to open on a fresh machine.'],
      ], 3200, 6100, ['localStorage key', 'Contents']),
      P('Layouts can also be baked into the HTML file itself (Save into app), read at boot from these globals:'),
      refTable([
        ['window.__M3D_LAYOUT__', 'Baked working layout.'],
        ['window.__M3D_LAYOUTS__', 'Baked named layouts.'],
        ['window.__M3D_DEFAULT_LAYOUT__', 'Baked default-layout name.'],
      ], 3600, 5700, ['Global', 'Contents']),
      P([T('Key fields on the layout object include ', {}), code('__steps'), T(', ', {}), code('__ppl'), T(', ', {}), code('__cover'), T(', ', {}), code('__help'), T(', ', {}), code('__flow'), T(', ', {}), code('__plan'), T(', ', {}), code('__products'), T(', ', {}), code('__floors'), T(' (imported floors, including their drawn dividers and line names), ', {}), code('__extras'), T(' (added stations), and ', {}), code('__defaultLayout'), T('.')]),

      H2('Shared / cloud storage (company-wide updates)'),
      P([T('The app can sync every layout to a shared Microsoft 365 store so a change made by one person appears for everyone. It uses the company’s existing SharePoint / OneDrive tenant through the Microsoft Graph API, with an MSAL popup sign-in. It is off until IT configures it, so nothing external happens by default.')]),
      P([T('Configuration lives in one block in ', {}), code('build/m3d_head.html'), T(' (search for ', {}), code('window.M3D_CLOUD'), T('). IT fills in:')]),
      codeBlock([
        'window.M3D_CLOUD = {',
        "  tenantId: '<Entra tenant id>',",
        "  clientId: '<Entra app (SPA) client id>',",
        "  siteHost: 'tuuci.sharepoint.com',",
        "  sitePath: '/sites/Mezzanine',",
        "  listName: 'M3D Layouts',",
        '};',
      ]),
      P([T('Mechanics (in the ', {}), code('CLOUD'), T(' module of entry.js): sign in with MSAL (PKCE), resolve the SharePoint site and a list, and store one row per layout (a Title column and a Data column). Writes use an ETag / If-Match so a conflicting edit prompts keep-mine or load-theirs. Pushes are debounced. The ', {}), T('☁', {}), T(' chip shows off / idle / connecting / on / error.')]),
      P([T('For a full rollout plan (roles, phases, and the IT steps to register the Entra app), see ', {}), code('standard-work/docs/HANDOFF_PLAN.md'), T(' and ', {}), code('standard-work/docs/Handoff_Plan_3D_Mezzanine_Model.docx'), T('.')]),

      H2('Floors, CAD import, and DWG'),
      P([T('Imported floors are objects in ', {}), code('customFloors[]'), T(' with position, size, wall segments, drawn dividers, and line names. ', {}), code('parseDXF()'), T(' reads ASCII DXF directly. ', {}), code('parseDWG()'), T(' uses the bundled LibreDWG WebAssembly to walk model-space entities incrementally (it yields to keep the page responsive and caps very large drawings). If a DWG will not import, the fallback is to Save As DXF in DraftSight.')]),
      P([T('Each floor’s dividers slice it into lines via ', {}), code('divSide()'), T(' / ', {}), code('zoneIdxOf()'), T(', mirroring how the mezzanine’s CAD boundaries slice it into Meritage / Sola / Canyon. When a floor is being viewed, ', {}), code('setViewFloor()'), T(' hides the entire mezzanine and every other floor so each floor is its own space.')]),

      H2('Making changes safely'),
      bullet([T('Edit only ', {}), code('Meritage_3D_Line.entry.js'), T(' (and ', {}), code('build/m3d_head.html'), T(' for markup/CSS). Never hand-edit the built ', {}), code('.html'), T(' files.')]),
      bullet([T('Rebuild with ', {}), code('build/build.sh'), T(' and commit all three: the ', {}), code('.entry.js'), T(' and both ', {}), code('.html'), T(' outputs.')]),
      bullet([T('Watch for temporal-dead-zone (TDZ) traps: any module-level ', {}), code('const'), T('/', {}), code('let'), T(' referenced by ', {}), code('loadLayout()'), T(' at boot must be declared before that call site, or restore silently fails. When in doubt, declare shared floor/cloud state as ', {}), code('var'), T(' high in the file.')]),
      bullet([T('Test method used throughout: append a ', {}), code('window.__M3D_TEST = { ... }'), T(' hook to the end of entry.js, build, drive it with a headless Chromium (Playwright) script, then strip the hook and rebuild clean before committing.')]),

      H2('The other app in this repo (context)'),
      P([T('The repository also contains an earlier, separate web application under ', {}), code('standard-work/client/'), T(' (a React/Vite app) with a small Node server under ', {}), code('standard-work/server/'), T(', shared logic in ', {}), code('standard-work/shared/'), T(', and seed data in ', {}), code('standard-work/seed/'), T('. That was the first prototype for standard-work management. The 3D Mezzanine Model in ', {}), code('standard-work/standalone/'), T(' is the current deliverable and is independent of it. The only overlap is that the standalone build borrows the client’s ', {}), code('node_modules'), T(' for its libraries.')]),

      H2('Reference documents in the repo'),
      refTable([
        ['standard-work/docs/HANDOFF_PLAN.md', 'The plan to hand the software to TUUCI (roles, phases, shared-data decision).'],
        ['standard-work/docs/Handoff_Plan_3D_Mezzanine_Model.docx', 'The same plan as a Word document.'],
        ['standard-work/standalone/build/', 'The build tooling described above.'],
        ['standard-work/docs/', 'Connector-project documents (BOM rework, ECN/PCN drafts) — separate from the app.'],
      ], 4200, 5100, ['Path', 'What it is']),

      rule(),
      P([new TextRun({ text: 'Questions on the app itself go to Mac O’Keefe. To pick the app up cold: open ', italics: true, color: GRAY }), new TextRun({ text: 'standard-work/standalone/Meritage_3D_Line.entry.js', font: MONO, size: 19, color: '244022' }), new TextRun({ text: ', run ', italics: true, color: GRAY }), new TextRun({ text: 'build/build.sh', font: MONO, size: 19, color: '244022' }), new TextRun({ text: ', and the two HTML builds are your deployable artifacts.', italics: true, color: GRAY })]),
    ],
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync('/home/user/claude-code-system/standard-work/docs/3D_Mezzanine_Model_Guide.docx', buf);
  console.log('wrote 3D_Mezzanine_Model_Guide.docx', buf.length);
});
