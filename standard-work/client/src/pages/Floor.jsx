import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { api, formatTime, formatLong } from '@backend';
import { simulateBuild } from '../../../shared/simulate.js';
import { sizeLabel } from '../sizeLabel.js';

// Status colors for the floor ring under each bench
const RING = { idle: 0x8e98a6, active: 0x1fa84f, done: 0x1a56b0 };

function shortName(s) {
  const n = (s.tag_id ? s.tag_name : s.name) || '';
  return n.length > 22 ? n.slice(0, 21) + '…' : n;
}
function fullName(s) { return (s.tag_id ? s.tag_name : s.name) || ''; }

/* ---------- materials & textures (modeled on the real floor photos) ---------- */

function concreteTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#b9bcbe'; x.fillRect(0, 0, 512, 512);
  // mottled stains and patches like worn shop concrete
  for (let i = 0; i < 260; i++) {
    const r = 8 + Math.random() * 60;
    const g = 150 + Math.floor(Math.random() * 60);
    x.fillStyle = `rgba(${g},${g},${g + 4},${0.04 + Math.random() * 0.08})`;
    x.beginPath(); x.arc(Math.random() * 512, Math.random() * 512, r, 0, 7); x.fill();
  }
  for (let i = 0; i < 40; i++) {
    x.fillStyle = `rgba(120,118,112,${0.05 + Math.random() * 0.06})`;
    x.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 30, 1 + Math.random() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(7, 7);
  return t;
}

const MAT = {};
function initMats() {
  MAT.pine = new THREE.MeshStandardMaterial({ color: 0xc89a5e, roughness: 0.85 });       // bench lumber
  MAT.benchTop = new THREE.MeshStandardMaterial({ color: 0xf0ece2, roughness: 0.95 });   // white padded top
  MAT.trimBlue = new THREE.MeshStandardMaterial({ color: 0x3556a8, roughness: 0.8 });
  MAT.trimRed = new THREE.MeshStandardMaterial({ color: 0xa33a2e, roughness: 0.8 });
  MAT.binYellow = new THREE.MeshStandardMaterial({ color: 0xe6b820, roughness: 0.7 });
  MAT.binBlue = new THREE.MeshStandardMaterial({ color: 0x2456b0, roughness: 0.7 });
  MAT.cherry = new THREE.MeshStandardMaterial({ color: 0x8f5a2e, roughness: 0.45, metalness: 0.25 }); // frame finish
  MAT.chrome = new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.25, metalness: 0.9 });
  MAT.mat = new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.95 });        // anti-fatigue mat
  MAT.matEdge = new THREE.MeshStandardMaterial({ color: 0xd9c427, roughness: 0.9 });
  MAT.tape = new THREE.MeshStandardMaterial({ color: 0xd9c427, roughness: 0.9 });
  MAT.column = new THREE.MeshStandardMaterial({ color: 0xe8e8e6, roughness: 0.9 });
  MAT.rackPost = new THREE.MeshStandardMaterial({ color: 0xc25e2a, roughness: 0.8 });    // orange pallet racking
  MAT.rackBeam = new THREE.MeshStandardMaterial({ color: 0xb44a22, roughness: 0.8 });
  MAT.box = new THREE.MeshStandardMaterial({ color: 0xc9a877, roughness: 0.95 });        // cardboard
  MAT.boxWhite = new THREE.MeshStandardMaterial({ color: 0xf2f2ef, roughness: 0.9 });
  MAT.hose = new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.6 });
  MAT.shirt = new THREE.MeshStandardMaterial({ color: 0x6d7480, roughness: 0.9 });       // crew gray tee
  MAT.pants = new THREE.MeshStandardMaterial({ color: 0x2e3440, roughness: 0.9 });
  MAT.skin = new THREE.MeshStandardMaterial({ color: 0xc89576, roughness: 0.8 });
  MAT.steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.5, metalness: 0.6 });
  MAT.brass = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.8 });
}

function makeLabel(seq, name, timeStr) {
  // Big, bold, dark text on a white card with a heavy colored header.
  const W = 900, H = 340;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(0,0,0,0.32)'; x.beginPath(); x.roundRect(12, 18, W - 18, H - 22, 26); x.fill();
  x.fillStyle = '#ffffff'; x.beginPath(); x.roundRect(6, 8, W - 24, H - 30, 26); x.fill();
  x.fillStyle = '#143e85'; x.beginPath(); x.roundRect(6, 8, W - 24, 92, 26); x.fill();
  x.fillStyle = '#ffffff'; x.font = '900 64px Arial, sans-serif'; x.textAlign = 'left';
  x.fillText(`STEP ${seq}`, 34, 76);
  x.textAlign = 'right'; x.font = '900 60px "Courier New", monospace';
  x.fillText(timeStr, W - 40, 75);
  // name — large, near-black, with a stroke for extra weight, wrapped to 2 lines
  x.textAlign = 'center';
  x.font = '900 78px Arial, sans-serif';
  const words = String(name).split(' ');
  const lines = []; let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > 15 && cur) { lines.push(cur.trim()); cur = w; }
    else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  const two = lines.slice(0, 2);
  const startY = two.length === 1 ? 232 : 198;
  two.forEach((ln, i) => {
    const y = startY + i * 82;
    x.lineJoin = 'round'; x.strokeStyle = '#0a0e14'; x.lineWidth = 6; x.strokeText(ln, W / 2, y);
    x.fillStyle = '#0a0e14'; x.fillText(ln, W / 2, y);
  });

  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 8;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(5.2, 1.96, 1);
  sp.renderOrder = 999;
  return sp;
}

/* Crew figure: gray tee, dark pants, like the photos. */
function makeOperator() {
  const g = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.55, 10), MAT.pants);
  legs.position.y = 0.28; legs.castShadow = true;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.42, 4, 10), MAT.shirt);
  torso.position.y = 0.85; torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 14), MAT.skin);
  head.position.y = 1.32; head.castShadow = true;
  g.add(legs, torso, head);
  return g;
}

/* ------------- station-specific work-in-progress visuals ------------- */
/* Each builder returns { g, update(prog) } — the actual operation on that
   bench, revealed as the step progresses. Matched by step name keywords. */

const bx = (w, h, d, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = true; return m; };
const cy = (r, h, mat) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10), mat); m.castShadow = true; return m; };
const showCount = (arr, n) => arr.forEach((m, i) => { m.visible = i < n; });
const frac = (arr, prog) => showCount(arr, prog >= 1 ? arr.length : Math.floor(prog * (arr.length + 0.999)));

function clampFixture() {
  const g = new THREE.Group();
  const base = bx(0.34, 0.16, 0.3, MAT.pants); base.position.y = 0.08; g.add(base);
  const screw = cy(0.025, 0.22, MAT.chrome); screw.position.y = 0.27; g.add(screw);
  const handle = bx(0.18, 0.03, 0.03, MAT.steel); handle.position.y = 0.38; g.add(handle);
  return g;
}
function barClamp(len) {
  const g = new THREE.Group();
  const bar = bx(len, 0.045, 0.045, MAT.steel); bar.position.y = 0.1; g.add(bar);
  for (const x of [-len / 2 + 0.06, len / 2 - 0.06]) {
    const pad = bx(0.07, 0.16, 0.1, MAT.rackPost); pad.position.set(x, 0.08, 0); g.add(pad);
  }
  return g;
}
function drillTool() {
  const g = new THREE.Group();
  const body = bx(0.2, 0.1, 0.07, MAT.binYellow); body.position.y = 0.05; g.add(body);
  const grip = bx(0.05, 0.12, 0.06, MAT.pants); grip.position.set(-0.04, -0.04, 0); g.add(grip);
  const bit = cy(0.013, 0.12, MAT.chrome); bit.rotation.z = Math.PI / 2; bit.position.set(0.15, 0.05, 0); g.add(bit);
  return g;
}
function rail(len, mat = MAT.cherry) { return bx(len, 0.1, 0.1, mat); }

/* full perimeter frame used by several stations */
function fullFrame(L = 1.6, W = 1.0) {
  const g = new THREE.Group();
  const a = rail(L); a.position.z = -W / 2;
  const b = rail(L); b.position.z = W / 2;
  const c = rail(W); c.rotation.y = Math.PI / 2; c.position.x = -L / 2;
  const d = rail(W); d.rotation.y = Math.PI / 2; d.position.x = L / 2;
  g.add(a, b, c, d);
  return g;
}

function visRivnut() {
  const g = new THREE.Group();
  const fixture = clampFixture(); fixture.position.set(-0.85, 0, -0.35); g.add(fixture);
  const studs = [];
  [-0.25, 0.05, 0.35].forEach((z, r) => {
    const ext = rail(1.5); ext.position.set(0.1, 0.05, z); g.add(ext);
    for (let i = 0; i < 4; i++) {
      const stud = cy(0.024, 0.05, MAT.brass); stud.position.set(-0.5 + i * 0.34, 0.13, z);
      stud.visible = false; g.add(stud); studs.push(stud);
    }
  });
  return { g, update: p => frac(studs, p) };
}
function visConnectorPre() {
  const g = new THREE.Group();
  const fixture = clampFixture(); fixture.position.set(-0.85, 0, 0.3); g.add(fixture);
  const bin = bx(0.34, 0.18, 0.4, MAT.binYellow); bin.position.set(-0.85, 0.09, -0.3); g.add(bin);
  const conns = [];
  for (let i = 0; i < 12; i++) {
    const c2 = new THREE.Group();
    const body = bx(0.16, 0.09, 0.09, MAT.cherry); c2.add(body);
    const lug = bx(0.06, 0.13, 0.06, MAT.chrome); lug.position.y = 0.06; c2.add(lug);
    c2.position.set(-0.35 + (i % 6) * 0.28, 0.05, i < 6 ? -0.22 : 0.22);
    c2.visible = false; g.add(c2); conns.push(c2);
  }
  return { g, update: p => frac(conns, p) };
}
function visConnectorPlate() {
  const g = new THREE.Group();
  const leg = rail(1.3); leg.position.set(-0.1, 0.05, 0); g.add(leg);
  const fixture = clampFixture(); fixture.position.set(-0.85, 0, 0); g.add(fixture);
  const dr = drillTool(); dr.position.set(0.7, 0.02, 0.45); dr.rotation.y = -0.6; g.add(dr);
  const plate = bx(0.3, 0.02, 0.22, MAT.chrome); plate.position.set(0.25, 0.12, 0); plate.visible = false; g.add(plate);
  const screws = [];
  for (const [dx, dz] of [[-0.1, -0.07], [0.1, -0.07], [-0.1, 0.07], [0.1, 0.07]]) {
    const s = cy(0.014, 0.03, MAT.brass); s.position.set(0.25 + dx, 0.15, dz); s.visible = false; g.add(s); screws.push(s);
  }
  return { g, update: p => { plate.visible = p > 0.15; frac(screws, Math.max(0, (p - 0.3) / 0.7)); } };
}
function visAttachConnectors() {
  const g = new THREE.Group();
  const leg = rail(1.5); leg.position.set(0, 0.05, 0); g.add(leg);
  const wr = bx(0.34, 0.025, 0.06, MAT.steel); wr.position.set(0.65, 0.02, 0.4); wr.rotation.y = 0.5; g.add(wr);
  const conns = [];
  for (let i = 0; i < 4; i++) {
    const c2 = bx(0.13, 0.13, 0.16, MAT.cherry);
    c2.position.set(-0.55 + i * 0.37, 0.05, 0.13); c2.visible = false; g.add(c2); conns.push(c2);
  }
  return { g, update: p => frac(conns, p) };
}
function visFrameSub() {
  const g = new THREE.Group();
  const rails = [];
  // two L-shaped sections taking shape
  const defs = [
    [0.9, -0.6, -0.3, 0], [0.7, -0.95, 0.05, Math.PI / 2], [0.9, -0.6, 0.4, 0],
    [0.9, 0.6, -0.3, 0], [0.7, 0.95, 0.05, Math.PI / 2], [0.9, 0.6, 0.4, 0],
  ];
  for (const [len, x, z, ry] of defs) {
    const r = rail(len); r.position.set(x, 0.05, z); r.rotation.y = ry; r.visible = false; g.add(r); rails.push(r);
  }
  const cl1 = barClamp(1.1); cl1.position.set(-0.6, 0, 0.05); cl1.rotation.y = Math.PI / 2; g.add(cl1);
  const cl2 = barClamp(1.1); cl2.position.set(0.6, 0, 0.05); cl2.rotation.y = Math.PI / 2; g.add(cl2);
  return { g, update: p => frac(rails, p) };
}
function visFrameAssembly() {
  const g = new THREE.Group();
  const rails = [];
  const L = 1.7, W = 1.05;
  const defs = [[L, 0, -W / 2, 0], [L, 0, W / 2, 0], [W, -L / 2, 0, Math.PI / 2], [W, L / 2, 0, Math.PI / 2], [W, 0, 0, Math.PI / 2]];
  for (const [len, x, z, ry] of defs) {
    const r = rail(len); r.position.set(x, 0.05, z); r.rotation.y = ry; r.visible = false; g.add(r); rails.push(r);
  }
  const cl = barClamp(1.3); cl.position.set(-L / 2, 0, 0); cl.rotation.y = Math.PI / 2; g.add(cl);
  return { g, update: p => frac(rails, p) };
}
function visMiddleLeg() {
  const g = new THREE.Group();
  const wr = bx(0.34, 0.025, 0.06, MAT.steel); wr.position.set(0.7, 0.02, 0.4); g.add(wr);
  const parts = [];
  const a = rail(0.8); a.position.set(-0.3, 0.05, -0.15); a.visible = false;
  const b = rail(0.8); b.position.set(-0.3, 0.05, 0.2); b.visible = false;
  const c = rail(0.6); c.rotation.y = Math.PI / 2; c.position.set(0.25, 0.05, 0.02); c.visible = false;
  g.add(a, b, c); parts.push(a, b, c);
  return { g, update: p => frac(parts, p) };
}
function visCornerCaps() {
  const g = new THREE.Group();
  const frame = fullFrame(); frame.position.y = 0.05; g.add(frame);
  const paint = cy(0.06, 0.1, MAT.boxWhite); paint.position.set(0.75, 0.05, 0.42); g.add(paint);
  const caps = [];
  for (const [x, z] of [[-0.8, -0.5], [0.8, -0.5], [-0.8, 0.5], [0.8, 0.5]]) {
    const cap = bx(0.13, 0.13, 0.13, MAT.pants); cap.position.set(x, 0.1, z); cap.visible = false; g.add(cap); caps.push(cap);
  }
  return { g, update: p => frac(caps, p) };
}
function visSeatSupport() {
  const g = new THREE.Group();
  const bars = [rail(1.6), rail(1.6)];
  bars[0].position.set(0, 0.04, -0.45); bars[1].position.set(0, 0.04, 0.45);
  bars.forEach(b => { b.scale.y = 0.6; g.add(b); });
  const slats = [];
  for (let i = 0; i < 7; i++) {
    const s = bx(0.14, 0.05, 0.95, MAT.cherry);
    s.position.set(-0.66 + i * 0.22, 0.07, 0); s.visible = false; g.add(s); slats.push(s);
  }
  return { g, update: p => frac(slats, p) };
}
function visFramePrep() {
  const g = new THREE.Group();
  const frame = fullFrame(); frame.position.y = 0.05; g.add(frame);
  const dr = drillTool(); dr.position.set(-0.6, 0.1, 0); g.add(dr);
  return { g, update: p => { dr.position.x = -0.6 + Math.min(1, p) * 1.2; } };
}
function visInstall() {
  // seat-support panel lowering onto the finished frame
  const g = new THREE.Group();
  const frame = fullFrame(); frame.position.y = 0.05; g.add(frame);
  const panel = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const s = bx(0.14, 0.04, 0.9, MAT.cherry);
    s.position.x = -0.6 + i * 0.24; panel.add(s);
  }
  const pb1 = rail(1.5); pb1.scale.y = 0.5; pb1.position.z = -0.42; panel.add(pb1);
  const pb2 = rail(1.5); pb2.scale.y = 0.5; pb2.position.z = 0.42; panel.add(pb2);
  panel.position.y = 0.6; g.add(panel);
  const dr = drillTool(); dr.position.set(0.85, 0.02, 0.45); g.add(dr);
  return { g, update: p => { panel.position.y = 0.6 - Math.min(1, p) * 0.46; } };
}
function visPPE() {
  const g = new THREE.Group();
  const post = cy(0.03, 0.5, MAT.steel); post.position.y = 0.25; g.add(post);
  const board = bx(0.7, 0.45, 0.03, MAT.boxWhite); board.position.y = 0.6; g.add(board);
  const glasses = bx(0.3, 0.07, 0.04, MAT.trimBlue); glasses.position.set(-0.6, 0.06, 0.3); g.add(glasses);
  return { g, update: () => {} };
}
function visGeneric() {
  const g = new THREE.Group();
  const frame = fullFrame(); frame.position.y = 0.05; frame.visible = false; g.add(frame);
  return { g, update: p => { frame.visible = p > 0.05; const s = Math.max(0.05, Math.min(1, p)); frame.scale.set(s, 1, s); } };
}

function stationVisualFor(step) {
  const n = ((step.tag_id ? step.tag_name : step.name) || '').toLowerCase();
  if (n.includes('ppe')) return visPPE();
  if (n.includes('rivet') || n.includes('rivnut')) return visRivnut();
  if (n.includes('connector') && n.includes('pre')) return visConnectorPre();
  if (n.includes('plate')) return visConnectorPlate();
  if (n.includes('attach') && n.includes('connector')) return visAttachConnectors();
  if (n.includes('frame sub')) return visFrameSub();
  if (n.includes('frame connection') || n.includes('frame assembly')) return visFrameAssembly();
  if (n.includes('middle leg')) return visMiddleLeg();
  if (n.includes('corner cap') || n.includes('end cap')) return visCornerCaps();
  if (n.includes('seat support') || n.includes('trellis') || n.includes('assemble frame')) return visSeatSupport();
  if (n.includes('frame prep')) return visFramePrep();
  if (n.includes('installation') && (n.includes('seat') || n.includes('leg'))) return visInstall();
  return visGeneric();
}

/* Workbench like the photos: pine frame, white padded top, bins on the shelf. */
function makeBench(i) {
  const st = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.14, 1.7), MAT.benchTop);
  top.position.y = 0.96; top.castShadow = true; top.receiveShadow = true;
  st.add(top);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(2.72, 0.05, 1.72), i % 2 ? MAT.trimRed : MAT.trimBlue);
  trim.position.y = 0.875; st.add(trim);
  for (const [lx, lz] of [[-1.2, -0.7], [1.2, -0.7], [-1.2, 0.7], [1.2, 0.7]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.95, 0.14), MAT.pine);
    leg.position.set(lx, 0.47, lz); leg.castShadow = true; st.add(leg);
  }
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.07, 1.4), MAT.pine);
  shelf.position.y = 0.42; shelf.castShadow = true; st.add(shelf);
  for (let b = 0; b < 6; b++) {
    const bin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.34), b % 3 === 2 ? MAT.binBlue : MAT.binYellow);
    bin.position.set(-1.05 + b * 0.42, 0.57, 0.35); bin.castShadow = true; st.add(bin);
  }
  // anti-fatigue mat with yellow edges on the operator side
  const mat = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.025, 1.15), MAT.mat);
  mat.position.set(0, 0.013, 1.55); mat.receiveShadow = true; st.add(mat);
  for (const dz of [-0.62, 0.62]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.027, 0.09), MAT.matEdge);
    edge.position.set(0, 0.014, 1.55 + dz); st.add(edge);
  }
  // status ring under the bench
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.85, 0.05, 10, 48), new THREE.MeshStandardMaterial({ color: RING.idle, emissive: 0x000000 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
  st.add(ring);
  return { st, ring };
}

/* Coiled red air hose dropping from overhead, like the photos. */
function makeHose() {
  const pts = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const y = 6.2 - t * 3.6;
    const r = 0.16;
    pts.push(new THREE.Vector3(Math.cos(t * 26) * r, y, Math.sin(t * 26) * r));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.022, 6), MAT.hose);
  return tube;
}

function makeRack() {
  const g = new THREE.Group();
  const W = 6, D = 1.2, H = 4;
  for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, H, 0.12), MAT.rackPost);
    post.position.set(x, H / 2, z); g.add(post);
  }
  for (const y of [1.3, 2.6, 3.9]) {
    for (const z of [-D / 2, D / 2]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(W, 0.12, 0.1), MAT.rackBeam);
      beam.position.set(0, y, z); g.add(beam);
    }
    for (let b = 0; b < 4; b++) {
      if (Math.random() < 0.25) continue;
      const bw = 0.9 + Math.random() * 0.4;
      const box = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.55 + Math.random() * 0.3, 1.0), Math.random() < 0.3 ? MAT.boxWhite : MAT.box);
      box.position.set(-W / 2 + 0.8 + b * 1.45, y + 0.35, 0); box.castShadow = true; g.add(box);
    }
  }
  return g;
}

function makeFan() {
  const g = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.3, 12), MAT.steel);
  g.add(hub);
  const blades = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.04, 0.3), MAT.steel);
    b.position.x = 1.4;
    const holder = new THREE.Group(); holder.rotation.y = (i / 6) * Math.PI * 2; holder.add(b);
    blades.add(holder);
  }
  g.add(blades);
  g.userData.blades = blades;
  return g;
}

/* ------------------------------- component ------------------------------- */

const OP_COLORS = [0x2d6cdf, 0xd9772e, 0x1c7c3c, 0xb03a9c, 0xc9a227, 0x16a3a3, 0xb3261e, 0x5b5ea6];

function makeNameTag(name, colorHex) {
  const c = document.createElement('canvas'); c.width = 320; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#' + colorHex.toString(16).padStart(6, '0');
  x.beginPath(); x.roundRect(0, 0, 320, 96, 30); x.fill();
  x.fillStyle = '#ffffff'; x.font = '900 52px Arial, sans-serif'; x.textAlign = 'center';
  x.fillText(String(name).slice(0, 12), 160, 64);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(1.5, 0.45, 1);
  sp.renderOrder = 998;
  return sp;
}

function makeCrewFigure(colorHex, name) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.85 });
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.55, 10), MAT.pants);
  legs.position.y = 0.28; legs.castShadow = true;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.42, 4, 10), shirt);
  torso.position.y = 0.85; torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 14), MAT.skin);
  head.position.y = 1.32; head.castShadow = true;
  const tag = makeNameTag(name, colorHex);
  tag.position.y = 1.85;
  g.add(legs, torso, head, tag);
  return g;
}

const loadAssign = skuId => { try { return JSON.parse(localStorage.getItem(`sw-assign-${skuId}`)) || {}; } catch { return {}; } };
const saveAssign = (skuId, a) => { try { localStorage.setItem(`sw-assign-${skuId}`, JSON.stringify(a)); } catch {} };

export default function Floor() {
  const mountRef = useRef();
  const three = useRef({});
  const simRef = useRef(null);
  const tRef = useRef(0);
  const playingRef = useRef(false);
  const speedRef = useRef(120);
  const clockRef = useRef();
  const sliderRef = useRef();
  const activeRef = useRef();
  const idleCountRef = useRef();

  const [skus, setSkus] = useState([]);
  const [skuId, setSkuId] = useState(null);
  const [size, setSize] = useState(null);
  const [detail, setDetail] = useState(null);
  const [operators, setOperators] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(120);
  const [helping, setHelping] = useState(true);
  const [shiftHours, setShiftHours] = useState(8);
  const [target, setTarget] = useState(8);
  const [quantity, setQuantity] = useState(3);
  const [assignments, setAssignments] = useState({}); // opId -> {own:[seq], help:[seq]}
  const [showAssign, setShowAssign] = useState(false);

  useEffect(() => {
    api.get('/api/skus').then(list => { setSkus(list); if (list.length) setSkuId(p => p ?? list[0].id); });
    api.get('/api/operators').then(setOperators);
  }, []);
  useEffect(() => { if (skuId == null) return; setSize(null); setAssignments(loadAssign(skuId)); api.get(`/api/skus/${skuId}`).then(setDetail); }, [skuId]);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  const activeOps = operators.filter(o => o.active);
  const sizes = detail ? [...new Set(detail.steps.flatMap(s => s.size_times ? Object.keys(s.size_times) : []))] : [];
  const activeSize = size ?? (sizes.length ? sizes[Math.floor((sizes.length - 1) / 2)] : null);
  const durOfStep = s => (activeSize && s.size_times && s.size_times[activeSize] != null) ? s.size_times[activeSize] : (s.effective_seconds || 0);

  const simSteps = useMemo(() => detail ? detail.steps.map(s => ({
    id: s.id, depends_on: s.depends_on || [],
    effective_seconds: durOfStep(s),
    helpable: !!s.helpable, help_seconds: s.help_seconds || 0,
  })) : [], [detail, activeSize]); // eslint-disable-line

  const sim = useMemo(() => {
    if (!simSteps.length || !activeOps.length) return null;
    const seqToId = {};
    detail.steps.forEach(s => { seqToId[s.sequence] = s.id; });
    const assignArr = activeOps.map(op => {
      const a = assignments[op.id] || {};
      return {
        own: (a.own || []).map(q => seqToId[q]).filter(Boolean),
        help: (a.help || []).map(q => seqToId[q]).filter(Boolean),
      };
    });
    return simulateBuild(simSteps, activeOps.length, { helping, assignments: assignArr, quantity });
  }, [simSteps, activeOps.length, assignments, helping, detail, quantity]); // eslint-disable-line

  // keep the render loop fed
  useEffect(() => {
    simRef.current = sim;
    if (three.current) three.current.total = sim ? sim.makespan : 0;
    if (sliderRef.current && sim) { sliderRef.current.max = sim.makespan; if (tRef.current > sim.makespan) { tRef.current = 0; sliderRef.current.value = 0; } }
  }, [sim]);

  // ---- Scene setup (once) ----
  useEffect(() => {
    initMats();
    const mount = mountRef.current;
    const w = mount.clientWidth, h = mount.clientHeight || 520;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xd9dee3);
    scene.fog = new THREE.Fog(0xd9dee3, 38, 95);

    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 220);
    camera.position.set(18, 13, 25);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.target.set(0, 0.8, 0); controls.maxPolarAngle = Math.PI / 2.05;
    controls.maxDistance = 45;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8e9298, 0.95));
    const sun = new THREE.DirectionalLight(0xfff6e8, 1.15);
    sun.position.set(14, 22, 10); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    for (const [k, v] of Object.entries({ left: -30, right: 30, top: 30, bottom: -30 })) sun.shadow.camera[k] = v;
    scene.add(sun);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    scene.add(floor);

    for (const z of [-1.7, 1.7]) {
      const tape = new THREE.Mesh(new THREE.BoxGeometry(34, 0.012, 0.12), MAT.tape);
      tape.position.set(0, 0.006, z);
      scene.add(tape);
    }
    for (const [cx, cz] of [[-22, -12], [22, -12], [-22, 12], [22, 12]]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.7, 7.5, 0.7), MAT.column);
      col.position.set(cx, 3.75, cz); col.castShadow = true;
      scene.add(col);
    }
    for (const [rx, rz, ry] of [[-30, -8, Math.PI / 2], [-30, 0, Math.PI / 2], [-30, 8, Math.PI / 2],
                                [30, -8, -Math.PI / 2], [30, 0, -Math.PI / 2], [30, 8, -Math.PI / 2],
                                [-10, -26, 0], [0, -26, 0], [10, -26, 0]]) {
      const rack = makeRack(); rack.position.set(rx, 0, rz); rack.rotation.y = ry;
      scene.add(rack);
    }
    for (let lx = -12; lx <= 12; lx += 6) {
      for (const lz of [-6, 0, 6]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 0.18),
          new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf5f2e8, emissiveIntensity: 1.4 }));
        strip.position.set(lx, 6.4, lz);
        scene.add(strip);
      }
    }
    const fans = [];
    for (const fx of [-8, 8]) {
      const fan = makeFan(); fan.position.set(fx, 7, 0); scene.add(fan); fans.push(fan);
    }

    three.current = { scene, camera, renderer, controls, stationGroup: null, fans, total: 0 };

    const ro = new ResizeObserver(() => {
      const W = mount.clientWidth, H = mount.clientHeight || 520;
      camera.aspect = W / H; camera.updateProjectionMatrix(); renderer.setSize(W, H);
    });
    ro.observe(mount);

    let raf, last = performance.now();
    const loop = (now) => {
      const dt = (now - last) / 1000; last = now;
      if (playingRef.current) {
        tRef.current += dt * speedRef.current;
        const tot = three.current.total || 0;
        if (tRef.current >= tot) { tRef.current = tot; playingRef.current = false; setPlaying(false); }
      }
      for (const f of three.current.fans || []) f.userData.blades.rotation.y += dt * 0.8;
      updateStations();
      updateCrew(dt);
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
      renderer.dispose(); mount.removeChild(renderer.domElement);
    };
  }, []); // eslint-disable-line

  // ---- Build stations when SKU/size changes ----
  useEffect(() => {
    const ctx = three.current;
    if (!ctx.scene || !detail) return;
    if (ctx.stationGroup) ctx.scene.remove(ctx.stationGroup);
    const group = new THREE.Group();
    ctx.scene.add(group);

    const steps = detail.steps;
    const pairs = Math.ceil(steps.length / 2);
    const spacing = 6.6;
    const offset = ((pairs - 1) * spacing) / 2;
    const stations = [];
    const benchSpots = new Map(); // stepId -> { primary: Vector3, helper: Vector3 }
    steps.forEach((s, i) => {
      const col = Math.floor(i / 2), row = i % 2;
      const px = col * spacing - offset;
      const pz = row === 0 ? -3.1 : 3.1;
      const { st, ring } = makeBench(i);
      st.position.set(px, 0, pz);
      if (row === 1) st.rotation.y = Math.PI;

      const visual = stationVisualFor(s);
      visual.g.position.y = 1.06;
      visual.update(0);
      st.add(visual.g);

      const dur = durOfStep(s);
      const label = makeLabel(s.sequence, fullName(s), dur > 0 ? formatTime(dur) : 'no time');
      label.position.set(0, 3.5 + (i % 2) * 1.15, 0); st.add(label);
      group.add(st);
      st.updateMatrixWorld(true);
      benchSpots.set(s.id, {
        primary: st.localToWorld(new THREE.Vector3(-0.55, 0, 1.55)),
        helper: st.localToWorld(new THREE.Vector3(0.75, 0, 1.55)),
      });
      stations.push({ stepId: s.id, name: shortName(s), seq: s.sequence, ring: ring.material, visual, noTime: dur <= 0 });
    });

    ctx.controls.target.set(0, 0.8, 0);
    ctx.stationGroup = group;
    ctx.stations = stations;
    ctx.benchSpots = benchSpots;
    tRef.current = 0; if (sliderRef.current) sliderRef.current.value = 0;
  }, [detail, size]); // eslint-disable-line

  // ---- Crew figures (named, colored) ----
  useEffect(() => {
    const ctx = three.current;
    if (!ctx.scene) return;
    if (ctx.crewGroup) ctx.scene.remove(ctx.crewGroup);
    const crewGroup = new THREE.Group();
    ctx.scene.add(crewGroup);
    const crew = activeOps.map((op, i) => {
      const color = OP_COLORS[i % OP_COLORS.length];
      const fig = makeCrewFigure(color, op.name);
      const home = new THREE.Vector3((i - (activeOps.length - 1) / 2) * 1.6, 0, 0);
      fig.position.copy(home);
      crewGroup.add(fig);
      return { fig, home, name: op.name, color };
    });
    ctx.crewGroup = crewGroup;
    ctx.crew = crew;
  }, [operators.length, activeOps.map(o => o.id + o.name).join(',')]); // eslint-disable-line

  function updateStations() {
    const ctx = three.current;
    const sm = simRef.current;
    if (!ctx.stations || !sm) return;
    const t = tRef.current;
    for (const s of ctx.stations) {
      // station = a template; may have several unit-instances over time
      const insts = sm.byTemplate.get(s.stepId) || [];
      const act = insts.find(e => e.start != null && t >= e.start && (e.finish == null || t < e.finish));
      let state, prog;
      if (act) { state = 'active'; prog = act.finish > act.start ? (t - act.start) / (act.finish - act.start) : 1; }
      else if (insts.length && insts.every(e => e.finish != null && t >= e.finish)) { state = 'done'; prog = 1; }
      else { state = 'idle'; prog = 0; }
      if (s.noTime && t > 0) {
        s.ring.color.setHex(0xd9a427); s.ring.emissive.setHex(0x000000);
      } else {
        s.ring.color.setHex(RING[state]);
        s.ring.emissive.setHex(state === 'active' ? 0x0c4a22 : 0x000000);
      }
      s.visual.update(prog);
    }
    if (clockRef.current) clockRef.current.textContent = `${formatTime(t)} / ${formatTime(ctx.total || 0)}`;
    if (sliderRef.current && playingRef.current) sliderRef.current.value = t;
  }

  function updateCrew(dt) {
    const ctx = three.current;
    const sm = simRef.current;
    if (!ctx.crew || !sm || !ctx.benchSpots) return;
    const t = tRef.current;
    const lines = [];
    let activeCount = 0;
    ctx.crew.forEach((c, i) => {
      const intervals = sm.operators[i]?.intervals || [];
      const iv = intervals.find(v => t >= v.start && t < v.end);
      let target = c.home, working = false;
      if (iv) {
        const spots = ctx.benchSpots.get(iv.template);
        if (spots) { target = iv.role === 'help' ? spots.helper : spots.primary; working = true; activeCount++; }
        const stn = ctx.stations.find(x => x.stepId === iv.template);
        if (stn) lines.push(`${c.name} → ${stn.seq}. ${stn.name}${sm.quantity > 1 ? ` #${(iv.unit ?? 0) + 1}` : ''}${iv.role === 'help' ? ' (helping)' : ''}`);
      }
      const k = 1 - Math.exp(-dt * 3);
      c.fig.position.x += (target.x - c.fig.position.x) * k;
      c.fig.position.z += (target.z - c.fig.position.z) * k;
      const distSq = (target.x - c.fig.position.x) ** 2 + (target.z - c.fig.position.z) ** 2;
      c.fig.position.y = working && distSq < 0.05 ? Math.abs(Math.sin(t * 3 + i)) * 0.05 : 0;
    });
    if (activeRef.current) {
      activeRef.current.textContent = lines.length ? lines.join('  ·  ')
        : (t >= (ctx.total || 0) && ctx.total ? 'all units complete' : 'crew idle');
    }
    if (idleCountRef.current) {
      const idleN = ctx.crew.length - activeCount;
      const unitsDone = sm.unitFinishes.filter(f => t >= f && f > 0).length;
      idleCountRef.current.textContent = `${activeCount} working · ${idleN} idle  ·  units finished ${unitsDone}/${sm.quantity}`;
    }
  }

  const noTimeSteps = detail ? detail.steps.filter(s => durOfStep(s) <= 0) : [];
  const shiftSeconds = Math.round(shiftHours * 3600);
  const unitsPerShift = sim && sim.makespan > 0 ? Math.floor((quantity / sim.makespan) * shiftSeconds) : 0;
  const hitsTarget = unitsPerShift >= target;
  const neverStarted = sim && detail ? detail.steps.filter(s => {
    const insts = sim.byTemplate.get(s.id) || [];
    return insts.length > 0 && insts.every(e => e.start == null);
  }) : [];

  function toggleAssign(opId, kind, seq) {
    setAssignments(prev => {
      const next = { ...prev, [opId]: { own: [...(prev[opId]?.own || [])], help: [...(prev[opId]?.help || [])] } };
      const arr = next[opId][kind];
      const ix = arr.indexOf(seq);
      if (ix >= 0) arr.splice(ix, 1); else arr.push(seq);
      saveAssign(skuId, next);
      return next;
    });
  }
  const anyAssigned = Object.values(assignments).some(a => (a.own?.length || 0) + (a.help?.length || 0) > 0);

  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0 }}>3D Floor — simulation</h1>
        <div className="spacer" />
        <select value={skuId || ''} onChange={e => setSkuId(Number(e.target.value))} style={{ width: 240 }}>
          {skus.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {sizes.length > 0 && (
          <select value={activeSize || ''} onChange={e => setSize(e.target.value)} style={{ width: 160 }}>
            {sizes.map(sz => <option key={sz} value={sz}>{sizeLabel(sz)}</option>)}
          </select>
        )}
      </div>
      <p className="subtitle">Your crew, simulated: named operators walk between benches, helping where you send them and peeling off when their own task is ready. Change assignments below and the whole run recomputes.</p>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div ref={mountRef} style={{ width: '100%', height: 520, position: 'relative' }} />
      </div>

      {sim && (
        <div className="card">
          <div className="row" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="field" style={{ maxWidth: 130 }}>
              <label>Make (units)</label>
              <input type="number" min="1" max="30" value={quantity} onChange={e => setQuantity(Math.max(1, Math.min(30, Number(e.target.value))))} />
            </div>
            <div className="stat" style={{ borderLeftColor: '#1a56b0' }}>
              <div className="stat-value">{formatLong(sim.makespan)}</div>
              <div className="stat-label">to build {quantity} with {activeOps.length} operators{helping ? ' + helping' : ''}</div>
            </div>
            <div className="stat" style={{ borderLeftColor: hitsTarget ? '#1c7c3c' : '#b3261e' }}>
              <div className="stat-value">{unitsPerShift} / {target}</div>
              <div className="stat-label">units/{shiftHours}h vs target</div>
            </div>
            <div className="stat" style={{ borderLeftColor: sim.utilization < 0.5 ? '#b3261e' : sim.utilization < 0.75 ? '#e0913d' : '#1c7c3c' }}>
              <div className="stat-value">{Math.round(sim.utilization * 100)}%</div>
              <div className="stat-label">crew utilization ({formatLong(sim.idleSeconds)} idle total)</div>
            </div>
            <div className="field" style={{ maxWidth: 90 }}>
              <label>Target</label>
              <input type="number" min="1" value={target} onChange={e => setTarget(Math.max(1, Number(e.target.value)))} />
            </div>
            <div className="field" style={{ maxWidth: 90 }}>
              <label>Shift (h)</label>
              <input type="number" min="0.5" step="0.5" value={shiftHours} onChange={e => setShiftHours(Math.max(0.5, Number(e.target.value)))} />
            </div>
            <div className="field" style={{ maxWidth: 150 }}>
              <label>Auto-helping</label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', textTransform: 'none', fontWeight: 400, marginTop: 6 }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={helping} onChange={e => setHelping(e.target.checked)} />
                idle ops help
              </label>
            </div>
          </div>
          {neverStarted.length > 0 && (
            <div className="alert error" style={{ marginTop: 8 }}>
              Never started: {neverStarted.map(s => `${s.sequence}. ${(s.tag_id ? s.tag_name : s.name)}`).join(', ')} — an assigned owner may never be free, or the dependency graph is blocked.
            </div>
          )}
        </div>
      )}

      {sim && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Operator workload <span className="muted" style={{ fontWeight: 400 }}>— building {quantity} unit{quantity > 1 ? 's' : ''}; who works and who waits</span></h2>
          {activeOps.map((op, i) => {
            const o = sim.operators[i] || { busySeconds: 0, idleSeconds: 0 };
            const busyPct = sim.makespan > 0 ? (o.busySeconds / sim.makespan) * 100 : 0;
            return (
              <div key={op.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ width: 110, fontWeight: 600 }}>
                  <span style={{ display: 'inline-block', width: 11, height: 11, borderRadius: 6, background: '#' + OP_COLORS[i % OP_COLORS.length].toString(16).padStart(6, '0'), marginRight: 6 }} />
                  {op.name}
                </span>
                <div style={{ flex: 1, height: 20, background: '#e7e3da', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ width: `${busyPct}%`, height: '100%', background: busyPct < 35 ? '#b3261e' : busyPct < 70 ? '#e0913d' : '#1c7c3c' }} />
                </div>
                <span className="muted" style={{ width: 200, fontSize: 12, textAlign: 'right' }}>
                  busy {formatLong(o.busySeconds)} · <strong style={{ color: o.idleSeconds > o.busySeconds ? '#b3261e' : 'inherit' }}>idle {formatLong(o.idleSeconds)}</strong> ({Math.round(busyPct)}%)
                </span>
              </div>
            );
          })}
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Bars are share of the run each operator is working. Lots of red/short bars = too many people for this many units — raise "Make" or drop operators. Building more units at once keeps the crew busier (that's flow).
          </p>
        </div>
      )}

      <div className="card">
        <div className="toolbar" style={{ marginBottom: 8 }}>
          <button className="primary" onClick={() => {
            if (tRef.current >= (three.current.total || 0)) { tRef.current = 0; }
            setPlaying(p => !p);
          }}>{playing ? '⏸ Pause' : '▶ Play'}</button>
          <button className="small" onClick={() => { tRef.current = 0; if (sliderRef.current) sliderRef.current.value = 0; setPlaying(false); }}>⟲ Reset</button>
          <span ref={clockRef} className="time" style={{ fontSize: 16, minWidth: 150 }}>0:00 / {formatTime(sim ? sim.makespan : 0)}</span>
          <div className="spacer" />
          <button className={showAssign ? 'small primary' : 'small'} onClick={() => setShowAssign(v => !v)}>
            {showAssign ? 'Hide assignments' : '⚙ Assignments'}{anyAssigned ? ' •' : ''}
          </button>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', textTransform: 'none', fontWeight: 400, minWidth: 230 }}>
            Speed <strong style={{ minWidth: 52, textAlign: 'right' }}>{speed}×</strong>
            <input type="range" min="5" max="1200" step="5" value={speed} style={{ width: 120 }}
              onChange={e => setSpeed(Number(e.target.value))} />
          </label>
        </div>
        <input ref={sliderRef} type="range" min="0" max={sim ? sim.makespan : 1} defaultValue="0" style={{ width: '100%' }}
          onInput={e => { tRef.current = Number(e.target.value); setPlaying(false); }} />
        <div className="muted" style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span>Crew: <strong ref={activeRef}>idle</strong></span>
          <strong ref={idleCountRef} style={{ whiteSpace: 'nowrap' }} />
        </div>
        {noTimeSteps.length > 0 && (
          <div className="alert warn" style={{ marginTop: 8, padding: '6px 10px', fontSize: 12 }}>
            {noTimeSteps.map(s => (s.tag_id ? s.tag_name : s.name)).join(', ')} {noTimeSteps.length === 1 ? 'has' : 'have'} no recorded time — they run instantly (amber ring).
          </div>
        )}
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          <span style={{ color: '#1fa84f' }}>● working</span> &nbsp; <span style={{ color: '#1a56b0' }}>● done</span> &nbsp; <span style={{ color: '#8e98a6' }}>● waiting</span>
          &nbsp;— mark steps helpable (and set 2-person times) on the <strong>Staffing</strong> page; the same flags drive this simulation.
        </div>
      </div>

      {showAssign && detail && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Operator assignments <span className="muted" style={{ fontWeight: 400 }}>— OWN: only they run it. HELP: where they go when idle (until their own task is ready). Blank = automatic.</span></h2>
          <table className="data">
            <thead>
              <tr><th style={{ width: 130 }}>Operator</th><th>Owns steps</th><th>Helps on (when idle)</th></tr>
            </thead>
            <tbody>
              {activeOps.map((op, i) => {
                const a = assignments[op.id] || {};
                return (
                  <tr key={op.id}>
                    <td>
                      <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 6, background: '#' + OP_COLORS[i % OP_COLORS.length].toString(16).padStart(6, '0'), marginRight: 6 }} />
                      <strong>{op.name}</strong>
                    </td>
                    <td>
                      {detail.steps.map(s => (
                        <button key={s.id} className={`chip-mini ${(a.own || []).includes(s.sequence) ? 'on' : ''}`}
                          title={(s.tag_id ? s.tag_name : s.name) || ''}
                          onClick={() => toggleAssign(op.id, 'own', s.sequence)}>{s.sequence}</button>
                      ))}
                    </td>
                    <td>
                      {detail.steps.filter(s => s.helpable).map(s => (
                        <button key={s.id} className={`chip-mini help ${(a.help || []).includes(s.sequence) ? 'on' : ''}`}
                          title={(s.tag_id ? s.tag_name : s.name) || ''}
                          onClick={() => toggleAssign(op.id, 'help', s.sequence)}>{s.sequence}</button>
                      ))}
                      {detail.steps.filter(s => s.helpable).length === 0 && <span className="muted" style={{ fontSize: 12 }}>no steps marked helpable yet (Staffing page)</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="toolbar" style={{ marginTop: 8 }}>
            <button className="small" onClick={() => { setAssignments({}); saveAssign(skuId, {}); }}>Reset all to automatic</button>
            <span className="muted" style={{ fontSize: 12 }}>Assignments are saved per product on this computer. The simulation, stats, and 3D playback all recompute instantly when you change them.</span>
          </div>
        </div>
      )}
    </>
  );
}
