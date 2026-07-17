import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PublicClientApplication } from '@azure/msal-browser';   // TUUCI shared data (Phase 1): sign in with the company M365 account

// Capture the pristine page HTML before the 3D scene mutates the DOM, so we can
// bake the current layouts into a fresh self-contained copy of this app.
const __ORIGINAL_HTML = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;

/* ============================================================
   MERITAGE 3-SEATER — standalone 3D line model
   Look modeled on the original app's Floor.jsx; structure is our
   as-built layout: 5 parallel feeders -> full assembly -> packing.
   ============================================================ */

const RING = { idle: 0x8e98a6, active: 0x1fa84f, done: 0x1a56b0, wait: 0xc06a2e };

/* ---------- materials & textures ---------- */
function concreteTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#cdd1d4'; x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 120; i++) {
    const r = 20 + Math.random() * 80;
    const g = 196 + Math.floor(Math.random() * 24);
    x.fillStyle = `rgba(${g},${g},${g + 3},${0.03 + Math.random() * 0.05})`;
    x.beginPath(); x.arc(Math.random() * 512, Math.random() * 512, r, 0, 7); x.fill();
  }
  x.strokeStyle = 'rgba(140,144,148,0.25)'; x.lineWidth = 1.5;
  for (const p of [128, 256, 384]) {
    x.beginPath(); x.moveTo(p, 0); x.lineTo(p, 512); x.stroke();
    x.beginPath(); x.moveTo(0, p); x.lineTo(512, p); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 8);
  return t;
}

const MAT = {};
function initMats() {
  MAT.pine = new THREE.MeshStandardMaterial({ color: 0xc9a06c, roughness: 0.8 });
  MAT.benchTop = new THREE.MeshStandardMaterial({ color: 0xf4f1e9, roughness: 0.9 });
  MAT.trimBlue = new THREE.MeshStandardMaterial({ color: 0x2e4a7a, roughness: 0.75 });
  MAT.binYellow = new THREE.MeshStandardMaterial({ color: 0xd3aa3a, roughness: 0.7 });
  MAT.binBlue = new THREE.MeshStandardMaterial({ color: 0x33598f, roughness: 0.7 });
  MAT.cherry = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.4, metalness: 0.3 });
  MAT.chrome = new THREE.MeshStandardMaterial({ color: 0xdce0e4, roughness: 0.22, metalness: 0.9 });
  MAT.mat = new THREE.MeshStandardMaterial({ color: 0x32363c, roughness: 0.95 });
  MAT.matEdge = new THREE.MeshStandardMaterial({ color: 0xc7b53e, roughness: 0.9 });
  MAT.tape = new THREE.MeshStandardMaterial({ color: 0xd9c544, roughness: 0.85 });
  MAT.column = new THREE.MeshStandardMaterial({ color: 0xf0f0ee, roughness: 0.85 });
  MAT.rackPost = new THREE.MeshStandardMaterial({ color: 0x2b5fa8, roughness: 0.6, metalness: 0.2 });
  MAT.rackBeam = new THREE.MeshStandardMaterial({ color: 0xd2762a, roughness: 0.6, metalness: 0.2 });
  MAT.box = new THREE.MeshStandardMaterial({ color: 0xcbb08a, roughness: 0.95 });
  MAT.boxWhite = new THREE.MeshStandardMaterial({ color: 0xf2f2ef, roughness: 0.9 });
  MAT.hose = new THREE.MeshStandardMaterial({ color: 0xa83d33, roughness: 0.55 });
  MAT.shirt = new THREE.MeshStandardMaterial({ color: 0x767d88, roughness: 0.9 });
  MAT.pants = new THREE.MeshStandardMaterial({ color: 0x31363f, roughness: 0.9 });
  MAT.skin = new THREE.MeshStandardMaterial({ color: 0xc89576, roughness: 0.8 });
  MAT.steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.5, metalness: 0.6 });
}

const bx = (w, h, d, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = true; return m; };
const cyl = (r, h, mat) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10), mat); m.castShadow = true; return m; };
const rail = (len, mat = MAT.cherry) => bx(len, 0.1, 0.1, mat);

// shrink a font size until the text fits a given pixel width (keeps long titles readable instead of colliding)
function fitFont(x, text, weight, startPx, maxW, minPx = 34) {
  let px = startPx;
  for (; px > minPx; px -= 2) { x.font = weight + ' ' + px + 'px Arial, sans-serif'; if (x.measureText(text).width <= maxW) break; }
  return px;
}
function crispTex(c) {   // sharper, truer label textures: sRGB + max anisotropy, exempt from tone mapping via the material
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 16; tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
function makeStationLabel(title, sub, timeStr, accent = '#1d3a66') {
  const W = 900, H = 250;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const draw = (timeStr2, accent2) => {
    x.clearRect(0, 0, W, H);
    x.fillStyle = 'rgba(10,16,26,0.18)'; x.beginPath(); x.roundRect(14, 18, W - 22, H - 24, 22); x.fill();
    x.fillStyle = '#ffffff'; x.beginPath(); x.roundRect(8, 8, W - 26, H - 28, 22); x.fill();
    x.fillStyle = accent2 || accent; x.beginPath(); x.roundRect(8, 8, W - 26, 96, 22); x.fill();
    x.fillStyle = accent2 || accent; x.fillRect(8, 62, W - 26, 42);
    x.textBaseline = 'middle';
    x.font = '800 54px Arial, sans-serif';
    const timeW = x.measureText(timeStr2).width;
    x.textAlign = 'left'; x.fillStyle = '#ffffff';
    fitFont(x, title, '900', 62, W - 90 - timeW);            // title shrinks instead of running into the time
    x.fillText(title, 34, 58);
    x.textAlign = 'right'; x.font = '800 54px Arial, sans-serif';
    x.fillText(timeStr2, W - 40, 58);
    x.textAlign = 'left'; x.fillStyle = '#10151d';
    fitFont(x, sub, '700', 58, W - 90);
    x.fillText(sub, 36, 172);
    x.textBaseline = 'alphabetic';
  };
  draw(timeStr, accent);
  const tex = crispTex(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false }));
  sp.scale.set(3.7, 1.0, 1); sp.renderOrder = 999;
  sp.userData.redraw = (timeStr2, accent2) => { draw(timeStr2, accent2); tex.needsUpdate = true; };
  return sp;
}

function makeMiniLabel(title, accent) {
  const c = document.createElement('canvas'); c.width = 480; c.height = 96; const x = c.getContext('2d');
  x.fillStyle = accent || '#1d3a66'; x.beginPath(); x.roundRect(8, 18, 464, 60, 16); x.fill();
  x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  fitFont(x, title, '800', 46, 436);                          // long station names shrink to fit instead of clipping
  x.fillText(title, 240, 49);
  const tex = crispTex(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false }));
  sp.scale.set(2.6, 0.52, 1); sp.renderOrder = 999;
  return sp;
}
function makeNameTag(name, colorHex) {
  const c = document.createElement('canvas'); c.width = 320; c.height = 92;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.beginPath(); x.roundRect(0, 0, 320, 92, 28); x.fill();
  x.fillStyle = '#' + colorHex.toString(16).padStart(6, '0');
  x.beginPath(); x.roundRect(0, 0, 18, 92, { tl: 28, bl: 28, tr: 0, br: 0 }); x.fill();
  x.fillStyle = '#1a2230'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const nm = String(name).slice(0, 14);
  fitFont(x, nm, '800', 46, 280);
  x.fillText(nm, 168, 48);
  const tex = crispTex(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, opacity: 0.97, toneMapped: false }));
  sp.scale.set(1.32, 0.38, 1); sp.renderOrder = 998;
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
  const tag = makeNameTag(name, colorHex); tag.position.y = 1.8;
  g.add(legs, torso, head, tag);
  g.scale.set(1.06, 1.17, 1.06);   // true scale: ~5'9" (1.75 m) operator next to 38" benches
  return g;
}

function makeHose() {
  const pts = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60; const y = 6.2 - t * 3.6; const r = 0.16;
    pts.push(new THREE.Vector3(Math.cos(t * 26) * r, y, Math.sin(t * 26) * r));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.022, 6), MAT.hose);
}

const FT = 0.3048;   // metres per foot (world units = metres; CAD scale 3/8"=1'-0")
const YARD = 0.9144; // 1 yard = 0.9144 m
function makeBench(lenFt = 8, depFt = 3) {
  const W = lenFt * FT, D = depFt * FT;
  const st = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(W, 0.14, D), MAT.benchTop);
  top.position.y = 0.96; top.castShadow = true; top.receiveShadow = true; st.add(top);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.05, D + 0.02), MAT.trimBlue);
  trim.position.y = 0.875; st.add(trim);
  const li = Math.min(0.13, W/2 - 0.05), ld = Math.min(0.13, D/2 - 0.05);
  for (const [lx, lz] of [[-W/2+li, -D/2+ld], [W/2-li, -D/2+ld], [-W/2+li, D/2-ld], [W/2-li, D/2-ld]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.95, 0.1), MAT.pine);
    leg.position.set(lx, 0.47, lz); leg.castShadow = true; st.add(leg);
  }
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.06, Math.max(0.25, D - 0.2)), MAT.pine);
  shelf.position.y = 0.42; shelf.castShadow = true; st.add(shelf);
  const nb = Math.max(2, Math.floor(W / 0.45));
  for (let b = 0; b < nb; b++) {
    const bin = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, Math.min(0.28, D - 0.3)), b % 3 === 2 ? MAT.binBlue : MAT.binYellow);
    bin.position.set(-W/2 + 0.25 + b * (W - 0.5) / (nb - 1 || 1), 0.57, -D/2 + 0.16); bin.castShadow = true; st.add(bin);
  }
  // anti-fatigue mat on the operator side (front, +z) — bench length x 1 yd
  const mat = new THREE.Mesh(new THREE.BoxGeometry(W, 0.025, YARD), MAT.mat);
  mat.position.set(0, 0.013, D/2 + 0.6); mat.receiveShadow = true; st.add(mat);
  for (const dz of [-YARD/2, YARD/2]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(W, 0.027, 0.08), MAT.matEdge);
    edge.position.set(0, 0.014, D/2 + 0.6 + dz); st.add(edge);
  }
  const led = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.05, 0.05),
    new THREE.MeshStandardMaterial({ color: RING.idle, emissive: 0x000000, emissiveIntensity: 1.6, roughness: 0.4 }));
  led.position.set(0, 1.045, D/2 + 0.03); st.add(led);
  return { st, led: led.material };
}

function makePartsCart() {
  const g = new THREE.Group();
  for (const [x, z] of [[-0.46, -0.3], [0.46, -0.3], [-0.46, 0.3], [0.46, 0.3]]) {
    const post = bx(0.05, 0.92, 0.05, MAT.steel); post.position.set(x, 0.5, z); g.add(post);
  }
  for (const y of [0.34, 0.78]) { const sh = bx(1.0, 0.04, 0.68, MAT.steel); sh.position.set(0, y, 0); g.add(sh); }
  for (const y of [0.34, 0.78]) for (let i = 0; i < 3; i++) {
    const bin = bx(0.28, 0.16, 0.52, MAT.binYellow); bin.position.set(-0.32 + i * 0.32, y + 0.1, 0); g.add(bin);   // all bins one color
  }
  for (const [x, z] of [[-0.46, -0.3], [0.46, -0.3], [-0.46, 0.3], [0.46, 0.3]]) {
    const c = cyl(0.07, 0.05, MAT.pants); c.rotation.x = Math.PI / 2; c.position.set(x, 0.07, z); g.add(c);
  }
  const handle = bx(0.05, 0.05, 0.68, MAT.steel); handle.position.set(-0.52, 0.92, 0); g.add(handle);
  return g;
}

function makeRack() {
  const g = new THREE.Group(); const W = 6, D = 1.2, H = 4;
  for (const x of [-W/2, W/2]) for (const z of [-D/2, D/2]) {
    const post = bx(0.12, H, 0.12, MAT.rackPost); post.position.set(x, H/2, z); g.add(post);
  }
  for (const y of [1.3, 2.6, 3.9]) {
    for (const z of [-D/2, D/2]) { const beam = bx(W, 0.12, 0.1, MAT.rackBeam); beam.position.set(0, y, z); g.add(beam); }
    for (let b = 0; b < 4; b++) {
      if (Math.random() < 0.25) continue;
      const bw = 0.9 + Math.random() * 0.4;
      const box = bx(bw, 0.55 + Math.random() * 0.3, 1.0, Math.random() < 0.3 ? MAT.boxWhite : MAT.box);
      box.position.set(-W/2 + 0.8 + b * 1.45, y + 0.35, 0); g.add(box);
    }
  }
  return g;
}

function makeFan() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.3, 12), MAT.steel));
  const blades = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const b = bx(2.6, 0.04, 0.3, MAT.steel); b.position.x = 1.4;
    const holder = new THREE.Group(); holder.rotation.y = (i / 6) * Math.PI * 2; holder.add(b); blades.add(holder);
  }
  g.add(blades); g.userData.blades = blades; return g;
}

/* ---- progressive sofa (the product) ---- */
function makeSofaProduct() {
  const g = new THREE.Group();
  const W = 1.9, D = 0.95;
  const cushion = new THREE.MeshStandardMaterial({ color: 0xcabfa6, roughness: 0.92 });
  const parts = [];
  const add = (mesh, from, grow = false) => { mesh.visible = false; mesh.userData.from = from; mesh.userData.grow = grow; parts.push(mesh); g.add(mesh); return mesh; };
  add(bx(W, 0.08, 0.08, MAT.cherry), 0.0).position.set(0, 0.34, -D/2 + 0.06);
  add(bx(W, 0.08, 0.08, MAT.cherry), 0.0).position.set(0, 0.34, D/2 - 0.06);
  add(bx(0.08, 0.08, D, MAT.cherry), 0.02).position.set(-W/2 + 0.06, 0.34, 0);
  add(bx(0.08, 0.08, D, MAT.cherry), 0.02).position.set(W/2 - 0.06, 0.34, 0);
  for (const [x, z] of [[-W/2+0.12,-D/2+0.12],[W/2-0.12,-D/2+0.12],[-W/2+0.12,D/2-0.12],[W/2-0.12,D/2-0.12]])
    add(bx(0.09, 0.34, 0.09, MAT.cherry), 0.12).position.set(x, 0.17, z);
  for (const sx of [-1, 1]) {
    const x = sx * (W/2 - 0.06);
    add(bx(0.08, 0.34, 0.08, MAT.cherry), 0.24).position.set(x, 0.55, -D/2 + 0.12);
    add(bx(0.08, 0.34, 0.08, MAT.cherry), 0.24).position.set(x, 0.55, D/2 - 0.12);
    add(bx(0.11, 0.08, D - 0.08, MAT.cherry), 0.32).position.set(x, 0.72, 0);
  }
  const bz = -D/2 + 0.07;
  add(bx(0.08, 0.5, 0.08, MAT.cherry), 0.42).position.set(-W/2 + 0.16, 0.6, bz);
  add(bx(0.08, 0.5, 0.08, MAT.cherry), 0.42).position.set(W/2 - 0.16, 0.6, bz);
  add(bx(W - 0.24, 0.09, 0.09, MAT.cherry), 0.48).position.set(0, 0.86, bz);
  for (let i = 0; i < 7; i++) {
    const bar = cyl(0.02, D - 0.18, MAT.chrome); bar.rotation.x = Math.PI / 2;
    add(bar, 0.55 + i * 0.012).position.set(-W/2 + 0.2 + i * ((W-0.4)/6), 0.39, 0.04);
  }
  for (let i = 0; i < 6; i++) {
    const s = cyl(0.018, 0.46, MAT.chrome);
    add(s, 0.66 + i * 0.012).position.set(-W/2 + 0.28 + i * ((W-0.56)/5), 0.63, bz);
  }
  add(bx(W - 0.32, 0.18, D - 0.26, cushion), 0.82, true).position.set(0, 0.49, 0.05);
  add(bx(W - 0.36, 0.36, 0.18, cushion), 0.9, true).position.set(0, 0.66, bz + 0.17);
  return {
    g,
    update(p) {
      for (const m of parts) {
        const on = p >= m.userData.from; m.visible = on;
        if (on && m.userData.grow) { const s = Math.max(0.05, Math.min(1, (p - m.userData.from) / 0.1)); m.scale.set(1, s, 1); }
      }
    },
  };
}

/* one representative sub-part for a feeder kind (reused for the bench WIP and
   for the parts that physically travel to full assembly). */
function buildSub(kind) {
  const sub = new THREE.Group();
  if (kind === 'arm') { sub.add(rail(0.9)); const p = rail(0.5); p.rotation.z = Math.PI/2; p.position.set(-0.4,0.25,0); sub.add(p); }
  else if (kind === 'back') { const a=rail(1.1); a.position.y=0.3; sub.add(a); const l=rail(0.6); l.rotation.z=Math.PI/2; l.position.x=-0.5; sub.add(l); const r2=rail(0.6); r2.rotation.z=Math.PI/2; r2.position.x=0.5; sub.add(r2); }
  else if (kind === 'trellis') { for(let i=0;i<4;i++){const s=bx(0.9,0.05,0.08,MAT.cherry); s.position.z=-0.3+i*0.2; sub.add(s);} const b1=rail(0.9); b1.rotation.y=Math.PI/2; b1.position.x=-0.45; sub.add(b1); const b2=rail(0.9); b2.rotation.y=Math.PI/2; b2.position.x=0.45; sub.add(b2); }
  else if (kind === 'seat') { const a=rail(1.4); a.position.z=-0.4; sub.add(a); const b=rail(1.4); b.position.z=0.4; sub.add(b); for(let i=0;i<5;i++){const s=cyl(0.02,0.85,MAT.chrome); s.rotation.x=Math.PI/2; s.position.x=-0.5+i*0.25; sub.add(s);} }
  // ---- Sola-specific parts (from the SWI descriptions) ----
  else if (kind === 'rivet') { const e=rail(0.95); sub.add(e); for(let i=0;i<5;i++){const n=cyl(0.045,0.16,MAT.chrome); n.position.set(-0.36+i*0.18,0.1,0); sub.add(n);} }   // nutserts set into an extrusion
  else if (kind === 'plate') { const p=bx(0.5,0.05,0.4,MAT.steel); p.position.y=0.06; sub.add(p); for(const [dx,dz] of [[-0.18,-0.13],[0.18,-0.13],[-0.18,0.13],[0.18,0.13]]){const s=cyl(0.03,0.12,MAT.chrome); s.position.set(dx,0.12,dz); sub.add(s);} }   // connector plate + 4 corner screws
  else if (kind === 'frame') { const w=1.1,d=0.7; const a=rail(w); a.position.z=-d/2; sub.add(a); const b=rail(w); b.position.z=d/2; sub.add(b); const l=rail(d); l.rotation.y=Math.PI/2; l.position.x=-w/2; sub.add(l); const r2=rail(d); r2.rotation.y=Math.PI/2; r2.position.x=w/2; sub.add(r2); }   // rectangular frame section
  else if (kind === 'cap') { for(const [dx,dz] of [[-0.4,-0.3],[0.4,-0.3],[-0.4,0.3],[0.4,0.3]]){const c=bx(0.13,0.13,0.13,MAT.cherry); c.position.set(dx,0.07,dz); sub.add(c);} }   // corner & end caps
  else if (kind === 'cushion') { const m=bx(0.85,0.42,0.55,MAT.box); m.position.y=0.21; sub.add(m); const tp=bx(0.87,0.05,0.14,MAT.boxWhite); tp.position.y=0.44; sub.add(tp); }   // cushions packed / boxed for ship
  else { for(let i=0;i<3;i++){const c=bx(0.16,0.1,0.1,MAT.cherry); c.position.x=-0.25+i*0.25; sub.add(c);} } // connectors
  return sub;
}
// pick the part a station makes from its name (Sola SWI wording)
function kindForPart(name) {
  const n = (name || '').toLowerCase();
  if (/rivet|nut/.test(n)) return 'rivet';
  if (/plate/.test(n)) return 'plate';
  if (/cushion|pack|ship|box/.test(n)) return 'cushion';
  if (/cap/.test(n)) return 'cap';
  if (/trellis|slat|seat support|sling|rail/.test(n)) return 'trellis';
  if (/leg|glide|wedge/.test(n)) return 'frame';
  if (/install|finish/.test(n)) return 'seat';
  if (/frame|sub.?assembl|connection|join/.test(n)) return 'frame';
  if (/connector|conn/.test(n)) return 'connectors';
  if (/arm/.test(n)) return 'arm';
  if (/back/.test(n)) return 'back';
  return 'frame';
}

/* feeder sub-assembly: a small representative part that grows as the current
   unit builds, plus a row of finished sub-parts that accumulate up to N. */
function makeFeederWIP(kind) {
  const g = new THREE.Group();
  const cur = new THREE.Group(); g.add(cur);
  const mk = () => buildSub(kind);
  const current = mk(); cur.add(current); cur.scale.set(0.001,0.001,0.001);
  const done = [];
  for (let i = 0; i < 40; i++) { const d = mk(); d.scale.set(0.4,0.4,0.4); d.position.set(-1.0 + (i%5)*0.45, 0.0 + Math.floor(i/5)*0.18, -0.55); d.visible = false; g.add(d); done.push(d); }
  return {
    g,
    update(frac, builtCount, N) {
      const s = 0.001 + Math.max(0, Math.min(1, frac)) * 0.999;
      cur.scale.set(s, s, s);
      const show = Math.min(done.length, Math.min(N, builtCount));
      done.forEach((d, i) => d.visible = i < show);
    },
  };
}

/* ---- shipped pallet box ---- */
function makeShipBox() {
  const g = new THREE.Group();
  const b = bx(1.7, 0.7, 0.95, MAT.box); b.position.y = 0.35; g.add(b);
  const tape = bx(1.72, 0.06, 0.2, MAT.boxWhite); tape.position.y = 0.7; g.add(tape);
  return g;
}

/* =========================== SIMULATION =========================== */
const ST = [
  { id:'con', title:'CONNECTORS',   sub:'Connectors',   ppl:1, t:19.25, role:'feeder', kind:'connectors', accent:'#1d3a66', steps:[{name:'Connectors', t:19.25}] },
  { id:'arm', title:'ARMS',         sub:'Arm assembly', ppl:2, t:64,    role:'feeder', kind:'arm',        accent:'#1d3a66', steps:[{name:'Arm assembly', t:64}] },
  { id:'bak', title:'BACK FRAME',   sub:'Back frame',   ppl:1, t:43.5,  role:'feeder', kind:'back',       accent:'#1d3a66', steps:[{name:'Back frame', t:43.5}] },
  { id:'tre', title:'TRELLIS',      sub:'Trellis',      ppl:1, t:22.5,  role:'feeder', kind:'trellis',    accent:'#1d3a66', steps:[{name:'Trellis', t:22.5}] },
  { id:'sea', title:'SEAT FRAME',   sub:'Seat frame',   ppl:1, t:47,    role:'feeder', kind:'seat',       accent:'#9a3b1f', bot:true, steps:[{name:'Seat frame', t:47}] },
  { id:'fa',  title:'FULL ASSEMBLY',sub:'Assemble frame',ppl:2, t:58,   role:'fa',     accent:'#1d3a66', steps:[{name:'Assemble frame', t:58}] },
  { id:'pak', title:'CUSHIONS & PACK',sub:'Cushions + ship',ppl:1, t:18, role:'pack',   accent:'#236043', cover:'fa', steps:[{name:'Cushions + pack', t:18}] },  // default: covered by Full Assembly's crew (admin can change/clear this)
];
function recalc(id) { const s = get(id); if (s && s.steps) s.t = s.steps.reduce((a, st) => a + (parseFloat(st.t) || 0), 0); }
const get = id => ST.find(s => s.id === id);

let N = 8;
let sch = null, horizon = 0;
// distance-based walk time — only the tables a station gets parts FROM and gives parts TO matter
let walkOn = true, walkSpeed = 60, tripsPerUnit = 1;   // yd/min, trips per unit
const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const SHIP_PT = [24, 4.2];                              // ship-out dock
// material flow: who each station receives from (in) and hands off to (out)
const FLOW = {
  con:{ in:['cart'], out:['fa'] }, arm:{ in:['cart'], out:['fa'] }, bak:{ in:['cart'], out:['fa'] },
  tre:{ in:['cart'], out:['fa'] }, sea:{ in:['cart'], out:['fa'] },
  fa:{ in:['con','arm','bak','tre','sea'], out:['pak'] },
  pak:{ in:['fa'], out:['ship'] },
  cart:{ in:[], out:['con','arm','bak','tre','sea'] },  // the one cart feeds all feeders
};
function linkPoint(tgt, nd) {
  if (tgt === 'cart') { const c = nodes.cart; return c ? [c.x, c.z] : [nd.x, nd.z]; } // the single cart spot
  if (tgt === 'ship') return SHIP_PT;
  const n = nodes[tgt]; return n ? [n.x, n.z] : [nd.x, nd.z];
}
function linkSet(id) { const f = FLOW[id]; if (!f) return []; return [...f.in, ...f.out].filter(t => nodes[t]); }
function walkOf(id) {
  if (!walkOn) return 0;
  const nd = nodes[id], f = FLOW[id]; if (!nd || !f) return 0;
  let yd = 0;
  for (const t of [...f.in, ...f.out]) { const p = linkPoint(t, nd); yd += dist2(nd.x, nd.z, p[0], p[1]) / YARD; }
  return yd / Math.max(1, walkSpeed) * tripsPerUnit;   // sum of linked-table distances (yd) / speed * trips
}
// per-line PRODUCT factor: each line can run a different piece of furniture;
// its labor content scales all of that line's station times (walk unaffected)
function prodF(line) {
  if (typeof lineProducts === 'undefined' || !lineProducts) return 1;
  const lp = lineProducts[line]; if (!lp) return 1;
  const p = lp.list[lp.active]; if (!p) return 1;
  if (p.stations) return 1;                                  // steps-products carry ABSOLUTE times
  return Math.max(0.05, +p.f || 1);
}
function dayMinSafe() { return (typeof dayMin === 'number' && dayMin > 0) ? dayMin : 420; }   // available minutes per worker per day
function eff(id) { const s = getAny(id); if (!s) return 0; return ((s.t || 0) / Math.max(1, s.ppl || 1)) * prodF(stLineOf(id)) + walkOf(id); }   // step times are TOTAL; cycle = total / people, scaled by the line's active product
// a help arrow only counts while its line is building the product it was drawn for (a.prod; untagged = every product)
function arrowOn(a) {
  if (!a || !a.prod) return true;
  if (typeof activeProduct !== 'function' || typeof stLineOf !== 'function') return true;
  const p = activeProduct(stLineOf(a.from));
  return !p || p.name === a.prod;
}
function helpInto(id) { return (typeof helpArrows === 'undefined') ? 0 : helpArrows.reduce((s, a) => s + ((a.to === id && arrowOn(a)) ? (a.helpMin || 0) : 0), 0); }
function helpFromOp(id, idx) { return (typeof helpArrows === 'undefined') ? 0 : helpArrows.reduce((s, a) => s + ((a.from === id && (a.fromIdx || 0) === idx && arrowOn(a)) ? (a.helpMin || 0) : 0), 0); }
function effNet(id) { return Math.max(0.1, eff(id) - helpInto(id)); }   // a helped station's time drops by the help minutes
// ---- crew COVERAGE (admin-controlled, not hard-coded): a station's crew can also cover another station's work ----
// If station P has cover === A, then P has no operators of its own; P's per-unit time rolls onto EACH of A's operators.
function coverOf(id) { const s = getAny(id); const c = s && s.cover; return (c && c !== id && getAny(c)) ? c : null; }
function coveredBy(id) {   // ids of the stations whose work THIS station's crew also does
  const line = (typeof stLineOf === 'function') ? stLineOf(id) : 'meritage';
  const ids = (typeof lineStationIds === 'function') ? lineStationIds(line) : (typeof ST !== 'undefined' ? ST.map(s => s.id) : []);
  return ids.filter(x => x !== id && coverOf(x) === id);
}
// per-OPERATOR busy time for a station's crew: its own cycle + the full time of every station it covers
function opLoad(id) { return effNet(id) + coveredBy(id).reduce((a, c) => a + effNet(c), 0); }
function isPrimary(id) { return !coverOf(id); }   // a station that has its own crew (not folded into another)
function lineCyc() { let m = 0.1; ST.forEach(s => { if (isPrimary(s.id)) { const v = opLoad(s.id); if (v > m) m = v; } }); return m; }   // line paces on the busiest crew's combined load
function availIdleOp(id, idx) { return Math.max(0, lineCyc() - opLoad(id) - helpFromOp(id, idx)); }   // spare min/chair a specific operator can give (own cycle + any covered work)
// side-aware versions so help paths work on the Sola (added-station) side too
function solaCyc() { let m = 0.1; extraStations.filter(id => sideOf(nodes[id].x, nodes[id].z) === 'other' && isPrimary(id)).forEach(id => { const e = opLoad(id); if (e > m) m = e; }); return m; }
function cycOf(id) { return (typeof isExtra === 'function' && isExtra(id)) ? solaCyc() : lineCyc(); }
function availIdleAny(id, idx) { return Math.max(0, cycOf(id) - opLoad(id) - helpFromOp(id, idx)); }
function schedule() {
  const seaT=effNet('sea'), armT=effNet('arm'), bakT=effNet('bak'), treT=effNet('tre'), conT=effNet('con');
  const ASM=effNet('fa'), PACK=coveredBy('fa').reduce((a,c)=>a+effNet(c),0);   // any stations covered by Full Assembly (default: Cushions & Pack) roll onto the FA pair
  const seatEnd=[],armEnd=[],bakEnd=[],kit=[],faStart=[],faEnd=[];
  let prev=0;
  for (let u=0;u<N;u++){
    seatEnd[u]=seaT*(u+1); armEnd[u]=armT*(u+1); bakEnd[u]=bakT*(u+1);
    kit[u]=Math.max(seatEnd[u], Math.min(armEnd[u],bakEnd[u]));   // seat AND (arm OR back)
    faStart[u]=Math.max(kit[u], prev);
    faEnd[u]=faStart[u]+ASM+PACK; prev=faEnd[u];
  }
  sch={seaT,armT,bakT,treT,conT,ASM,PACK,seatEnd,armEnd,bakEnd,kit,faStart,faEnd};
  horizon=(faEnd[N-1]||0)+6;
  const cyc=lineCyc();
  const cap=dayMinSafe()/Math.max(0.1,cyc);
  // bottleneck = busiest PRIMARY crew, named for its station (+ what it covers, e.g. "Full assembly + Cushions & Pack")
  let bot='—', bv=-1;
  ST.forEach(s=>{ if(isPrimary(s.id)){ const v=opLoad(s.id); if(v>bv){ bv=v; const cov=coveredBy(s.id).map(c=>getAny(c).title); bot=s.title+(cov.length?' + '+cov.join(' + '):''); } } });
  ui.cyc.textContent=cyc.toFixed(1).replace(/\.0$/,'');
  ui.cap.textContent=cap.toFixed(1);
  ui.bot.textContent=`${bot} (${bv.toFixed(1).replace(/\.0$/,'')})`;
  ui.nOut.textContent=N;
  if (ui.labor) ui.labor.textContent = (ST.reduce((a,s)=>a+(s.t||0),0) * prodF('meritage')).toFixed(0);   // total one-person labor content/unit (active product)
  // reflect walk time on labels + times panel
  ST.forEach(s => {
    const w = walkOf(s.id), base = get(s.id).t || 0;
    const nd = nodes[s.id];
    if (nd && nd.label && nd.label.userData.redraw) {
      const txt = (w > 0.05) ? `${(+base.toFixed(2))}+${w.toFixed(1)}w` : (base ? base + ' min' : '—');
      nd.label.userData.redraw(txt, s.accent);
    }
    const el = document.getElementById('walk_' + s.id);
    if (el) el.textContent = (w > 0.05) ? `+${w.toFixed(1)} walk` : '';
  });
  if (typeof renderIdle === 'function') renderIdle();
  if (typeof renderHelpPanel === 'function') renderHelpPanel();
  if (typeof renderTaskChart === 'function') renderTaskChart();
}

/* =========================== SCENE =========================== */
initMats();
const mount = document.getElementById('view');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9edf1);
scene.fog = new THREE.Fog(0xe9edf1, 60, 140);
const camera = new THREE.PerspectiveCamera(44, mount.clientWidth / mount.clientHeight, 0.1, 300);
camera.position.set(7, 30, 52);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(mount.clientWidth, mount.clientHeight);
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.06;
mount.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.target.set(7, 6.8, 0); controls.maxPolarAngle = Math.PI / 2.02; controls.maxDistance = 130;
controls.enablePan = true; controls.screenSpacePanning = true;   // pan moves the camera across the floor (esp. while editing)
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());   // so right-drag pans without the browser menu

scene.add(new THREE.HemisphereLight(0xffffff, 0xb8bcc2, 1.0));
const sun = new THREE.DirectionalLight(0xfff8ee, 0.85);
sun.position.set(16, 28, 16); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 5;
for (const [k, v] of Object.entries({ left: -40, right: 40, top: 40, bottom: -40 })) sun.shadow.camera[k] = v;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xeef2f8, 0.3); fill.position.set(-18, 14, -10); scene.add(fill);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(130, 90),
  new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.55, metalness: 0.06 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

const addLane = (w, d, x, z) => { const m = bx(w, 0.012, d, MAT.tape); m.position.set(x, 0.006, z); scene.add(m); };
for (const z of [6.6, 8.2]) addLane(54, 0.12, 0, z);
for (const rx of [-22, -11, 0, 11, 22]) { const r = makeRack(); r.position.set(rx, 0, -16); scene.add(r); }
for (const [cx, cz] of [[-28,-12],[28,-12],[-28,12],[28,12]]) { const col = bx(0.6,8,0.6,MAT.column); col.position.set(cx,4,cz); scene.add(col); }
// (ceiling fans removed)
/* ===== second-floor mezzanine: the whole line sits on a raised deck, fed by
   a materials elevator standing where the parts cart used to be ===== */
const FLOOR2 = 6.0;                                  // floor-to-deck height (~20 ft)
const level2 = new THREE.Group(); level2.position.y = FLOOR2; scene.add(level2);

const DECK = { x0:-5.1, x1:-5.1 + 40*FT, z0:-30*FT, z1:30*FT };   // 40' wide x 60' deep (20 yd) — centred
const deckW = DECK.x1 - DECK.x0, deckD = DECK.z1 - DECK.z0;
const deckCx = (DECK.x0 + DECK.x1)/2, deckCz = (DECK.z0 + DECK.z1)/2;
const deckMat = new THREE.MeshStandardMaterial({ color: 0xb7bcc2, roughness: 0.7, metalness: 0.3 });   // the original space-gray — and the surrounding slab uses the SAME material, so the whole floor is one colour
const deck = bx(deckW, 0.3, deckD, deckMat); deck.position.set(deckCx, -0.16, deckCz); deck.receiveShadow = true; level2.add(deck);
// diamond-plate edge fascia
const fascia = new THREE.MeshStandardMaterial({ color:0x8a9099, roughness:0.6, metalness:0.4 });
for (const [w,d,x,z] of [[deckW,0.5,deckCx,DECK.z0],[deckW,0.5,deckCx,DECK.z1],[0.5,deckD,DECK.x0,deckCz],[0.5,deckD,DECK.x1,deckCz]]) {
  const f = bx(w,0.5,d,fascia); f.position.set(x,-0.34,z); level2.add(f);
}
// support columns from ground up to the deck
for (const cx2 of [-3,5]) for (const cz2 of [-8,0,8]) {
  const col = bx(0.4, FLOOR2, 0.4, MAT.steel); col.position.set(cx2, FLOOR2/2, cz2); col.castShadow = true; scene.add(col);
  const base = bx(0.7,0.1,0.7,MAT.steel); base.position.set(cx2,0.05,cz2); scene.add(base);
}
// guard railing around the deck (gap on the left edge where the elevator docks)
const RAILMAT = MAT.steel;
function railing(x0,z0,x1,z1){
  const g = new THREE.Group();
  const dx=x1-x0, dz=z1-z0, len=Math.hypot(dx,dz), ang=Math.atan2(dz,dx);
  for (const y of [0.55,1.05]) { const r=bx(len,0.06,0.06,RAILMAT); r.position.set((x0+x1)/2,y,(z0+z1)/2); r.rotation.y=-ang; g.add(r); }
  const posts=Math.max(2,Math.round(len/2.2));
  for (let i=0;i<=posts;i++){ const t=i/posts; const p=bx(0.07,1.05,0.07,RAILMAT); p.position.set(x0+dx*t,0.52,z0+dz*t); g.add(p); }
  return g;
}
// (railings removed — the line decks now sit on the open warehouse floor with the surrounding staging areas)

// ---- mirrored floor directly to the right (2nd Meritage cell), no gap — just a crossable painted line ----
const AISLE = 0;                                   // floors butt together; the line between is crossable
const MX0 = DECK.x1 + AISLE, MX1 = MX0 + deckW, MCx = (MX0 + MX1)/2;
const mdeck = bx(deckW, 0.3, deckD, deckMat); mdeck.position.set(MCx, -0.16, deckCz); mdeck.receiveShadow = true; level2.add(mdeck);
for (const [w,d,x,z] of [[deckW,0.5,MCx,DECK.z0],[deckW,0.5,MCx,DECK.z1],[0.5,deckD,MX0,deckCz],[0.5,deckD,MX1,deckCz]]) {
  const f = bx(w,0.5,d,fascia); f.position.set(x,-0.34,z); level2.add(f);
}
for (const cx2 of [MX0+3, MX1-3]) for (const cz2 of [-8,0,8]) {
  const col = bx(0.4, FLOOR2, 0.4, MAT.steel); col.position.set(cx2, FLOOR2/2, cz2); col.castShadow = true; scene.add(col);
  const base = bx(0.7,0.1,0.7,MAT.steel); base.position.set(cx2,0.05,cz2); scene.add(base);
}
// (mirror-deck railings removed too)
// (yellow painted divider line down the middle of the deck removed — the baked zone tints mark the lines)
function rebuildDivider(){}

// proper enclosed freight elevator that docks the floor edge
function makeElevator(x,z){
  const shaft = new THREE.Group();
  const SX = (8 * FT) / 2, SZ = (3 * YARD) / 2, H = FLOOR2 + 1.7, CH = 2.2;   // cab 8' deep x 3 yd wide (true size), shaft height, cab height
  const wallMat = new THREE.MeshStandardMaterial({ color:0xc7ccd2, roughness:0.5, metalness:0.5 });
  // shaft guide posts + header + motor + cable
  for (const [px,pz] of [[-SX,-SZ],[SX,-SZ],[-SX,SZ],[SX,SZ]]) { const p=bx(0.16,H,0.16,MAT.rackPost); p.position.set(x+px,H/2,z+pz); shaft.add(p); }
  const header = bx(2*SX+0.3,0.26,2*SZ+0.3,MAT.rackBeam); header.position.set(x,H,z); shaft.add(header);
  const motor = bx(1.0,0.6,1.0,MAT.steel); motor.position.set(x,H+0.4,z); shaft.add(motor);
  const cable = bx(0.05,H,0.05,MAT.pants); cable.position.set(x,H/2,z); shaft.add(cable);
  // enclosed cab (floor, roof, back + 2 side walls, open front doorway)
  const car = new THREE.Group();
  car.add(bx(2*SX,0.14,2*SZ,MAT.steel));                                 // floor
  const roof=bx(2*SX,0.1,2*SZ,MAT.steel); roof.position.y=CH; car.add(roof);
  const back=bx(2*SX,CH,0.08,wallMat); back.position.set(0,CH/2,-SZ); car.add(back);
  const lw=bx(0.08,CH,2*SZ,wallMat); lw.position.set(-SX,CH/2,0); car.add(lw);
  const rw=bx(0.08,CH,2*SZ,wallMat); rw.position.set(SX,CH/2,0); car.add(rw);
  for (const px of [-SX+0.1,SX-0.1]) { const j=bx(0.12,CH,0.12,MAT.steel); j.position.set(px,CH/2,SZ); car.add(j); }   // front jambs
  const headr=bx(2*SX,0.2,0.12,MAT.steel); headr.position.set(0,CH-0.1,SZ); car.add(headr);
  // ELEVATOR sign
  (function(){ const c=document.createElement('canvas'); c.width=256;c.height=64;const g=c.getContext('2d');
    g.fillStyle='#1d3a66'; g.beginPath(); g.roundRect(0,0,256,64,10); g.fill(); g.fillStyle='#fff'; g.font='700 32px Arial'; g.textAlign='center'; g.textBaseline='middle'; g.fillText('ELEVATOR',128,34);
    const tex=new THREE.CanvasTexture(c); const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:false,transparent:true})); sp.scale.set(2.4,0.6,1); sp.position.set(0,CH+0.6,0); car.add(sp); })();
  const crate = new THREE.Group(); crate.add(bx(1.4,0.8,1.4,MAT.box));
  const lid = bx(1.42,0.08,0.4,MAT.boxWhite); lid.position.y=0.42; crate.add(lid);
  crate.position.y=0.5; car.add(crate);
  car.position.set(x,0.4,z); shaft.add(car);
  return { shaft, car, crate, x, z, H };
}
const elevator = makeElevator(DECK.x0 - 1.6, 2);   // docks left edge (matches EL below)
scene.add(elevator.shaft);
// ---- hide/show the elevator (right-click it in Edit Layout). Its path anchoring
// still works when hidden — the mesh just gets out of the way so you can grab an
// endpoint marker tucked under it. A faint ghost marks the spot; right-click it to
// bring the elevator back. ----
let elevHidden = false;
const elevGhost = new THREE.Group(); elevGhost.visible = false; scene.add(elevGhost);
(function(){
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.06, 28), new THREE.MeshBasicMaterial({ color: 0x1d3a66, transparent: true, opacity: 0.2, depthWrite: false }));
  disc.position.y = 0.04; elevGhost.add(disc);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.07, 8, 32), new THREE.MeshBasicMaterial({ color: 0x1d3a66, transparent: true, opacity: 0.55 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.06; elevGhost.add(ring);
  const c = document.createElement('canvas'); c.width = 360; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = 'rgba(29,58,102,0.92)'; g.beginPath(); g.roundRect(0, 0, 360, 64, 10); g.fill();
  g.fillStyle = '#fff'; g.font = '700 22px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ELEVATOR — right-click to show', 180, 34);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 8; tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })); sp.scale.set(3.6, 0.64, 1); sp.position.y = 1.0; elevGhost.add(sp);
})();
function setElevHidden(h){ elevHidden = h; elevator.shaft.visible = !h; elevGhost.visible = h; elevGhost.position.set(EL[0], 0, EL[1]); }
function pickElevatorOrGhost(e){
  pointerNDC(e); raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(elevHidden ? [elevGhost] : [elevator.shaft], true);
  return hits.length > 0;
}

// ---- forklift ACCESS POINTS (@) on the platform edge + editable elevator ----
const elBX = DECK.x0 - 1.6, elBZ = 2;     // elevator built position (for dragging)
function moveElevator(x,z){ elevator.shaft.position.set(x - elBX, 0, z - elBZ); EL[0]=x; EL[1]=z; if (typeof refreshPath==='function') refreshPath(); if (typeof refreshCart2Feed==='function') refreshCart2Feed(); if (typeof refreshCart3Feed==='function') refreshCart3Feed(); }
// finished-goods package (boxed sofa)
function makePackage(){ const g=new THREE.Group(); const b=bx(1.5,0.55,0.75,MAT.box); b.position.y=0.3; g.add(b); const t=bx(1.52,0.05,0.26,MAT.boxWhite); t.position.set(0,0.58,0); g.add(t); return g; }
// forklift openings: gaps in the platform; a forklift carries a package DOWN when triggered
const forkLifts = [];
// ---- the animated forklift rig: a detailed counterbalance truck on the GROUND
// with a telescoping mast up to the deck; the fork carriage rides the mast and
// carries a furniture package down when a takedown fires. Shared by the @
// access points AND the "Forklift Access" areas. ----
const FKM = {                                              // shared materials
  body:  new THREE.MeshStandardMaterial({ color:0xe8a90c, roughness:0.42, metalness:0.35 }),
  cwt:   new THREE.MeshStandardMaterial({ color:0xc98f07, roughness:0.5,  metalness:0.35 }),
  blk:   new THREE.MeshStandardMaterial({ color:0x22262b, roughness:0.82 }),
  tire:  new THREE.MeshStandardMaterial({ color:0x191c20, roughness:0.92 }),
  hub:   new THREE.MeshStandardMaterial({ color:0x9aa3ad, roughness:0.4, metalness:0.6 }),
  mast:  new THREE.MeshStandardMaterial({ color:0x39404a, roughness:0.45, metalness:0.55 }),
  mast2: new THREE.MeshStandardMaterial({ color:0x4d5661, roughness:0.45, metalness:0.55 }),
  slv:   new THREE.MeshStandardMaterial({ color:0xc3cbd3, roughness:0.25, metalness:0.75 }),
  seat:  new THREE.MeshStandardMaterial({ color:0x2c3138, roughness:0.9 }),
  bcn:   new THREE.MeshStandardMaterial({ color:0xff8a00, emissive:0xff8a00, emissiveIntensity:0.9, roughness:0.4 }),
  lite:  new THREE.MeshStandardMaterial({ color:0xfff2c0, emissive:0xfff2c0, emissiveIntensity:0.7, roughness:0.3 }),
};
function buildLiftRig(g, D){
  const groundY = -FLOOR2;
  const zM = -D/2 + 0.5;                                   // mast plane (under the deck edge / opening)
  const TRAVEL_H = FLOOR2 - 0.3;                           // carriage travel: 0.3 m off the ground → deck level

  /* ---- truck (front faces the mast / deck, −z) ---- */
  const truck = new THREE.Group(); truck.position.set(0, groundY, zM + 1.15);
  // chassis: floor plate, hood, sculpted nose
  const plate = bx(1.02, 0.07, 1.15, FKM.blk); plate.position.set(0, 0.46, -0.12); truck.add(plate);
  const hood  = bx(1.05, 0.52, 1.55, FKM.body); hood.position.set(0, 0.72, 0.28); truck.add(hood);
  const nose  = bx(1.05, 0.34, 0.35, FKM.body); nose.position.set(0, 0.63, -0.72); truck.add(nose);
  const skirt = bx(1.05, 0.3, 2.1, FKM.blk);  skirt.position.set(0, 0.32, 0.15); truck.add(skirt);
  // counterweight: stepped block + rounded top edge
  const cw1 = bx(1.12, 0.78, 0.6, FKM.cwt); cw1.position.set(0, 0.72, 1.22); truck.add(cw1);
  const cw2 = bx(1.12, 0.4, 0.28, FKM.cwt); cw2.position.set(0, 1.28, 1.1); truck.add(cw2);
  const cwr = cyl(0.19, 1.12, FKM.cwt); cwr.rotation.z = Math.PI/2; cwr.position.set(0, 1.12, 1.42); truck.add(cwr);
  // LPG tank on the counterweight
  const tank = cyl(0.16, 0.8, FKM.slv); tank.rotation.z = Math.PI/2; tank.position.set(0, 1.5, 1.18); truck.add(tank);
  const strap = bx(0.06, 0.36, 0.36, FKM.blk); strap.position.set(0, 1.44, 1.18); truck.add(strap);
  // wheels: big drive fronts, smaller steer rears, with hubs
  for (const [px, pz, r, w] of [[-0.56,-0.5,0.34,0.3],[0.56,-0.5,0.34,0.3],[-0.47,0.92,0.27,0.24],[0.47,0.92,0.27,0.24]]) {
    const t = cyl(r, w, FKM.tire); t.rotation.z = Math.PI/2; t.position.set(px, r, pz); truck.add(t);
    const h = cyl(r*0.55, w+0.02, FKM.hub); h.rotation.z = Math.PI/2; h.position.set(px, r, pz); truck.add(h);
    const fender = bx(w+0.06, 0.05, r*1.9, FKM.body); fender.position.set(px, r*2+0.06, pz); truck.add(fender);
  }
  // operator compartment: seat, steering column + wheel, dash
  const seatB = bx(0.5, 0.09, 0.48, FKM.seat); seatB.position.set(0, 1.03, 0.3); truck.add(seatB);
  const seatR = bx(0.5, 0.52, 0.1, FKM.seat); seatR.position.set(0, 1.32, 0.56); seatR.rotation.x = -0.12; truck.add(seatR);
  const dash = bx(0.62, 0.24, 0.16, FKM.blk); dash.position.set(0, 1.06, -0.5); truck.add(dash);
  const col = bx(0.05, 0.42, 0.05, FKM.blk); col.position.set(0, 1.22, -0.42); col.rotation.x = 0.55; truck.add(col);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 10, 22), FKM.blk);
  wheel.position.set(0, 1.4, -0.34); wheel.rotation.x = Math.PI/2 - 0.55; truck.add(wheel);
  // overhead guard with roof slats + beacon + headlights
  for (const [px, pz] of [[-0.5,-0.52],[0.5,-0.52],[-0.5,0.66],[0.5,0.66]]) {
    const p = bx(0.07, 1.32, 0.07, FKM.blk); p.position.set(px, 1.68, pz); truck.add(p);
  }
  const roof = bx(1.14, 0.06, 1.4, FKM.blk); roof.position.set(0, 2.36, 0.07); truck.add(roof);
  for (let i = 0; i < 4; i++) { const s = bx(1.1, 0.03, 0.09, FKM.blk); s.position.set(0, 2.41, -0.5 + i*0.38); truck.add(s); }
  const bcnB = cyl(0.055, 0.1, FKM.blk); bcnB.position.set(0.36, 2.44, 0.5); truck.add(bcnB);
  const bcn = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), FKM.bcn); bcn.position.set(0.36, 2.52, 0.5); truck.add(bcn);
  for (const px of [-0.42, 0.42]) { const l = bx(0.12, 0.08, 0.05, FKM.lite); l.position.set(px, 1.0, -0.9); truck.add(l); }
  // driver
  const drv = makeCrewFigure(0x767d88, 'Forklift'); drv.scale.set(0.8, 0.6, 0.8); drv.position.set(0, 0.62, 0.28); truck.add(drv);
  g.add(truck);

  /* ---- telescoping mast (based at the ground, in rig space) ---- */
  const H1 = TRAVEL_H * 0.62;                              // fixed outer stage
  const H2 = TRAVEL_H * 0.58;                              // sliding inner stage
  for (const px of [-0.5, 0.5]) {                          // outer channels + web
    const c = bx(0.11, H1, 0.18, FKM.mast); c.position.set(px, groundY + H1/2, zM); g.add(c);
  }
  for (const fy of [0.18, 0.5, 0.86]) { const b = bx(1.0, 0.08, 0.1, FKM.mast); b.position.set(0, groundY + H1*fy, zM + 0.08); g.add(b); }
  const inner = new THREE.Group(); inner.position.set(0, groundY, zM);   // slides up as the carriage rises
  for (const px of [-0.38, 0.38]) { const c = bx(0.09, H2, 0.14, FKM.mast2); c.position.set(px, H2/2, 0); inner.add(c); }
  const tie = bx(0.82, 0.09, 0.1, FKM.mast2); tie.position.set(0, H2 - 0.06, 0.05); inner.add(tie);
  g.add(inner);
  const cylT = cyl(0.05, H1*0.85, FKM.mast); cylT.position.set(0, groundY + H1*0.42, zM + 0.14); g.add(cylT);   // hydraulic tube
  const rod = cyl(0.028, 1, FKM.slv); rod.position.set(0, groundY + H1*0.85, zM + 0.14); g.add(rod);            // rod extends with the inner stage

  /* ---- fork carriage (rec.lift): y = 0 at deck level, rides down the mast ---- */
  const lift = new THREE.Group(); lift.position.set(0, 0, zM);
  const back1 = bx(0.95, 0.09, 0.06, FKM.blk); back1.position.set(0, 0.52, 0.06); lift.add(back1);
  const back2 = bx(0.95, 0.09, 0.06, FKM.blk); back2.position.set(0, 0.18, 0.06); lift.add(back2);
  for (let i = 0; i < 5; i++) { const v = bx(0.06, 0.66, 0.05, FKM.blk); v.position.set(-0.4 + i*0.2, 0.33, 0.06); lift.add(v); }
  for (const px of [-0.3, 0.3]) {                          // L-shaped forks: shank + blade pointing into the deck
    const shank = bx(0.05, 0.5, 0.07, FKM.blk); shank.position.set(px, 0.25, 0.1); lift.add(shank);
    const blade = bx(0.11, 0.045, 1.05, FKM.blk); blade.position.set(px, 0.02, 0.62); lift.add(blade);
  }
  for (const px of [-0.14, 0.14]) { const ch = bx(0.03, 0.9, 0.02, FKM.seat); ch.position.set(px, 0.95, 0.02); lift.add(ch); }   // lift chains
  const pkg = makePackage(); pkg.scale.set(0.7, 0.7, 0.7); pkg.position.set(0, 0.06, 0.62); pkg.visible = false; lift.add(pkg);
  g.add(lift);

  // keep the inner stage + rod tracking the carriage height (called from the render loop)
  const sync = () => {
    const h = lift.position.y + FLOOR2;                    // carriage height above the ground (0.3 .. FLOOR2)
    const topNeed = Math.max(H1, Math.min(h + 0.5, FLOOR2 + 0.4));
    inner.position.y = groundY + (topNeed - H2);
    const ext = Math.max(0, topNeed - H1);
    rod.scale.y = Math.max(0.001, ext + 0.2);
    rod.position.y = groundY + H1*0.85 + (ext + 0.2)/2 - 0.1;
  };
  sync();

  // queue slots beside the opening (2 layers of 4) — arriving boxes park here
  const waitSlots = [];
  for (let layer = 0; layer < 2; layer++) for (const [sx, sz] of [[-0.5, zM + 1.95], [0.5, zM + 1.95], [-0.5, zM + 2.8], [0.5, zM + 2.8]])
    waitSlots.push([sx, layer * 0.48, sz]);

  // delivered boxes stage on the GROUND beside the truck (a semi hauls them off
  // after 6 — the pad clears so the scene never silts up)
  const gnd = [];
  for (let i = 0; i < 6; i++) {
    const bb = makeShipBox(); bb.scale.set(0.72, 0.72, 0.72); bb.visible = false;
    bb.position.set(-2.6 + (i % 3) * 1.35, groundY, zM + 2.9 + Math.floor(i / 3) * 1.1);
    g.add(bb); gnd.push(bb);
  }
  const rec = { lift, busy:false, t:0, pkg, sync, gnd, delivered: 0, g, waitSlots, waitMeshes: [] }; forkLifts.push(rec);
  return rec;
}
// park a rig's waiting boxes onto its pallet-square slots (world space, honouring the rig's rotation)
function parkWaiters(rec) {
  const rot = rec.g.rotation.y || 0, cs = Math.cos(rot), sn = Math.sin(rot);
  rec.waitMeshes.forEach((m, i) => {
    const s = rec.waitSlots[Math.min(i, rec.waitSlots.length - 1)];
    m.visible = (typeof focusShows !== 'function') || focusShows(LINE_KEYS[m.userData.lineIdx ?? 0]);
    m.position.set(rec.g.position.x + s[0] * cs + s[2] * sn, rec.g.position.y + s[1], rec.g.position.z + s[2] * cs - s[0] * sn);
  });
}
/* ---- outbound boxes TRAVEL the green furniture lane: ship point → waypoints →
   the access point, where they queue on the pallet square until a forklift
   takes them down. Wall-clock speed, so the slide reads naturally at any sim
   speed. ---- */
const OUT_SPEED = 12;                                        // metres per SIM-MINUTE along the lane (scales with the speed slider)
const OUT_HEADWAY = 2.6;                                     // minimum spacing between boxes in transit — no bunching, no "snake"
const outBoxes = [];                                         // traveler pool
let spawnedM = 0, spawnedSola = 0, spawnedCanyon = 0;        // ship events already spawned
let gShipSola = 0, gShipCanyon = 0;                          // per-line ship counts (set by solaUpdate)
function laneRigOf(i) {                                      // which forklift serves line i's lane
  const s = (typeof lineEndNode === 'function') ? lineEndNode(i) : null; if (!s) return null;
  const wps = prodWps[i], last = wps.length ? wps[wps.length - 1] : s;
  const acc = nearestAccess(last.x, last.z); if (!acc) return null;
  return acc.rec || (acc.g && acc.g.userData && acc.g.userData.forkRec) || null;
}
function enqueueAtRig(rec, mesh) { rec.waitMeshes.push(mesh); parkWaiters(rec); }
function laneLen(pts) { let L = 0; for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); return L; }
function lanePos(pts, prog) {
  for (let i = 0; i < pts.length - 1; i++) {
    const sl = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) || 1e-6;
    if (prog <= sl) { const f = prog / sl; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]; }
    prog -= sl;
  }
  return pts[pts.length - 1];
}
/* Finished boxes STAGE in a tidy stack at the line's ship point, feed onto the
   lane ONE AT A TIME, and keep a minimum headway while in transit — the flow
   reads as an orderly, evenly-spaced procession, not a snake. */
function spawnOutBox(lineIdx) {
  const pts = (typeof prodPts === 'function') ? prodPts(lineIdx) : null;
  const rig = laneRigOf(lineIdx);
  if (!pts || pts.length < 2 || !rig) return;                // no lane / no forklift → nothing to animate
  let o = outBoxes.find(b => !b.active && !b.queued && !b.staged);
  if (!o) {
    if (outBoxes.length >= 40) {                             // pool cap: arrive instantly rather than stall
      const m = makeShipBox(); m.scale.set(0.8, 0.8, 0.8); level2.add(m); m.visible = focusShows(LINE_KEYS[lineIdx]); m.userData.lineIdx = lineIdx;
      enqueueAtRig(rig, m); outBoxes.push({ mesh: m, active: false, queued: true, staged: false, rig, line: lineIdx }); return;
    }
    o = { mesh: makeShipBox(), active: false, queued: false, staged: false, rig: null };
    o.mesh.scale.set(0.8, 0.8, 0.8); level2.add(o.mesh); outBoxes.push(o);
  }
  o.staged = true; o.active = false; o.queued = false;
  o.rig = rig; o.pts = pts; o.len = laneLen(pts); o.prog = 0;
  o.line = lineIdx; o.mesh.userData.lineIdx = lineIdx;
  parkStaged(lineIdx);
}
function parkStaged(line) {                                  // neat 2x2 (+ second layer) stack beside the ship point
  const st = outBoxes.filter(o => o.staged && o.line === line);
  st.forEach((o, i) => {
    const base = o.pts[0], col = i % 2, row = (i >> 1) % 2, lay = i >> 2;
    o.mesh.position.set(base[0] - 0.55 + col * 1.15, 0.05 + lay * 0.45, base[1] - 0.55 + row * 0.95);
    o.mesh.visible = focusShows(LINE_KEYS[line]);
  });
}
function advanceOutBoxes(dt) {
  for (let L = 0; L < 3; L++) {
    const act = outBoxes.filter(o => o.active && o.line === L).sort((a, b) => b.prog - a.prog);
    let lead = Infinity;
    for (const o of act) {
      const maxP = Math.min(o.len, lead - OUT_HEADWAY);      // never closer than one headway to the box ahead
      o.prog = Math.min(o.prog + OUT_SPEED * dt, Math.max(o.prog, maxP));
      if (o.prog >= o.len - 1e-6) {                          // arrived at the access point → join the pallet queue
        o.active = false; o.queued = true; enqueueAtRig(o.rig, o.mesh);
      } else {
        const p = lanePos(o.pts, o.prog);
        o.mesh.visible = focusShows(LINE_KEYS[o.line ?? 0]);
        o.mesh.position.set(p[0], 0.05, p[1]);
        lead = o.prog;
      }
    }
    if (dt > 0) {                                            // release the next staged box once the lane entry is clear
      const staged = outBoxes.filter(o => o.staged && o.line === L);
      if (staged.length && !act.some(o => o.active && o.prog < OUT_HEADWAY)) {
        const o = staged[0]; o.staged = false; o.active = true; o.prog = 0;
        parkStaged(L);
      }
    }
  }
}
function releaseOutMesh(mesh) {                              // a forklift took this box — free it back to the pool
  const o = outBoxes.find(b => b.mesh === mesh);
  if (o) { o.active = false; o.queued = false; o.staged = false; o.rig = null; }
  mesh.visible = false;
}
function resetOutbound() {
  outBoxes.forEach(o => { o.active = false; o.queued = false; o.staged = false; o.rig = null; o.mesh.visible = false; });
  forkLifts.forEach(fl => { if (fl.waitMeshes) fl.waitMeshes.length = 0; });
  spawnedM = spawnedSola = spawnedCanyon = 0;
}
/* ---- 🛒 cart test-drive: a preview cart glides each materials cart's FULL
   loop — elevator → waypoints → cart spot → return waypoints → endpoint —
   on the normal floor or in Edit Layout. ---- */
let cartDemoOn = false;
const demoCarts = [];
function demoRoute(i) {
  try {
    if (i === 0) return [[EL[0], EL[1]], ...cartWaypoints.map(w => [w.x, w.z]), [nodes.cart.x, nodes.cart.z], ...returnWps.map(w => [w.x, w.z]), endPt(1)];
    if (i === 1) return [[EL[0], EL[1]], ...cart2Waypoints.map(w => [w.x, w.z]), [nodes.cart2.x, nodes.cart2.z], ...returnWps2.map(w => [w.x, w.z]), endPt(2)];
    return [[EL[0], EL[1]], ...cart3Waypoints.map(w => [w.x, w.z]), [nodes.cart3.x, nodes.cart3.z], ...returnWps3.map(w => [w.x, w.z]), endPt(3)];
  } catch (e) { return null; }
}
function stopCartDemo() {
  cartDemoOn = false;
  demoCarts.forEach(d => { d.mesh.visible = false; });
  const b = document.getElementById('runCartsBtn'); if (b) { b.textContent = '🛒 Run carts'; b.classList.remove('on'); }
}
function updateCartDemo(dt) {
  if (!cartDemoOn) return;
  if (demoCarts.length === 0) {
    for (let i = 0; i < 3; i++) { const m = makePartsCart(); m.scale.set(1.61, 1.2, 1.04); m.visible = false; level2.add(m); demoCarts.push({ mesh: m, prog: i * 2 }); }
  }
  demoCarts.forEach((d, i) => {
    const pts = demoRoute(i);
    if (!pts || pts.length < 2) { d.mesh.visible = false; return; }
    let len = 0; for (let k = 0; k < pts.length - 1; k++) len += Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]);
    if (len < 0.5) { d.mesh.visible = false; return; }
    d.prog = (d.prog + 2.6 * dt) % len;                      // ~2.6 m/s walking-push pace, looping
    let rem = d.prog, x = pts[0][0], z = pts[0][1], ang = 0;
    for (let k = 0; k < pts.length - 1; k++) {
      const dx = pts[k + 1][0] - pts[k][0], dz = pts[k + 1][1] - pts[k][1], sl = Math.hypot(dx, dz) || 1e-6;
      if (rem <= sl) { const fr = rem / sl; x = pts[k][0] + dx * fr; z = pts[k][1] + dz * fr; ang = Math.atan2(dx, dz); break; }
      rem -= sl;
    }
    d.mesh.visible = focusShows(LINE_KEYS[i]);
    d.mesh.position.set(x, 0, z); d.mesh.rotation.y = ang;
  });
}
function makeForkGap(){
  const g = new THREE.Group();
  const W = 2.6, D = 2.0;                                   // ~8.5' x 6.5' opening (fits a sofa)
  const hole = new THREE.Mesh(new THREE.BoxGeometry(W, 0.5, D), new THREE.MeshStandardMaterial({ color:0x10141a, roughness:0.96 }));
  hole.position.y = -0.24; g.add(hole);                     // dark recess = the opening (rails/gate/stripes come with the rig)
  const rec = buildLiftRig(g, D);
  return { g, rec };
}
const accessPts = [];
function addAccess(x,z){ const fg = makeForkGap(); fg.g.position.set(x,0,z); level2.add(fg.g); accessPts.push({ g:fg.g, x, z, rec:fg.rec }); }
function clearAccess(){ accessPts.forEach(a => { level2.remove(a.g); const i=forkLifts.indexOf(a.rec); if(i>=0) forkLifts.splice(i,1); }); accessPts.length=0; }
[[DECK.x0+6, DECK.z1-3],[MX1-6, DECK.z1-3]].forEach(p=>addAccess(p[0],p[1]));   // 2 forklift openings

// ---- finished-goods racks: draggable; packages populate them as sofas ship ----
const RACK_LEVELS = [0.55, 1.15, 1.75, 2.35], RACK_COLS = [-0.52, 0.52];
const RACK_SLOTS = RACK_LEVELS.length * RACK_COLS.length;     // furniture stacks UP across shelf levels
function makeRackUnit(){
  const g=new THREE.Group(); const L=1.9, D=0.7, H=2.7;        // ~6' wide, taller so it stacks up
  for (const [px,pz] of [[-L/2,-D/2],[L/2,-D/2],[-L/2,D/2],[L/2,D/2]]) { const p=bx(0.08,H,0.08,MAT.rackPost); p.position.set(px,H/2,pz); g.add(p); }
  for (const y of RACK_LEVELS) for (const pz of [-D/2,D/2]) { const beam=bx(L,0.07,0.07,MAT.rackBeam); beam.position.set(0,y-0.05,pz); g.add(beam); }
  const slots=[];                                              // fill bottom level first, then stack upward
  for (let lv=0; lv<RACK_LEVELS.length; lv++) for (let c=0; c<RACK_COLS.length; c++){
    const pk=makePackage(); pk.scale.set(0.6,0.55,0.7); pk.position.set(RACK_COLS[c], RACK_LEVELS[lv], 0); pk.visible=false; g.add(pk); slots.push(pk);
  }
  return { g, slots };
}
const racks=[];
function addRack(x,z,rot){ const r=makeRackUnit(); r.g.position.set(x,0,z); if(rot) r.g.rotation.y=rot; level2.add(r.g); racks.push({ g:r.g, x, z, slots:r.slots }); }
function clearRacks(){ racks.forEach(r=>level2.remove(r.g)); racks.length=0; }
[[DECK.x0+4, DECK.z0+1],[DECK.x0+8.5, DECK.z0+1]].forEach(p=>addRack(p[0],p[1]));   // seed 2 racks along the back
let onRacks=0, lastShipped=0;                                   // packages currently stored / last ship count seen
// ---- outbound flow-down: every finished box travels the green furniture lane
// to a forklift access point, queues on its pallet square, and a forklift takes
// it down (~6s trip, all rigs in parallel). The queue length IS the outbound
// WIP — it only grows when the lines outrun the material handling. ----
let gShippedM = 0;                                              // Meritage units shipped so far (spawner reads this)
// (forklift trips are driven by the outbound dispatcher in the render loop)
function fillRacks(){ let n=onRacks; for(const r of racks) for(const s of r.slots){ s.visible = n>0; if(n>0) n--; } }

// the single materials cart (holds all parts) — draggable; feeders pull from this one spot
// draggable cart SPOT (front of the queue) — feeders pull parts from here
const cartPad = new THREE.Group();                           // a true cart SPOT: 5' x 3' taped outline (was a 9' square)
const CPW = 6 * FT, CPD = 3 * FT;   // taped cart spot, fits the 5'6" CAD cart
const pad = bx(CPW, 0.04, CPD, new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.9, transparent: true, opacity: 0.45 }));
pad.position.y = 0.025; cartPad.add(pad);
for (const dx of [-CPW / 2, CPW / 2]) { const e = bx(0.08, 0.03, CPD, MAT.tape); e.position.set(dx, 0.03, 0); cartPad.add(e); }
for (const dz of [-CPD / 2, CPD / 2]) { const e = bx(CPW, 0.03, 0.08, MAT.tape); e.position.set(0, 0.03, dz); cartPad.add(e); }
const cartSign = (function(){ const c=document.createElement('canvas'); c.width=320; c.height=72; const x=c.getContext('2d');
  x.fillStyle='#1d3a66'; x.beginPath(); x.roundRect(4,8,312,56,14); x.fill();
  x.fillStyle='#fff'; x.font='700 30px Arial'; x.textAlign='center'; x.textBaseline='middle'; x.fillText('MATERIALS CART',160,38);
  const tex=new THREE.CanvasTexture(c); tex.anisotropy=8; const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:false,transparent:true}));
  sp.scale.set(2.0,0.45,1); sp.position.y=1.6; cartPad.add(sp); return sp; })();
const CART_DEF = [-2, -1.2];
cartPad.position.set(CART_DEF[0], 0, CART_DEF[1]); level2.add(cartPad);

// pool of physical carts moved by the elevator/queue state machine
const EL = [DECK.x0 - 1.6, 2];         // elevator docks the left edge of the floor (level2-local x,z)
const MAXQ = 3, LIFT_RPS = 3.0, ROLL_RPS = 3.2;   // up to 3 carts up; cart roll/elevator speed in units per REAL second (steady visual pace)
let CART_UNITS = 1;                     // each cart carries the materials for one sofa
const cartPool = [];
for (let i = 0; i < 3; i++) { const c = makePartsCart(); c.scale.set(1.61, 1.2, 1.04); c.visible = false; level2.add(c); cartPool.push({ mesh: c, state: 'down', slot: -1, remaining: 0 }); }   // carts at the true CAD footprint: 5.5' x 2.33'
let elevBusy = false, carY = 0.4, lastConsumed = 0, lastSimT = 0;

/* ===== Surrounding warehouse areas (from the plant floor plan). The two line
   decks stay as-is; these are the staging/rack/forklift zones AROUND them.
   EDITABLE: drag each area in Edit Layout, right-click to remove. Persisted in
   the layout as __areas. Toggle all with the 🏭 Areas button. ===== */
const surroundings = new THREE.Group(); level2.add(surroundings);
const areas = [];                                            // [{ g, kind, x, z, rot }]
const AY = 0;
const AM = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.92 }, o || {}));
const AC = { pallet: 0x6f88b0, uph: 0x8f6fb0, fg: 0x3f9e6a, cart: 0x3f8fb0, x: 0xc79a3a, back: 0x9a6fb0, fork: 0xd8c033 };
const A_STEEL = AM(0x8fa0b0, { metalness: 0.3, roughness: 0.6 });
const A_PALLET = AM(0x9c7b4f, {}), A_BOX = AM(0xc7a566, {});
// ---- a sealed-concrete floor look for the surrounding area (canvas texture: speckle + expansion joints) ----
function concreteTex(rx, ry) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#c6cacd'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3200; i++) { const v = 175 + (Math.random() * 60 | 0); g.fillStyle = 'rgba(' + v + ',' + v + ',' + (v + 3) + ',0.10)'; const s = 1 + Math.random() * 2; g.fillRect(Math.random() * 256, Math.random() * 256, s, s); }
  for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(120,126,132,0.06)'; g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 8 + Math.random() * 34, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(88,94,100,0.55)'; g.lineWidth = 3; g.strokeRect(0, 0, 256, 256);   // expansion joint = tile border
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; return t;
}
// the ENTIRE floor = the CAD's true interior: 105' x 64' (measured 1:1 from the
// drawing at 27.05 px/ft — lift 8x12, tables 8x4/8x3 all confirm it). 105'=35yd.
const FLOOR_W = 105 * FT, FLOOR_D = 64 * FT, FLOOR_X = 7.09;
const FLOOR_X0 = FLOOR_X - FLOOR_W / 2, FLOOR_X1 = FLOOR_X + FLOOR_W / 2;   // ≈ −8.91 .. 23.09
const FLOOR_Z0 = -FLOOR_D / 2, FLOOR_Z1 = FLOOR_D / 2;                       // ≈ −9.60 .. 9.60
var floorSlab = null;
(function buildFloor() {
  const slab = new THREE.Mesh(new THREE.BoxGeometry(FLOOR_W, 0.5, FLOOR_D), deckMat);   // same space-gray as the decks — one uniform floor colour
  slab.position.set(FLOOR_X, -0.29, 0); slab.receiveShadow = true; surroundings.add(slab);
  floorSlab = slab;                                          // lineZones bakes the zone tints into this slab's texture (no z-fighting)
  // painted yellow aisle safety lines around the working area
  const paint = AM(0xe8c53a, { roughness: 0.65 });
  const line = (x, z, w, d) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), paint); m.position.set(x, AY + 0.02, z); surroundings.add(m); };
  const bx0 = FLOOR_X0 + 0.3, bx1 = FLOOR_X1 - 0.3, bz0 = FLOOR_Z0 + 0.3, bz1 = FLOOR_Z1 - 0.3, lw = 0.14;
  line((bx0 + bx1) / 2, bz0, bx1 - bx0, lw); line((bx0 + bx1) / 2, bz1, bx1 - bx0, lw);
  line(bx0, (bz0 + bz1) / 2, lw, bz1 - bz0); line(bx1, (bz0 + bz1) / 2, lw, bz1 - bz0);
})();
// ---- stairs up to the floor, to the LEFT of the lift (per the plant plan) ----
// ---- stairs, built RELATIVE to an anchor (the top-landing corner) so the
// whole staircase is a normal editable "area": drag it, right-click deletes it.
function buildStairsInto(g) {
  const W = 4 * FT;                                    // 4' wide industrial stair
  const rise = FLOOR2 - 0.04;                          // ground → floor top
  const steps = 32, sh = rise / steps, tread = 0.28, run = steps * tread;
  const stepMat = AM(0x6d7680, { metalness: 0.35, roughness: 0.6 });
  for (let i = 1; i <= steps; i++) {                   // code-legal treads: 7.3" rise / 11" run
    const t = new THREE.Mesh(new THREE.BoxGeometry(W, 0.07, tread), stepMat);
    t.position.set(0, -FLOOR2 + i * sh - 0.035, (steps - i) * tread + tread / 2);
    t.castShadow = true; g.add(t);
  }
  const len = Math.hypot(run, rise), ang = Math.atan2(rise, run);
  for (const dx of [-W / 2, W / 2]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.3, len), A_STEEL);   // stringer
    s.position.set(dx, -FLOOR2 + rise / 2 - 0.12, run / 2); s.rotation.x = ang; g.add(s);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, len), A_STEEL);   // sloped handrail
    rail.position.set(dx, -FLOOR2 + rise / 2 + 0.95, run / 2); rail.rotation.x = ang; g.add(rail);
    for (let i = 2; i <= steps; i += 5) {              // rail posts
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 0.05), A_STEEL);
      p.position.set(dx, -FLOOR2 + i * sh + 0.5, (steps - i) * tread + tread / 2); g.add(p);
    }
  }
  // top landing bridging onto the floor edge, with guard rails on the open sides
  const land = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 1.6), stepMat);
  land.position.set(0.05, -0.08, -0.8); land.castShadow = true; g.add(land);
  for (const [w, d, lx, lz] of [[1.5, 0.06, 0.05, -1.6], [0.06, 1.6, -0.7, -0.8]]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), A_STEEL); r.position.set(lx, 1.0, lz); g.add(r);
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.05, 0.05), A_STEEL); p1.position.set(lx - w / 2 + 0.03, 0.48, lz - d / 2 + 0.03); g.add(p1);
    const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.05, 0.05), A_STEEL); p2.position.set(lx + w / 2 - 0.03, 0.48, lz + d / 2 - 0.03); g.add(p2);
  }
}
// ---- SECTION LINES from the plant drawing: the four dashed cyan dividers,
// extracted from the PDF vectors, mapped 1:1, each an editable "area" (drag /
// right-click delete like everything else). Polylines relative to point 0. ----
// re-derived from the PDF cyan lines with the SAME transform the CAD overlay uses
// (interior walls PDF pts 116..2960 x 208..1940 -> floor 105'x64'), so they land
// exactly on the drawing's section dividers.
const SECTION_LINES = [
  [[-3.06, -6.39], [-3.06, 0.05], [-3.33, 0.05], [-3.33, 4.82], [-3.74, 4.82], [-3.74, 7.97]],
  [[4.91, -6.36], [4.91, 0.99], [5.18, 0.99], [5.18, 7.88]],
  [[11.79, -6.41], [11.79, -3.87], [13.08, -3.87], [13.08, -0.64], [12.00, -0.64], [12.00, 1.01], [12.54, 1.01], [12.54, 4.89], [13.55, 4.89], [13.55, 7.96]],
  [[17.87, -6.61], [17.87, -2.59], [17.60, -2.59], [17.60, 8.00]],
];
function slineInto(g, pl) {
  const ax = pl[0][0], az = pl[0][1];
  const arr = []; pl.forEach(pt => arr.push(pt[0] - ax, 0.055, pt[1] - az));
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  const ln = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0x00b7d4, dashSize: 0.45, gapSize: 0.28 }));
  ln.computeLineDistances(); g.add(ln);
}
// the four CAD section dividers are FIXED reference lines: always drawn at the
// exact CAD coordinates, not draggable, not deletable, not part of layouts.
const sectionGroup = new THREE.Group(); surroundings.add(sectionGroup);
SECTION_LINES.forEach(pl => {
  const g = new THREE.Group();
  slineInto(g, pl);
  g.position.set(pl[0][0], 0, pl[0][1]);
  sectionGroup.add(g);
});
// ---- PROMINENT line zones, taken 1:1 from the CAD: the tints and boundary
// walls follow the DRAWN section lines exactly — CAD line 2 (Meritage/Sola)
// and CAD line 4 (Sola/Canyon), jogs included — so the zones on screen match
// the blue lines on the drawing, and a table's zone is its line.
(function lineZones() {
  const L1 = SECTION_LINES[0], L2 = SECTION_LINES[1], L3 = SECTION_LINES[2], L4 = SECTION_LINES[3];
  const jzs = pl => { const out = []; for (let i = 0; i < pl.length - 1; i++) if (pl[i][0] !== pl[i + 1][0]) out.push(pl[i][1]); return out; };
  // the tints are BAKED into the floor slab's texture — part of the surface
  // itself, so there is nothing floating above the floor to z-fight with
  const c = document.createElement('canvas'); c.width = 1050; c.height = 640; const g2 = c.getContext('2d');
  g2.fillStyle = '#b7bcc2'; g2.fillRect(0, 0, 1050, 640);    // the space-gray base
  const PX = x => (x - FLOOR_X0) / FLOOR_W * 1050, PZ = z => (z - FLOOR_Z0) / FLOOR_D * 640;
  const zoneBetween = (A, B, rgba) => {
    const zs = [FLOOR_Z0, FLOOR_Z1, ...jzs(A), ...jzs(B)].sort((a, b) => a - b);
    g2.fillStyle = rgba;
    for (let i = 0; i < zs.length - 1; i++) {
      const za = zs[i], zb = zs[i + 1], zm = (za + zb) / 2;
      if (zb - za < 0.02) continue;
      g2.fillRect(PX(plX(A, zm)), PZ(za), PX(plX(B, zm)) - PX(plX(A, zm)), PZ(zb) - PZ(za));
    }
  };
  zoneBetween(L1, L2, 'rgba(29,58,102,0.10)');   // MERITAGE — between CAD lines 1 and 2
  zoneBetween(L2, L3, 'rgba(35,96,67,0.10)');    // SOLA — between CAD lines 2 and 3
  zoneBetween(L3, L4, 'rgba(154,91,31,0.13)');   // CANYON CREW — between CAD lines 3 and 4
  // (west of line 1 = storage, east of line 4 = staging — deliberately untinted)
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 8; tex.colorSpace = THREE.SRGBColorSpace;
  // apply the baked shading to EVERY floor surface (slab + both deck meshes),
  // world-aligned via per-mesh repeat/offset — the tint IS the floor surface,
  // so there are no floating planes left to z-fight or shimmer
  const applyZoneTex = mesh => {
    if (!mesh || !mesh.geometry || !mesh.geometry.parameters) return;
    const p = mesh.geometry.parameters, w = p.width, d = p.depth;
    const t2 = tex.clone(); t2.needsUpdate = true;
    t2.repeat.set(w / FLOOR_W, d / FLOOR_D);
    t2.offset.set((mesh.position.x - w / 2 - FLOOR_X0) / FLOOR_W, 1 - (mesh.position.z + d / 2 - FLOOR_Z0) / FLOOR_D);
    mesh.material = new THREE.MeshStandardMaterial({ map: t2, roughness: 0.7, metalness: 0.3 });
  };
  applyZoneTex(floorSlab);
  if (typeof deck !== 'undefined') applyZoneTex(deck);
  if (typeof mdeck !== 'undefined') applyZoneTex(mdeck);
  const wallMat = new THREE.MeshBasicMaterial({ color: 0x00b7d4, transparent: true, opacity: 0.28, depthWrite: false });
  [L2, L3, L4].forEach(pl => {              // low glowing walls on the three LINE boundaries
    for (let i = 0; i < pl.length - 1; i++) {
      const a = pl[i], b = pl[i + 1], dx = Math.abs(b[0] - a[0]), dz = Math.abs(b[1] - a[1]);
      const w = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.06, dx), 0.5, Math.max(0.06, dz)), wallMat);
      w.position.set((a[0] + b[0]) / 2, 0.25, (a[1] + b[1]) / 2); sectionGroup.add(w);
    }
  });
})();
// ---- object builders: each adds meshes to a group `g`, relative to the group origin ----
function aPad(g, w, d, color) {   // neutral marked-off zone (no colors) — a light-grey pad with a slightly darker outline
  const p = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), AM(0xbcc2c8, { transparent: true, opacity: 0.32, roughness: 0.9 })); p.position.y = AY + 0.03; g.add(p);
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), AM(0x9aa1a8, {})); b.position.y = AY + 0.012; g.add(b);
}
function aLabel(g, text, w) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 110; const x = c.getContext('2d');
  x.textAlign = 'center'; x.textBaseline = 'middle';
  fitFont(x, text, '800', 54, 490);
  x.lineWidth = 10; x.strokeStyle = 'rgba(255,255,255,0.85)'; x.strokeText(text, 256, 58);   // white halo so it reads on the grey floor
  x.fillStyle = '#0e1a2c'; x.fillText(text, 256, 58);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 16; t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 110 / 512), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = AY + 0.07; g.add(m);
}
function aPallet(g, x, z) {                                  // standard 48" x 40" pallet + load
  const p = new THREE.Mesh(new THREE.BoxGeometry(48 * FT / 12, 0.14, 40 * FT / 12), A_PALLET); p.position.set(x, AY + 0.08, z); p.castShadow = true; g.add(p);
  const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.9), A_BOX); b.position.set(x, AY + 0.45, z); b.castShadow = true; g.add(b);
}
function aRack(g, x, z, w, d, rot, h) {                      // w/d in metres, h = upright height
  h = h || 1.25;
  const r = new THREE.Group();
  for (const sx of [-w / 2, w / 2]) for (const sz of [-d / 2, d / 2]) { const u = new THREE.Mesh(new THREE.BoxGeometry(0.07, h, 0.07), A_STEEL); u.position.set(sx, AY + h / 2, sz); u.castShadow = true; r.add(u); }
  for (const fr of [0.28, 0.62, 0.96]) { const sh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), A_STEEL); sh.position.set(0, AY + h * fr, 0); r.add(sh); }
  r.position.set(x, 0, z); if (rot) r.rotation.y = rot; g.add(r);
}
function aCart(g, x, z) {                                    // 5'6" x 2'4" cart — measured off the CAD's Cart boxes (2.33 x 5.5 ft)
  const c = new THREE.Group();
  const CL = 5.5 * FT, CW = 2.33 * FT;
  const d = new THREE.Mesh(new THREE.BoxGeometry(CL, 0.1, CW), AM(0x59636f, { metalness: 0.3 })); d.position.y = AY + 0.34; d.castShadow = true; c.add(d);
  const b = new THREE.Mesh(new THREE.BoxGeometry(CL - 0.3, 0.42, CW - 0.16), AM(0xb0a06a, {})); b.position.y = AY + 0.6; b.castShadow = true; c.add(b);
  for (const wx of [-CL / 2 + 0.16, CL / 2 - 0.16]) for (const wz of [-CW / 2 + 0.1, CW / 2 - 0.1]) { const wl = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 12), AM(0x222, {})); wl.rotation.z = Math.PI / 2; wl.position.set(wx, AY + 0.09, wz); c.add(wl); }
  c.position.set(x, 0, z); g.add(c);
}
function aTurntable(g) {                                     // ~5' diameter assembly turntable
  const b = new THREE.Mesh(new THREE.CylinderGeometry(2.5 * FT, 2.5 * FT, 0.12, 28), A_STEEL); b.position.y = AY + 0.06; g.add(b);
  const t = new THREE.Mesh(new THREE.CylinderGeometry(2.1 * FT, 2.1 * FT, 0.07, 28), AM(0x556, {})); t.position.y = AY + 0.15; g.add(t);
}
function aGate(g, w) {                                       // 6' slide gate (w = 6 ft in metres)
  for (const sx of [-w / 2, w / 2]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.3, 0.12), A_STEEL); p.position.set(sx, AY + 0.65, 0); p.castShadow = true; g.add(p); }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 0.08), AM(0xc0552c, {})); bar.position.set(0, AY + 1.12, 0); g.add(bar);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(w * 2.33, 0.05, 0.05), A_STEEL); rail.position.set(w * 0.66, AY + 1.24, 0); g.add(rail);   // 8' gate travel rail (per plan)
}
// ---- area-kind registry: label + builder (drawn at the group origin) ----
const AREA_KINDS = {   // pads sized to fit the ~12.5' strips between the decks and the 35x21 yd floor edge
  forklift:    g => {
    // just the deck OPENING the forks travel through: dark recess + yellow edging (same as the @ openings)
    const hole = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 2.0), new THREE.MeshStandardMaterial({ color: 0x10141a, roughness: 0.96 }));
    hole.position.y = -0.2; g.add(hole);
    for (const [w, d, hx, hz] of [[2.9, 0.16, 0, -1.08], [2.9, 0.16, 0, 1.08], [0.16, 2.0, -1.38, 0], [0.16, 2.0, 1.38, 0]]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), MAT.matEdge); e.position.set(hx, 0.055, hz); g.add(e);
    }
    const card = makeMiniLabel('Forklift Access', '#8a6d1f'); card.position.set(0, 2.3, 0); g.add(card);
    g.userData.forkRec = buildLiftRig(g, 2.0);
  },   // floating name card + a real hole in the deck; the forklift below lifts through it
  pallets:     g => { aPad(g, 3.4, 3.4, AC.pallet); aLabel(g, 'Pallet Staging', 3.1); aPallet(g, 0, -0.9); aPallet(g, 0, 0.9); },
  solaPallets: g => { aPad(g, 3.4, 3.4, AC.pallet); aLabel(g, 'Sola Pallets', 3.1); aPallet(g, -0.85, 0.6); aPallet(g, 0.85, 0.6); },
  upholstery:  g => { aPad(g, 2.8, 3.4, AC.uph); aLabel(g, 'Upholstery Rack', 2.6); aRack(g, 0, -0.7, 6 * FT, 2 * FT, 0, 1.7); },   // 6' x 2' garment-height rack
  fg:          g => { aPad(g, 3.6, 5, AC.fg); aLabel(g, 'FG Staging', 3.3); aPallet(g, -0.85, -1.3); aPallet(g, 0.85, -1.3); aPallet(g, -0.85, 1); aPallet(g, 0.85, 1); },
  xstaging:    g => { aPad(g, 3.6, 2.6, AC.x); aLabel(g, 'X Staging', 3.3); },
  backrest:    g => { aPad(g, 3.6, 2.8, AC.back); aLabel(g, 'Back Rest Rack', 3.3); aRack(g, 0, 0, 6 * FT, 2.5 * FT, 0, 1.4); },   // 6 x 2.5 per plan
  solaCart:    g => { aPad(g, 6, 3.4, AC.cart); aLabel(g, 'Sola Cart Staging', 4); aCart(g, -1.6, 0.5); aCart(g, 0, 0.5); aCart(g, 1.6, 0.5); },
  cart:        g => { aPad(g, 3.4, 3.4, AC.cart); aLabel(g, 'Cart Staging', 3.1); aCart(g, -0.8, 0.5); aCart(g, 0.8, 0.5); },
  rackRow:     g => { aLabel(g, '6 × 1.5 Racks', 3); for (let i = 0; i < 6; i++) aRack(g, 0, -5 + i * 2, 6 * FT, 1.5 * FT, Math.PI / 2); },   // exact 6' x 1.5'
  turntable:   g => { aTurntable(g); aLabel(g, 'Turn Table', 2.2); },
  gate:        g => { aGate(g, 6 * FT); aLabel(g, "6' Slide Gate", 2.4); },   // true 6' opening + 8' travel rail
  stairs:      g => buildStairsInto(g),                                        // the ground→floor staircase — editable like everything else
};
function addArea(kind, x, z, rot) {
  const build = AREA_KINDS[kind]; if (!build) return null;
  const g = new THREE.Group(); build(g); g.position.set(x, 0, z); if (rot) g.rotation.y = rot;
  surroundings.add(g); const a = { g, kind, x, z, rot: rot || 0 }; areas.push(a); return a;
}
function dropForkRec(g) { const r = g && g.userData && g.userData.forkRec; if (r) { const i = forkLifts.indexOf(r); if (i >= 0) forkLifts.splice(i, 1); } }
function clearAreas() { areas.forEach(a => { dropForkRec(a.g); surroundings.remove(a.g); }); areas.length = 0; }
function restoreAreas(list) {
  // section lines are no longer areas — drop any sline entries from old saves
  // (the fixed sectionGroup always draws them at the exact CAD positions)
  clearAreas(); (list || []).filter(a => !/^sline/.test(a[0])).forEach(a => addArea(a[0], a[1], a[2], a[3] || 0));
  // migration: layouts saved before the stairs became an area don't contain
  // them — add the default. Snap a near-default stairs to its exact home.
  if (!areas.some(a => a.kind === 'stairs')) {
    AREA_DEFAULTS.filter(d => d[0] === 'stairs').forEach(d => addArea(d[0], d[1], d[2], d[3] || 0));
  }
  const sd = AREA_DEFAULTS.find(d => d[0] === 'stairs');
  areas.forEach(a => {
    if (a.kind === 'stairs' && sd && Math.hypot(a.x - sd[1], a.z - sd[2]) < 0.75) { a.x = sd[1]; a.z = sd[2]; a.g.position.set(sd[1], 0, sd[2]); }
  });
}
// default placement — everything tucked onto the 35 x 21 yd floor: the LEFT strip
// (west of the Meritage deck), the RIGHT strip (east of the Sola deck), and the
// narrow south edge (racks + gate). Drag any of them in Edit Layout.
const AREA_DEFAULTS = [
  // left strip (x ≈ -7)
  ['forklift', -7.0, -7.7], ['pallets', -7.0, -4.2], ['upholstery', -7.0, -0.9, Math.PI / 2], ['solaCart', -7.0, 5.5, Math.PI / 2],
  // right strip (x ≈ 21.2)
  ['fg', 21.2, -6.9], ['turntable', 21.2, -3.4], ['xstaging', 21.2, -1.1], ['backrest', 21.2, 1.7], ['solaPallets', 21.2, 4.7], ['cart', 21.2, 7.8],
  // south edge
  ['rackRow', 1.0, 9.33, Math.PI / 2], ['gate', 8.6, 9.4],
  // stairs (left of the lift) — the four CAD section lines are FIXED scenery now, not areas
  ['stairs', FLOOR_X0 - 0.74, 2.2],
];
function defaultAreas() { clearAreas(); AREA_DEFAULTS.forEach(a => addArea(a[0], a[1], a[2], a[3] || 0)); }
defaultAreas();

// ---- editable cart PATH: elevator -> waypoints -> cart spot (so carts route around stations) ----
let cartWaypoints = [];            // [{x,z}] user-editable
const pathLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0x2e7d4f, dashSize: 0.6, gapSize: 0.35 }));
pathLine.visible = false; level2.add(pathLine);
const wpGroup = new THREE.Group(); wpGroup.visible = false; level2.add(wpGroup);
const WP_MAT = new THREE.MeshStandardMaterial({ color: 0x2e7d4f, roughness: 0.5 });
function pathPts() { return [[EL[0], EL[1]], ...cartWaypoints.map(w => [w.x, w.z]), [nodes.cart.x, nodes.cart.z]]; }
function pathTotal() { const p = pathPts(); let t = 0; for (let i = 0; i < p.length - 1; i++) t += Math.hypot(p[i+1][0]-p[i][0], p[i+1][1]-p[i][1]); return t; }
function pointAtDist(d) {
  const p = pathPts(); let rem = Math.max(0, d);
  for (let i = 0; i < p.length - 1; i++) {
    const L = Math.hypot(p[i+1][0]-p[i][0], p[i+1][1]-p[i][1]);
    if (rem <= L || i === p.length - 2) { const f = L ? rem / L : 0; return [p[i][0]+(p[i+1][0]-p[i][0])*f, p[i][1]+(p[i+1][1]-p[i][1])*f]; }
    rem -= L;
  }
  return p[p.length - 1];
}
function slotDist(i) { return Math.max(0, pathTotal() - i * 2.9); }   // slot 0 = end of path (cart spot)
// ---- the cart AISLE: a 5'-wide lane that LOOPS elevator → cart spot → back to
// the elevator, drawn as a floor tint. Shown while in Edit Layout. The return
// leg has its own draggable waypoints (amber dots) so future paths can be drawn. ----
const AISLE_W = 5 * FT;
let aisleOn = true;                                          // 🔵 Lanes toggle: show/hide the blue aisle tint while editing
let returnWps = [], returnWps2 = [];                         // waypoints on each cart's RETURN leg (cart spot → elevator)
const aisleMat = new THREE.MeshBasicMaterial({ color: 0x54749e, transparent: true, opacity: 0.5, depthWrite: false });
const RET_MAT_LINE = () => new THREE.LineDashedMaterial({ color: 0xb0812f, dashSize: 0.5, gapSize: 0.3, transparent: true, opacity: 0.95 });
const returnLine = new THREE.Line(new THREE.BufferGeometry(), RET_MAT_LINE()); returnLine.visible = false; level2.add(returnLine);
const returnLine2 = new THREE.Line(new THREE.BufferGeometry(), RET_MAT_LINE()); returnLine2.visible = false; level2.add(returnLine2);
const WPR_MAT = new THREE.MeshStandardMaterial({ color: 0xb0812f, roughness: 0.5 });
// ---- cart RETURN endpoints: where each cart's return leg ENDS. null = the
// shared elevator (so it tracks the elevator). Drag the ⚑ marker to end a cart's
// line somewhere else; right-click it to snap back to the elevator. The ⚑
// Endpoints toggle shows/hides the markers so you can see where every line ends.
let retEnd = null, retEnd2 = null, retEnd3 = null;
let endpointsOn = false;
const endGroup = new THREE.Group(); endGroup.visible = false; level2.add(endGroup);
function makeEndMarker(text, color) {
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.7, 18), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3, roughness: 0.5 }));
  hit.position.y = 0.35;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.7, 10), new THREE.MeshStandardMaterial({ color: 0x37414c })); pole.position.y = 1.2; hit.add(pole);
  const flag = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4, roughness: 0.4 })); flag.position.y = 1.75; hit.add(flag);
  const c = document.createElement('canvas'); c.width = 320; c.height = 60; const g2 = c.getContext('2d');
  g2.fillStyle = 'rgba(255,255,255,0.94)'; g2.beginPath(); g2.roundRect(2, 2, 316, 56, 12); g2.fill();
  g2.fillStyle = '#1a2430'; g2.font = '700 24px Arial'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText(text, 160, 32);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 8; tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })); sp.scale.set(3.2, 0.6, 1); sp.position.y = 2.6; hit.add(sp);
  return hit;
}
function refreshEnds() {
  while (endGroup.children.length) endGroup.remove(endGroup.children[0]);
  endGroup.visible = endpointsOn;
  if (!endpointsOn) return;
  // when an endpoint is still "at the elevator" (null), fan the markers into a
  // triangle CLEAR of the elevator footprint (~±1.4 m) so every one — Sola
  // included — is grabbable without being buried in the elevator.
  const foff = [[-2.1, -1.3], [0, 2.3], [2.1, -1.3]];
  [{ end: retEnd, col: 0xc0552c, tag: 'end', nm: 'Meritage cart' },
   { end: retEnd2, col: 0x236043, tag: 'end2', nm: 'Sola cart' },
   { end: retEnd3, col: 0x9a5b1f, tag: 'end3', nm: 'Canyon cart' }].forEach((d, i) => {
    if (typeof focusShows === 'function' && !focusShows(LINE_KEYS[i])) return;   // focused on another line
    const at = d.end ? [d.end.x, d.end.z] : [EL[0] + foff[i][0], EL[1] + foff[i][1]];
    const m = makeEndMarker(d.nm + (d.end ? ' — END' : ' → elevator'), d.col);
    m.position.set(at[0], 0, at[1]); m.userData = { cart: d.tag };
    endGroup.add(m);
  });
}
function endPt(which) { const e = which === 2 ? retEnd2 : which === 3 ? retEnd3 : retEnd; return e ? [e.x, e.z] : [EL[0], EL[1]]; }
function setLinePts(line, pts, y) {
  const arr = []; for (const pt of pts) arr.push(pt[0], y, pt[1]);
  line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  line.geometry.setDrawRange(0, pts.length); line.geometry.computeBoundingSphere(); line.computeLineDistances();
}
function makeAisleMesh() { const m = new THREE.Mesh(new THREE.BufferGeometry(), aisleMat); m.visible = false; m.renderOrder = 1; level2.add(m); return m; }
const aisleMesh = makeAisleMesh(), aisleMesh2 = makeAisleMesh();
function updateAisle(mesh, pts) {
  const y = 0.035, h = AISLE_W / 2, verts = [];
  for (let i = 0; i < pts.length - 1; i++) {                 // one quad per segment
    const ax = pts[i][0], az = pts[i][1], bx2 = pts[i + 1][0], bz2 = pts[i + 1][1];
    const dx = bx2 - ax, dz = bz2 - az, L = Math.hypot(dx, dz) || 1;
    const px = -dz / L * h, pz = dx / L * h;
    verts.push(ax + px, y, az + pz, bx2 + px, y, bz2 + pz, ax - px, y, az - pz,
               bx2 + px, y, bz2 + pz, bx2 - px, y, bz2 - pz, ax - px, y, az - pz);
  }
  for (let i = 1; i < pts.length - 1; i++) {                 // round the corners so segments read as one lane
    const cx = pts[i][0], cz = pts[i][1];
    for (let k = 0; k < 8; k++) {
      const a0 = k / 8 * Math.PI * 2, a1 = (k + 1) / 8 * Math.PI * 2;
      verts.push(cx, y, cz, cx + Math.cos(a0) * h, y, cz + Math.sin(a0) * h, cx + Math.cos(a1) * h, y, cz + Math.sin(a1) * h);
    }
  }
  mesh.geometry.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  mesh.geometry = g;
}
function refreshPath() {
  const p = pathPts(); const arr = [];
  for (const pt of p) arr.push(pt[0], 0.12, pt[1]);
  pathLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  pathLine.geometry.setDrawRange(0, p.length);
  pathLine.geometry.computeBoundingSphere();
  if (pathLine.computeLineDistances) pathLine.computeLineDistances();
  while (wpGroup.children.length) wpGroup.remove(wpGroup.children[0]);
  cartWaypoints.forEach((w, i) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.7, 16), WP_MAT); m.position.set(w.x, 0.35, w.z); m.userData = { cart:'cart', wp:i }; wpGroup.add(m); });
  const ret = [[nodes.cart.x, nodes.cart.z], ...returnWps.map(w => [w.x, w.z]), endPt(1)];   // return leg: cart spot → endpoint (elevator by default)
  setLinePts(returnLine, ret, 0.12);
  returnWps.forEach((w, i) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.7, 16), WPR_MAT); m.position.set(w.x, 0.35, w.z); m.userData = { cart: 'ret', wp: i }; wpGroup.add(m); });
  updateAisle(aisleMesh, [...p, ...ret.slice(1)]);           // the aisle is the FULL loop back to the elevator
  refreshEnds();
}

// ---- help-movement arrows: where an operator goes to help after finishing ----
let helpArrows = [];                  // [{from, fromIdx, to, helpMin}] — added via the “Help arrow” tool (no demo defaults, so chart times match the station times)
let dayPlan = { meritage: [], sola: [], canyon: [] };   // Planner: per line, an ordered list of {p: productIndex, q: quantity} builds for the day
let planStart = 7 * 60;                                  // Planner day start, minutes from midnight (clock display)
let plDrag = null;                                       // Planner drag-to-reorder: { line, i } of the order being dragged
const helpGroup = new THREE.Group(); level2.add(helpGroup);
const HELP_COL = 0x8f3fbf;

// ---- material-flow arrows: where parts come FROM and go TO between stations ----
let flowArrows = [];                                         // [{from, to}]
const flowGroup = new THREE.Group(); level2.add(flowGroup);
const FLOW_COL = 0x2e7d4f;                                   // green = part flow (distinct from purple help)
function buildFlow() {
  while (flowGroup.children.length) flowGroup.remove(flowGroup.children[0]);
  flowArrows.forEach(a => {
    if (!nodes[a.from] || !nodes[a.to]) return;
    const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: FLOW_COL }));
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 12), new THREE.MeshStandardMaterial({ color: FLOW_COL }));
    flowGroup.add(line, cone); a._line = line; a._cone = cone;
  });
}
const _fy = new THREE.Vector3(0, 1, 0), _fd = new THREE.Vector3();
function updateFlow() {
  const y = 0.4;
  flowArrows.forEach(a => {
    if (!a._line) return; const A = nodes[a.from], B = nodes[a.to]; if (!A || !B) return;
    const fv = (typeof focusShows !== 'function') || (focusShows(stLineOf(a.from)) && focusShows(stLineOf(a.to)));
    a._line.visible = fv; a._cone.visible = fv;
    a._line.geometry.setAttribute('position', new THREE.Float32BufferAttribute([A.x, y, A.z, B.x, y, B.z], 3));
    a._line.geometry.computeBoundingSphere();
    a._cone.position.set(B.x, y, B.z);
    _fd.set(B.x - A.x, 0, B.z - A.z); if (_fd.lengthSq() > 0.0001) { _fd.normalize(); a._cone.quaternion.setFromUnitVectors(_fy, _fd); }
  });
}
function assignHelpers() {
  if (typeof crew === 'undefined') return;
  crew.forEach(c => { c.helpTo = null; c.helpMin = 0; });
  helpArrows.forEach(a => {
    if (!arrowOn(a)) return;                          // arrow belongs to a product this line isn't building right now
    const idx = a.fromIdx || 0;
    const cs = crew.filter(c => c.station === a.from);
    const c = cs.find(c => c.idx === idx) || cs[cs.length - 1];   // the specific operator on this path
    if (c && !c.helpTo) { c.helpTo = a.to; c.helpMin = a.helpMin || 0; }
  });
}
function buildHelp() {
  while (helpGroup.children.length) helpGroup.remove(helpGroup.children[0]);
  helpArrows.forEach(a => {
    if (!nodes[a.from] || !nodes[a.to]) return;
    const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: HELP_COL }));
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 12), new THREE.MeshStandardMaterial({ color: HELP_COL }));
    helpGroup.add(line, cone); a._line = line; a._cone = cone;
  });
  assignHelpers();
}
const _hy = new THREE.Vector3(0,1,0), _hd = new THREE.Vector3();
function updateHelp() {
  const y = 0.25;
  helpArrows.forEach(a => {
    if (!a._line) return; const B = nodes[a.to]; if (!nodes[a.from] || !B) return;
    const fv = arrowOn(a) && ((typeof focusShows !== 'function') || (focusShows(stLineOf(a.from)) && focusShows(stLineOf(a.to))));
    a._line.visible = fv; a._cone.visible = fv;
    const hc = (typeof crew !== 'undefined') ? crew.find(c => c.station === a.from && c.idx === (a.fromIdx || 0)) : null;
    const A = hc ? { x: hc.homeX, z: hc.homeZ } : nodes[a.from];   // start the arrow at the specific operator
    a._line.geometry.setAttribute('position', new THREE.Float32BufferAttribute([A.x, y, A.z, B.x, y, B.z], 3));
    a._line.geometry.computeBoundingSphere();
    a._cone.position.set(B.x, y, B.z);
    _hd.set(B.x - A.x, 0, B.z - A.z); if (_hd.lengthSq() > 0.0001) { _hd.normalize(); a._cone.quaternion.setFromUnitVectors(_hy, _hd); }
  });
}

/* ---- station layout: feeders in back row, FA + packing in front ---- */
const OP_COLORS = [0x3a66a8, 0xb9772e, 0x2e7d4f, 0x8f5390, 0xa8923a, 0x3f8f8f, 0x9c4f45, 0x5c5f99];
const POS = {
  con:[-7.5, -3.2], arm:[-6, -3.2], bak:[0, -3.2], tre:[6, -3.2], sea:[12, -3.2],   // con pulled onto the floor (default used to sit past the west edge)
  fa:[-2, 4.2], pak:[10, 4.2],
};
const nodes = {};
let opColorIdx = 0;
const crew = []; // {fig, station, homeX, homeZ}

ST.forEach(s => {
  const [x, z] = POS[s.id];
  let st, led;
  if (s.double) {                                  // Arms = two 8'x4' benches joined end-to-end (16' x 4')
    const g = new THREE.Group();
    const b1 = makeBench(8, 4), b2 = makeBench(8, 4);
    b1.st.position.x = -4 * FT; b2.st.position.x = 4 * FT;   // share the inner edge
    g.add(b1.st, b2.st);
    st = g; led = [b1.led, b2.led];
  } else if (s.role === 'fa') {
    const r = makeBench(8, 5); st = r.st; led = r.led;       // Meritage full assembly: 8' x 5'
  } else {
    const r = makeBench(8, 4); st = r.st; led = r.led;       // 8' x 4' workbench
  }
  st.position.set(x, 0, z);
  level2.add(st);
  const label = makeStationLabel(s.title, s.sub, s.t ? s.t + ' min' : '—', s.accent);
  label.position.set(x, 2.85, z); level2.add(label);
  const mini = makeMiniLabel(s.title, s.accent);
  mini.position.set(x, 2.55, z); level2.add(mini);

  let visual = null;
  if (s.role === 'feeder') { visual = makeFeederWIP(s.kind); visual.g.position.set(x, 1.04, z); level2.add(visual.g); }
  if (s.role === 'fa') { visual = makeSofaProduct(); visual.g.position.set(x, 1.04, z); visual.update(0); level2.add(visual.g); }

  nodes[s.id] = { s, st, led, visual, label, mini, x, z, rot: 0 };

  // crew figures
  const np = s.role === 'pack' ? 0 : s.ppl;
  for (let i = 0; i < np; i++) {
    const color = OP_COLORS[opColorIdx % OP_COLORS.length]; opColorIdx++;
    const fig = makeCrewFigure(color, s.title.split(' ')[0] + (np>1?(' '+(i+1)):''));
    const spread = s.double ? 4 * FT : 1.1;        // one operator per 8' table on the double bench
    const bdx = (np > 1 ? (i - (np-1)/2) * 2 * spread : 0), bdz = ((s.role === 'fa' ? 5 : 4) * FT) / 2 + 0.6;   // stand on the mat
    fig.position.set(x + bdx, 0, z + bdz);
    level2.add(fig);
    crew.push({ fig, station: s.id, bdx, bdz, homeX: x + bdx, homeZ: z + bdz, idx: i });
  }
});
// register the materials cart as a draggable source node (nodes/POS now exist)
nodes.cart = { id:'cart', x:CART_DEF[0], z:CART_DEF[1], st:cartPad, s:{ id:'cart', title:'Materials cart' } };
POS.cart = [CART_DEF[0], CART_DEF[1]];

// ---- second materials cart for the SOLA side, fed from the SAME elevator ----
const CART2_DEF = [13, -1.2];                                 // on the Sola (right) side
const cart2Pad = new THREE.Group();                          // 5' x 3' cart spot, same as the Meritage one
const pad2 = bx(CPW, 0.04, CPD, new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.9, transparent: true, opacity: 0.45 }));
pad2.position.y = 0.025; cart2Pad.add(pad2);
for (const dx of [-CPW / 2, CPW / 2]) { const e = bx(0.08, 0.03, CPD, MAT.tape); e.position.set(dx, 0.03, 0); cart2Pad.add(e); }
for (const dz of [-CPD / 2, CPD / 2]) { const e = bx(CPW, 0.03, 0.08, MAT.tape); e.position.set(0, 0.03, dz); cart2Pad.add(e); }
(function(){ const c=document.createElement('canvas'); c.width=360; c.height=72; const x=c.getContext('2d');
  x.fillStyle='#236043'; x.beginPath(); x.roundRect(4,8,352,56,14); x.fill();
  x.fillStyle='#fff'; x.font='700 28px Arial'; x.textAlign='center'; x.textBaseline='middle'; x.fillText('SOLA MATERIALS CART',180,38);
  const tex=new THREE.CanvasTexture(c); tex.anisotropy=8; const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:false,transparent:true}));
  sp.scale.set(2.2,0.45,1); sp.position.y=1.6; cart2Pad.add(sp); })();
const cart2Mesh = makePartsCart(); cart2Mesh.scale.set(1.61,1.2,1.04); cart2Pad.add(cart2Mesh);   // a physical cart sits on the pad
cart2Pad.position.set(CART2_DEF[0], 0, CART2_DEF[1]); level2.add(cart2Pad);
nodes.cart2 = { id:'cart2', x:CART2_DEF[0], z:CART2_DEF[1], st:cart2Pad, s:{ id:'cart2', title:'Sola materials cart' } };
POS.cart2 = [CART2_DEF[0], CART2_DEF[1]];
// a line showing it's supplied from the SAME elevator
let cart2Waypoints = [];           // [{x,z}] for the Sola cart's route
const cart2Feed = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0x236043, dashSize:0.5, gapSize:0.3, transparent:true, opacity:0.6 }));
level2.add(cart2Feed);
const wpGroup2 = new THREE.Group(); wpGroup2.visible = false; level2.add(wpGroup2);
const WP2_MAT = new THREE.MeshStandardMaterial({ color: 0x236043, roughness: 0.5 });
function cart2Pts(){ return [[EL[0],EL[1]], ...cart2Waypoints.map(w=>[w.x,w.z]), [nodes.cart2.x, nodes.cart2.z]]; }
function refreshCart2Feed(){
  const p = cart2Pts(); const arr = []; for (const pt of p) arr.push(pt[0], 0.18, pt[1]);
  cart2Feed.geometry.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  cart2Feed.geometry.setDrawRange(0, p.length); cart2Feed.geometry.computeBoundingSphere(); cart2Feed.computeLineDistances();
  while (wpGroup2.children.length) wpGroup2.remove(wpGroup2.children[0]);
  cart2Waypoints.forEach((w, i) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,0.7,16), WP2_MAT); m.position.set(w.x,0.35,w.z); m.userData = { cart:'cart2', wp:i }; wpGroup2.add(m); });
  const ret = [[nodes.cart2.x, nodes.cart2.z], ...returnWps2.map(w => [w.x, w.z]), endPt(2)];
  setLinePts(returnLine2, ret, 0.12);
  returnWps2.forEach((w, i) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.7, 16), WPR_MAT); m.position.set(w.x, 0.35, w.z); m.userData = { cart: 'ret2', wp: i }; wpGroup2.add(m); });
  updateAisle(aisleMesh2, [...p, ...ret.slice(1)]);
  refreshEnds();
}
refreshCart2Feed();
// ---- third materials cart for the CANYON CREW line, fed from the same elevator ----
const CART3_DEF = [17.9, -3.0];                              // in the Canyon slice (east of section line 4)
const cart3Pad = new THREE.Group();
const pad3 = bx(CPW, 0.04, CPD, new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.9, transparent: true, opacity: 0.45 }));
pad3.position.y = 0.025; cart3Pad.add(pad3);
for (const dx of [-CPW / 2, CPW / 2]) { const e = bx(0.08, 0.03, CPD, MAT.tape); e.position.set(dx, 0.03, 0); cart3Pad.add(e); }
for (const dz of [-CPD / 2, CPD / 2]) { const e = bx(CPW, 0.03, 0.08, MAT.tape); e.position.set(0, 0.03, dz); cart3Pad.add(e); }
(function(){ const c=document.createElement('canvas'); c.width=420; c.height=72; const x=c.getContext('2d');
  x.fillStyle='#9a5b1f'; x.beginPath(); x.roundRect(4,8,412,56,14); x.fill();
  x.fillStyle='#fff'; x.font='700 26px Arial'; x.textAlign='center'; x.textBaseline='middle'; x.fillText('CANYON MATERIALS CART',210,38);
  const tex=new THREE.CanvasTexture(c); tex.anisotropy=8; const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:false,transparent:true}));
  sp.scale.set(2.4,0.45,1); sp.position.y=1.6; cart3Pad.add(sp); })();
const cart3Mesh = makePartsCart(); cart3Mesh.scale.set(1.61,1.2,1.04); cart3Pad.add(cart3Mesh);
cart3Pad.position.set(CART3_DEF[0], 0, CART3_DEF[1]); level2.add(cart3Pad);
nodes.cart3 = { id:'cart3', x:CART3_DEF[0], z:CART3_DEF[1], st:cart3Pad, s:{ id:'cart3', title:'Canyon materials cart' } };
POS.cart3 = [CART3_DEF[0], CART3_DEF[1]];
// full delivery PATH (elevator → waypoints → cart → return waypoints → elevator)
// with its own 5' aisle — same editable loop as the Sola cart.
let cart3Waypoints = [], returnWps3 = [];
const wpGroup3 = new THREE.Group(); wpGroup3.visible = false; level2.add(wpGroup3);
const WP3_MAT = new THREE.MeshStandardMaterial({ color: 0x9a5b1f, roughness: 0.5 });
const cart3Feed = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0x9a5b1f, dashSize:0.5, gapSize:0.3, transparent:true, opacity:0.6 }));
level2.add(cart3Feed);
const returnLine3 = new THREE.Line(new THREE.BufferGeometry(), RET_MAT_LINE()); returnLine3.visible = false; level2.add(returnLine3);
const aisleMesh3 = makeAisleMesh();
function cart3Pts(){ return [[EL[0],EL[1]], ...cart3Waypoints.map(w=>[w.x,w.z]), [nodes.cart3.x, nodes.cart3.z]]; }
function refreshCart3Feed(){
  const p = cart3Pts(); const arr = []; for (const pt of p) arr.push(pt[0], 0.18, pt[1]);
  cart3Feed.geometry.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  cart3Feed.geometry.setDrawRange(0, p.length); cart3Feed.geometry.computeBoundingSphere(); cart3Feed.computeLineDistances();
  while (wpGroup3.children.length) wpGroup3.remove(wpGroup3.children[0]);
  cart3Waypoints.forEach((w, i) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,0.7,16), WP3_MAT); m.position.set(w.x,0.35,w.z); m.userData = { cart:'cart3', wp:i }; wpGroup3.add(m); });
  const ret = [[nodes.cart3.x, nodes.cart3.z], ...returnWps3.map(w => [w.x, w.z]), endPt(3)];
  setLinePts(returnLine3, ret, 0.12);
  returnWps3.forEach((w, i) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.7, 16), WPR_MAT); m.position.set(w.x, 0.35, w.z); m.userData = { cart: 'ret3', wp: i }; wpGroup3.add(m); });
  updateAisle(aisleMesh3, [...p, ...ret.slice(1)]);
  refreshEnds();
}
refreshCart3Feed();
// ---- FURNITURE FLOW lanes: a 5'-wide finished-goods path from the END of each
// line (Meritage = packing bench; Sola / Canyon = the last station in flow
// order) to the NEAREST forklift access point (@). Green tint = product flow
// (vs the blue cart lanes); the dashed centerline uses the line's accent color.
// Editable like the cart lanes: double-click a lane to add a waypoint right
// there, drag the dots, right-click a dot to delete. Shown in Edit Layout and
// obeys the Lanes toggle. Endpoints auto-track: move the line's last station or
// the access point and the lane follows. ----
const PROD_COLS = [0x1d3a66, 0x236043, 0x9a5b1f];            // Meritage / Sola / Canyon accents
let prodWps = [[], [], []];                                  // editable waypoints per line
const prodAisleMat = new THREE.MeshBasicMaterial({ color: 0x2e7d4f, transparent: true, opacity: 0.38, depthWrite: false });
const prodAisles = PROD_COLS.map(() => { const m = new THREE.Mesh(new THREE.BufferGeometry(), prodAisleMat); m.visible = false; m.renderOrder = 1; level2.add(m); return m; });
const prodLines = PROD_COLS.map(c => { const l = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: c, dashSize: 0.6, gapSize: 0.3, transparent: true, opacity: 0.95 })); l.visible = false; level2.add(l); return l; });
const prodWpGroup = new THREE.Group(); prodWpGroup.visible = false; level2.add(prodWpGroup);
const PROD_WP_MATS = PROD_COLS.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));
var prodLanesOn = true;                                      // 📦 Flow lanes toggle — hides the green lanes (boxes keep traveling)
let prodStart = [null, null, null];   // per-line SHIP-POINT override (station id, null = auto/flow order) — set via the ⇊ Ship point button
function lineEndNode(i) {                                    // where each line's finished furniture leaves from
  if (i === 0) return nodes.pak || null;
  const ov = prodStart[i];                                   // pinned ship point wins (if the station still exists on this line's slice)
  if (ov && nodes[ov] && sectionOf(nodes[ov].x, nodes[ov].z) === (i === 1 ? 'sola' : 'canyon')) return nodes[ov];
  const ids = (typeof orderedLine === 'function') ? orderedLine(i === 1 ? 'sola' : 'canyon') : [];
  return ids.length ? nodes[ids[ids.length - 1]] : null;     // auto: the last station in flow order
}
function nearestAccess(x, z) {
  // a forklift pickup is EITHER an @ access-point marker OR a drawn
  // "Forklift Access" area (kind 'forklift') — lanes go to whichever is closest
  let best = null, bd = Infinity;
  accessPts.forEach(a => { const d = Math.hypot(a.x - x, a.z - z); if (d < bd) { bd = d; best = a; } });
  areas.forEach(a => { if (a.kind !== 'forklift') return; const d = Math.hypot(a.x - x, a.z - z); if (d < bd) { bd = d; best = a; } });
  return best;
}
function prodPts(i) {
  const s = lineEndNode(i); if (!s) return null;
  const wps = prodWps[i], last = wps.length ? wps[wps.length - 1] : s;
  const acc = nearestAccess(last.x, last.z) || { x: EL[0], z: EL[1] };   // no @ on the floor → fall back to the elevator so the lanes ALWAYS draw
  return [[s.x, s.z], ...wps.map(w => [w.x, w.z]), [acc.x, acc.z]];
}
function refreshProdFlow() {
  while (prodWpGroup.children.length) prodWpGroup.remove(prodWpGroup.children[0]);
  const ed = (typeof editing !== 'undefined') && editing;
  for (let i = 0; i < 3; i++) {
    const pts = prodPts(i), has = !!(pts && pts.length >= 2);
    // furniture-flow lanes are ALWAYS shown (they document the floor's product
    // flow); in Edit Layout the Lanes toggle can hide them with the cart lanes
    prodAisles[i].visible = has && prodLanesOn && (ed ? aisleOn : true) && focusShows(LINE_KEYS[i]);
    prodLines[i].visible = has && prodLanesOn && focusShows(LINE_KEYS[i]);
    if (!has) continue;
    setLinePts(prodLines[i], pts, 0.14);
    updateAisle(prodAisles[i], pts);
    if (prodLanesOn) prodWps[i].forEach((w, k) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.7, 16), PROD_WP_MATS[i]); m.position.set(w.x, 0.35, w.z); m.userData = { cart: 'pf' + i, wp: k }; prodWpGroup.add(m); });
  }
}
// shipped boxes pool near packing/ship dock
// shipped boxes stack in the STORAGE slice (upper-left, west of section line 1):
// organized 3 columns x 2 levels, filling row by row from the north end
const shipBoxes = [];
for (let i = 0; i < 40; i++) {
  const b = makeShipBox(); b.visible = false;
  b.position.set(-7.9 + (i % 3) * 1.75, (Math.floor(i / 3) % 2) * 0.74, -8.8 + Math.floor(i / 6) * 1.15);
  level2.add(b); shipBoxes.push(b);
}
// a sofa that travels from FA to packing during pack phase
const movingSofa = makeSofaProduct(); movingSofa.update(1); movingSofa.g.visible = false; level2.add(movingSofa.g);

/* ---- traveling feeder parts: each feeder ships its finished sub-part to the
   full-assembly bench, where it stages until full assembly starts that unit.
   Per-feeder staging slot around the FA bench so all 5 converge visibly. ---- */
const MAX_UNITS = 40;
const TRAVEL = 4.5;            // sim-minutes a part spends in transit to FA
const FEEDERS = ['con','arm','bak','tre','sea'];
const SLOT = { // offset from FA bench centre where each feeder's part waits
  con:[-1.1,-0.35], arm:[-1.1,0.35], bak:[1.1,-0.35], tre:[1.1,0.35], sea:[0,0.0],   // staging spots on the full-assembly table
};
const travelParts = {};        // id -> array(MAX_UNITS) of part groups
FEEDERS.forEach(id => {
  const kind = get(id).kind;
  const arr = [];
  for (let u = 0; u < MAX_UNITS; u++) {
    const p = buildSub(kind); p.scale.set(0.5, 0.5, 0.5); p.visible = false;
    level2.add(p); arr.push(p);
  }
  travelParts[id] = arr;
});

controls.target.set(7, FLOOR2 + 0.8, 0);

/* =========================== UI =========================== */
const ui = {
  clock: document.getElementById('clock'),
  ship: document.getElementById('ship'),
  nOut: document.getElementById('nOut'),
  cyc: document.getElementById('cyc'),
  cap: document.getElementById('cap'),
  bot: document.getElementById('bot'),
  labor: document.getElementById('labor'),
};
let T = 0, playing = false;
let Ts = 0, solaSched = null, solaScheds = [], solaHorizon = 0, playScope = 'both';   // Sola has its own clock so the lines can run together or separately; solaScheds = one schedule per independent added line (Sola, Canyon Crew, …)
const playBtn = document.getElementById('play');
function setPlay(v){ playing=v; playBtn.textContent = v ? '❚❚ Pause' : '▶ Play'; }
playBtn.onclick = () => { if (playScope !== 'sola' && T >= horizon) T = 0; if (playScope !== 'meritage' && Ts >= solaHorizon) Ts = 0; setPlay(!playing); };
document.getElementById('reset').onclick = () => { T = 0; Ts = 0; setPlay(false); };
const playScopeSel = document.getElementById('playScope');
if (playScopeSel) playScopeSel.onchange = e => { playScope = e.target.value; T = 0; Ts = 0; setPlay(false); };
// 👁 line focus selector — view one line by itself
(() => {
  const ps = document.getElementById('playScope'); if (!ps || !ps.parentNode) return;
  const sel = document.createElement('select'); sel.id = 'lineFocusSel';
  sel.innerHTML = '<option value="all">👁 All lines</option><option value="meritage">👁 Meritage only</option><option value="sola">👁 Sola only</option><option value="canyon">👁 Canyon Crew only</option>';
  ps.parentNode.parentNode ? ps.parentNode.parentNode.insertBefore(sel.ownerDocument.createTextNode(''), null) : 0;
  ps.parentNode.insertBefore(sel, ps.nextSibling);
  sel.style.marginLeft = '6px';
  sel.onchange = e => { lineFocus = e.target.value; applyLineFocus(); };
})();
const nInput = document.getElementById('n');
nInput.value = N;
nInput.onchange = e => { N = Math.max(1, Math.min(40, parseInt(e.target.value)||8)); schedule(); if (typeof buildSolaSched==='function') buildSolaSched(); T=0; Ts=0; setPlay(false); };
const speed = document.getElementById('speed');
document.getElementById('cam').onclick = () => { if (is2D) set2D(false); camera.position.set(7,30,52); controls.target.set(7,FLOOR2+0.8,0); };
document.getElementById('top').onclick = () => { if (is2D) set2D(false); camera.position.set(4,FLOOR2+38,1); controls.target.set(4,FLOOR2,1); };
// ---- 2D plan view: a flat, floor-plan look that works in BOTH normal and edit
// mode. Implemented as a telephoto overhead camera (5° fov from ~260 m up) so it
// reads as orthographic while every click, drag, and control keeps working. ----
let is2D = false, saved3D = null;
function set2D(on) {
  is2D = on;
  const b = document.getElementById('btn2d');
  if (b) { b.textContent = on ? '▦ 2D: on' : '▦ 2D'; b.classList.toggle('on', on); }
  if (on) {
    saved3D = { p: camera.position.clone(), t: controls.target.clone(), fov: camera.fov, fog: scene.fog };
    scene.fog = null;                                         // the plan camera is ~260 m up — fog would white the scene out
    camera.fov = 5; camera.updateProjectionMatrix();
    camera.position.set(7.09, FLOOR2 + 260, 0.01);            // straight above the floor centre
    controls.target.set(7.09, FLOOR2, 0);
    controls.enableRotate = false;                            // pan + zoom only — it stays a plan
    camera.lookAt(controls.target);
  } else {
    camera.fov = saved3D ? saved3D.fov : 44; camera.updateProjectionMatrix();
    if (saved3D) { camera.position.copy(saved3D.p); controls.target.copy(saved3D.t); scene.fog = saved3D.fog; }
    controls.enableRotate = !editing;
  }
}
(() => {
  const t = document.getElementById('top'); if (!t) return;
  const b = document.createElement('button');
  b.id = 'btn2d'; b.className = t.className || '';
  b.textContent = '▦ 2D';
  b.title = 'Flat 2D floor-plan view — works in normal AND edit mode. Click again to go back to 3D.';
  t.parentNode.insertBefore(b, t.nextSibling);
  b.onclick = () => set2D(!is2D);
})();

/* ---- CAD OVERLAY: lay the actual plant drawing flat on the floor, scaled 1:1,
   so you can compare the model to the plan. Toggle in Edit Layout, drag to
   align, slider for opacity. The image maps exactly to the floor bounds. ---- */
let cadOverlay = null, cadOn = false, cadDragging = false;
function buildCadOverlay() {
  if (cadOverlay || !window.__CAD_OVERLAY__) return;
  const g = new THREE.Group();
  const w = FLOOR_X1 - FLOOR_X0, d = FLOOR_Z1 - FLOOR_Z0;
  const tex = new THREE.TextureLoader().load(window.__CAD_OVERLAY__);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  plane.rotation.x = -Math.PI / 2;                            // lay flat
  plane.position.set((FLOOR_X0 + FLOOR_X1) / 2, 0.2, (FLOOR_Z0 + FLOOR_Z1) / 2);   // just above the floor
  plane.renderOrder = 900;                                    // draw ON TOP of the model, so at 100% opacity the CAD fully covers it
  g.add(plane); g.visible = false; level2.add(g);
  cadOverlay = { g, plane, mat, hx: 0, hz: 0 };               // hx/hz = user alignment nudge
}
buildCadOverlay();
// ---- when the CAD is overlaid, mark MY stations in bright teal (drawn on top of
// the CAD, at every opacity) so it's obvious which tables are mine vs the black
// CAD drawing beneath. Rebuilt whenever stations move / the overlay toggles. ----
const myMarksGroup = new THREE.Group(); myMarksGroup.visible = false; level2.add(myMarksGroup);
const MY_MARK_FILL = new THREE.MeshBasicMaterial({ color: 0x12c2b0, transparent: true, opacity: 0.42, depthTest: false, depthWrite: false });
const MY_MARK_EDGE = new THREE.LineBasicMaterial({ color: 0x067d70, transparent: true, depthTest: false });
function stationFootprint(nd) {
  const s = nd.s; let w = 8 * FT, d = 4 * FT;
  if (s && s.role === 'fa') d = 5 * FT;
  if (s && s.double) w = 16 * FT;
  return [w, d];
}
let myMarksOn = true;                                        // the teal "my stations" highlight can be toggled off to see just the CAD
function rebuildMyMarks() {
  while (myMarksGroup.children.length) myMarksGroup.remove(myMarksGroup.children[0]);
  myMarksGroup.visible = cadOn && myMarksOn;
  if (!cadOn || !myMarksOn) return;
  const all = [...ST.map(s => nodes[s.id]), ...extraStations.map(id => nodes[id])].filter(Boolean);
  all.forEach(nd => {
    const [w, d] = stationFootprint(nd);
    const grp = new THREE.Group(); grp.position.set(nd.x, 0, nd.z); grp.rotation.y = nd.rot || 0;
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(w, d), MY_MARK_FILL); fill.rotation.x = -Math.PI / 2; fill.position.y = 0.24; fill.renderOrder = 902; grp.add(fill);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, d)), MY_MARK_EDGE); edge.rotation.x = -Math.PI / 2; edge.position.y = 0.25; edge.renderOrder = 903; grp.add(edge);
    myMarksGroup.add(grp);
  });
}
function setSlinesOnTop(on) {                                // while the CAD is shown, the blue lines draw ABOVE the sheet so alignment is checkable at any opacity
  sectionGroup.traverse(o => {
    if (o.material) { o.material.depthTest = !on; o.renderOrder = on ? 905 : 0; }
  });
}
function setCadOverlay(on) {
  if (!cadOverlay) return;
  cadOn = on && !!window.__CAD_OVERLAY__;
  cadOverlay.g.visible = cadOn;
  rebuildMyMarks();
  setSlinesOnTop(cadOn);
  const box = document.getElementById('cadBox'); if (box) box.style.display = cadOn ? 'flex' : 'none';
  const btn = document.getElementById('cadBtn'); if (btn) btn.classList.toggle('on', cadOn);
}
// controls: a button + a small floating opacity slider (built once)
(() => {
  const ah = document.getElementById('accesspt') || document.getElementById('top');
  const eb = document.getElementById('edit');
  const btn = document.createElement('button');
  btn.id = 'cadBtn'; btn.className = (eb && eb.className) || '';
  btn.textContent = '📐 CAD';
  btn.title = 'Overlay the CAD plant drawing on the floor (Edit Layout) — drag it to align, slider sets opacity';
  // place it next to the 2D button
  const anchor = document.getElementById('btn2d') || document.getElementById('top');
  anchor.parentNode.insertBefore(btn, anchor.nextSibling);
  btn.onclick = () => { if (!editing) setEditing(true); setCadOverlay(!cadOn); };
  // opacity slider box
  const box = document.createElement('div');
  box.id = 'cadBox';
  box.style.cssText = 'display:none;position:absolute;left:12px;bottom:78px;z-index:8;background:rgba(255,255,255,.95);border:1px solid #dfe3e8;border-radius:10px;padding:8px 12px;align-items:center;gap:8px;font:12px system-ui,Arial;box-shadow:0 4px 14px rgba(0,0,0,.15)';
  box.style.flexWrap = 'wrap'; box.style.maxWidth = '520px';
  box.innerHTML = '<b style="color:#1d3a66">CAD plan</b> <span style="color:#6b7785">opacity</span>' +
    '<input id="cadOpac" type="range" min="5" max="100" value="55" style="width:110px"> ' +
    '<span style="color:#6b7785">· Shift-drag to align</span>' +
    '<span style="width:100%;height:0"></span>' +   // line break
    '<label style="display:inline-flex;align-items:center;gap:5px;cursor:pointer"><input id="cadMarks" type="checkbox" checked>' +
    '<span style="width:12px;height:12px;background:#12c2b0;border:1px solid #067d70;display:inline-block;border-radius:2px"></span> highlight your stations</span>' +
    '<span style="color:#6b7785">opacity</span><input id="cadMarksOpac" type="range" min="10" max="100" value="42" style="width:90px">';
  document.body.appendChild(box);
  box.querySelector('#cadOpac').oninput = e => { if (cadOverlay) cadOverlay.mat.opacity = (+e.target.value) / 100; };
  box.querySelector('#cadMarks').onchange = e => { myMarksOn = e.target.checked; rebuildMyMarks(); };
  box.querySelector('#cadMarksOpac').oninput = e => { MY_MARK_FILL.opacity = (+e.target.value) / 100; };
})();
// label visibility: 0 = off, 1 = names only (compact), 2 = full cards
let labelMode = 1;
const extraStations = [];   // added (Sola) stations — declared early so applyLabels can include them
let extraSeq = 0;
/* ---- LINE FOCUS: view one line by itself — pick Meritage / Sola / Canyon
   Crew from the 👁 selector and every other line's tables, crew, carts, lanes,
   arrows and boxes disappear. 'all' shows the whole floor. ---- */
var lineFocus = 'all';
const LINE_KEYS = ['meritage', 'sola', 'canyon'];
function stLineOf(id) { const nd = nodes[id]; if (!nd) return 'meritage'; return nd.extra ? sectionOf(nd.x, nd.z) : 'meritage'; }
function focusShows(sec) { return (typeof lineFocus === 'undefined' || !lineFocus || lineFocus === 'all' || lineFocus === sec); }
function applyLineFocus() {
  [...ST.map(s2 => s2.id), ...extraStations].forEach(id => {
    const nd = nodes[id]; if (!nd) return;
    const v = focusShows(stLineOf(id));
    if (nd.st) nd.st.visible = v;
    if (nd.visual && nd.visual.g) nd.visual.g.visible = v && !(id === 'fa' && nd.visual.g.visible === false);
  });
  const m = focusShows('meritage'), so = focusShows('sola'), ca = focusShows('canyon');
  if (nodes.cart) nodes.cart.st.visible = m;
  if (nodes.cart2) nodes.cart2.st.visible = so;
  if (nodes.cart3) nodes.cart3.st.visible = ca;
  const ed = (typeof editing !== 'undefined') && editing;
  pathLine.visible = ed && m; wpGroup.visible = ed && m; returnLine.visible = ed && m; aisleMesh.visible = ed && aisleOn && m;
  wpGroup2.visible = ed && so; returnLine2.visible = ed && so; aisleMesh2.visible = ed && aisleOn && so; cart2Feed.visible = so;
  wpGroup3.visible = ed && ca; returnLine3.visible = ed && ca; aisleMesh3.visible = ed && aisleOn && ca; cart3Feed.visible = ca;
  refreshProdFlow(); refreshEnds(); applyLabels();
}
function applyLabels() {
  const all = [...ST.map(s => s.id), ...extraStations];   // Meritage + Sola (added) stations
  all.forEach(id => { const nd = nodes[id]; if (!nd) return; const fv = focusShows(stLineOf(id)); if (nd.label) nd.label.visible = labelMode === 2 && fv; if (nd.mini) nd.mini.visible = labelMode === 1 && fv; });
  if (typeof cartSign !== 'undefined' && cartSign) cartSign.visible = labelMode !== 0 && focusShows('meritage');
  const b = document.getElementById('labels'); if (b) b.textContent = 'Labels: ' + (labelMode === 0 ? 'Off' : labelMode === 1 ? 'Names' : 'Full');
}
document.getElementById('labels').onclick = () => { labelMode = (labelMode + 1) % 3; applyLabels(); };
applyLabels();

// ---- live per-line DATA: Meritage (left, via schedule) + Sola (right). Both
// lines are always shown; each panel shows that line's totals independently. ----
function renderSolaData() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const fill = (sec, pfx) => {   // Sola and Canyon Crew are separate lines — each its own KPI card
    const ids = extraStations.filter(id => sectionOf(nodes[id].x, nodes[id].z) === sec);
    let labor = 0, cyc = 0, bot = '—';
    ids.forEach(id => {
      const s = nodes[id].s, per = effNet(id);   // per-unit time AFTER any help arrows into this station
      labor += (s.t || 0) * prodF(sec);
      if (per > cyc) { cyc = per; bot = s.title; }
    });
    const cap = cyc > 0 ? dayMinSafe() / cyc : 0;
    set(pfx + 'Labor', labor.toFixed(1));
    set(pfx + 'Cyc', cyc > 0 ? cyc.toFixed(1).replace(/\.0$/, '') : '—');
    set(pfx + 'Cap', cap > 0 ? cap.toFixed(1) : '—');
    set(pfx + 'Bot', cyc > 0 ? `${bot} (${cyc.toFixed(1).replace(/\.0$/, '')})` : '— none yet —');
    set(pfx + 'Count', ids.length);
  };
  fill('sola', 'sola');
  fill('canyon', 'canyon');
  buildSolaSched();
}
// Sola flow-shop simulation (its own clock Ts): units flow through the Sola
// stations in FLOW-ARROW order (topological); falls back to left-to-right only
// if no flow lines are drawn. Each station = its per-operator time.
function orderedSola() {
  const ids = extraStations.filter(id => sideOf(nodes[id].x, nodes[id].z) === 'other');
  const byX = arr => arr.slice().sort((a, b) => nodes[a].x - nodes[b].x);
  const set = new Set(ids);
  const edges = flowArrows.filter(a => set.has(a.from) && set.has(a.to) && a.from !== a.to);
  if (!edges.length) return byX(ids);                        // no flow drawn → left to right
  const indeg = {}, adj = {}; ids.forEach(id => { indeg[id] = 0; adj[id] = []; });
  edges.forEach(e => { adj[e.from].push(e.to); indeg[e.to]++; });
  let q = byX(ids.filter(id => indeg[id] === 0));            // start at stations nothing feeds into
  const out = [], seen = new Set();
  while (q.length) {
    const n = q.shift(); if (seen.has(n)) continue; seen.add(n); out.push(n);
    adj[n].forEach(m => { if (--indeg[m] <= 0 && !seen.has(m)) q.push(m); });
    q = byX(q);
  }
  byX(ids).forEach(id => { if (!seen.has(id)) out.push(id); });   // any leftovers (cycles)
  return out;
}
// Split the added ('other') stations into INDEPENDENT flow lines — the connected
// components of the flow graph — so Sola and Canyon Crew each run and animate as
// their OWN line instead of one giant serial chain. Each component is returned in
// flow (topological) order; components are sorted left-to-right by their first
// station, so Sola comes before Canyon. Stale flow entries pointing at deleted
// stations (e.g. old c1..c4) are simply ignored — no layout mutation needed.
function solaComponents() {
  const ids = extraStations.filter(id => nodes[id] && sideOf(nodes[id].x, nodes[id].z) === 'other');
  if (!ids.length) return [];
  const set = new Set(ids);
  const byX = arr => arr.slice().sort((a, b) => nodes[a].x - nodes[b].x);
  const edges = flowArrows.filter(a => set.has(a.from) && set.has(a.to) && a.from !== a.to);
  const parent = {}; ids.forEach(id => parent[id] = id);
  const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  edges.forEach(e => { parent[find(e.from)] = find(e.to); });   // union-find: group by connectivity
  const groups = {}; ids.forEach(id => { const r = find(id); (groups[r] = groups[r] || []).push(id); });
  const topo = g => {                                           // order one group by its own flow arrows
    const gs = new Set(g), ge = edges.filter(e => gs.has(e.from) && gs.has(e.to));
    if (!ge.length) return byX(g);
    const indeg = {}, adj = {}; g.forEach(id => { indeg[id] = 0; adj[id] = []; });
    ge.forEach(e => { adj[e.from].push(e.to); indeg[e.to]++; });
    let q = byX(g.filter(id => indeg[id] === 0)); const out = [], seen = new Set();
    while (q.length) { const n = q.shift(); if (seen.has(n)) continue; seen.add(n); out.push(n); adj[n].forEach(m => { if (--indeg[m] <= 0 && !seen.has(m)) q.push(m); }); q = byX(q); }
    byX(g).forEach(id => { if (!seen.has(id)) out.push(id); });
    return out;
  };
  return Object.values(groups).map(topo).sort((A, B) => nodes[A[0]].x - nodes[B[0]].x);
}
function schedOne(ids) {   // classic flow-shop schedule for ONE independent line
  const time = ids.map(id => effNet(id));   // per-unit time, reduced by any help arrows pointing INTO this station
  const finish = ids.map(() => []);
  for (let u = 0; u < N; u++) for (let k = 0; k < ids.length; k++) {
    const pk = k > 0 ? finish[k - 1][u] : 0, pu = u > 0 ? finish[k][u - 1] : 0;
    finish[k][u] = Math.max(pk, pu) + time[k];
  }
  return { ids, time, finish, N };
}
function buildSolaSched() {
  solaScheds = solaComponents().map(schedOne);         // one schedule per independent added line
  solaSched = solaScheds[0] || null;                   // kept for any legacy reference
  solaHorizon = solaScheds.reduce((h, sc) => Math.max(h, sc.ids.length ? ((sc.finish[sc.ids.length - 1][N - 1] || 0) + 4) : 0), 0);
  buildSolaTravel();
  if (typeof refreshProdFlow === 'function') refreshProdFlow();   // furniture-flow lanes track each line's last station
}
// traveling parts between consecutive stations of each line + a ship pile at the end
const solaTravelGroup = new THREE.Group(); level2.add(solaTravelGroup);
let solaTravel = [];   // solaTravel[componentIndex][gapIndex] = pool of part meshes
function buildSolaTravel() {
  while (solaTravelGroup.children.length) solaTravelGroup.remove(solaTravelGroup.children[0]);
  solaTravel = solaScheds.map(sc => {
    const gaps = [];
    for (let k = 0; k < sc.ids.length - 1; k++) {
      const kind = nodes[sc.ids[k]] && nodes[sc.ids[k]].kind || 'connectors';
      const arr = [];
      for (let u = 0; u < MAX_UNITS; u++) { const p = buildSub(kind); p.scale.set(0.5, 0.5, 0.5); p.visible = false; solaTravelGroup.add(p); arr.push(p); }
      gaps.push(arr);
    }
    return gaps;
  });
}
// Sola's shipped boxes stack just south of the Meritage stack in the same storage slice
const solaShipBoxes = [];
for (let i = 0; i < 40; i++) {
  const b = makeShipBox(); b.visible = false;
  b.position.set(-7.9 + (i % 3) * 1.75, (Math.floor(i / 3) % 2) * 0.74, -0.4 + Math.floor(i / 6) * 1.15);
  level2.add(b); solaShipBoxes.push(b);
}

/* ---- BOX STORAGE zone: an editable, drawable rectangle that the shipped
   boxes stack inside. Drag its body to move it; drag the ◤ corner handle
   (bottom-right, shown in Edit Layout) to draw it bigger or smaller.
   Meritage boxes fill from its north end, Sola's from its south end. ---- */
let boxZone = { x: -6.15, z: -1.0, w: 5.0, d: 16.5 };        // centre x/z + width/depth (m)
let boxResizing = false;
const boxZoneG = new THREE.Group(); level2.add(boxZoneG);
let boxZoneHandle = null;
function refreshBoxZone() {
  // clamp onto the floor
  boxZone.w = Math.max(2.2, Math.min(FLOOR_W, boxZone.w)); boxZone.d = Math.max(1.4, Math.min(FLOOR_D, boxZone.d));
  boxZone.x = Math.max(FLOOR_X0 + boxZone.w / 2, Math.min(FLOOR_X1 - boxZone.w / 2, boxZone.x));
  boxZone.z = Math.max(FLOOR_Z0 + boxZone.d / 2, Math.min(FLOOR_Z1 - boxZone.d / 2, boxZone.z));
  while (boxZoneG.children.length) boxZoneG.remove(boxZoneG.children[0]);
  const { x, z, w, d } = boxZone;
  const pad = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), new THREE.MeshStandardMaterial({ color: 0x9aa4ae, transparent: true, opacity: 0.3, roughness: 0.9 }));
  pad.position.set(x, 0.03, z); boxZoneG.add(pad);
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, d)), new THREE.LineDashedMaterial({ color: 0x5a6672, dashSize: 0.4, gapSize: 0.25 }));
  edge.rotation.x = -Math.PI / 2; edge.position.set(x, 0.06, z); edge.computeLineDistances(); boxZoneG.add(edge);
  const c = document.createElement('canvas'); c.width = 512; c.height = 110; const g2 = c.getContext('2d');
  g2.font = '800 50px Arial'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
  g2.lineWidth = 10; g2.strokeStyle = 'rgba(255,255,255,0.85)'; g2.strokeText('BOX STORAGE', 256, 58);
  g2.fillStyle = '#37414c'; g2.fillText('BOX STORAGE', 256, 58);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 16; t.colorSpace = THREE.SRGBColorSpace;
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w * 0.9, 4.4), Math.min(w * 0.9, 4.4) * 110 / 512), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  lbl.rotation.x = -Math.PI / 2; lbl.position.set(x, 0.07, z); boxZoneG.add(lbl);
  boxZoneHandle = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.55), new THREE.MeshStandardMaterial({ color: 0xc0552c, roughness: 0.5 }));
  boxZoneHandle.position.set(x + w / 2, 0.08, z + d / 2); boxZoneHandle.visible = (typeof editing !== 'undefined') && editing;
  boxZoneG.add(boxZoneHandle);
  // re-stack the boxes inside the zone: Meritage from the north end, Sola from the south
  const colPitch = 1.9, rowPitch = 1.15;
  const cols = Math.max(1, Math.floor(w / colPitch)), rows = Math.max(1, Math.floor(d / rowPitch));
  const spots = cols * rows;
  const x0 = x - w / 2 + 0.95, zN = z - d / 2 + 0.62, zS = z + d / 2 - 0.62;
  shipBoxes.forEach((b, i) => { const s = i % spots, lvl = Math.min(3, Math.floor(i / spots)); b.position.set(x0 + (s % cols) * colPitch, lvl * 0.74, zN + Math.floor(s / cols) * rowPitch); });
  solaShipBoxes.forEach((b, i) => { const s = i % spots, lvl = Math.min(3, Math.floor(i / spots)); b.position.set(x0 + (s % cols) * colPitch, lvl * 0.74, zS - Math.floor(s / cols) * rowPitch); });
}
refreshBoxZone();
const SOLA_TRAVEL = 3;            // sim-min a part spends moving to the next station
function solaUpdate() {
  if (!solaScheds.length) { solaShipBoxes.forEach(b => b.visible = false); const el0 = document.getElementById('solaShip'); if (el0) el0.textContent = 0; return; }
  let shipped = 0; const shipSec = { sola: 0, canyon: 0 };
  solaScheds.forEach((sc, ci) => {                 // each independent added line (Sola, Canyon Crew, …) on the shared Ts clock
    const { ids, time, finish, N: sn } = sc; if (!ids.length) return;
    const sec = sectionOf(nodes[ids[0]].x, nodes[ids[0]].z);
    let done = 0; for (let u = 0; u < sn; u++) if (Ts >= finish[ids.length - 1][u]) done++;
    shipped += done; if (shipSec[sec] != null) shipSec[sec] += done;
    // each station: LED + WIP part growing while it works; operators bob while active
    ids.forEach((id, k) => {
      const nd = nodes[id]; if (!nd) return;
      let active = false, allDone = true, frac = 0;
      if (Ts > 0) for (let u = 0; u < sn; u++) { const f = finish[k][u], st = f - time[k]; if (Ts >= st && Ts < f) { active = true; frac = (Ts - st) / time[k]; } if (Ts < f) allDone = false; }
      setLed(nd.led, Ts <= 0 ? 'idle' : (active ? 'active' : (allDone ? 'done' : 'idle')), active);
      if (nd.visual) nd.visual.update(active ? frac : 0, 0, sn);
      // operators move like the Meritage crew: walk to the materials cart at the
      // start of each unit (parts fetch), walk to their help target during idle,
      // otherwise work at the bench with a gentle sway — all smooth-lerped.
      crew.forEach(c => {
        if (c.station !== id) return;
        let tx = c.homeX, tz = c.homeZ;
        // parts-fetch walk goes to that line's OWN materials cart: Sola → cart2,
        // Canyon Crew → cart3. Operators never trek across to another line's cart.
        const sec = sectionOf(nd.x, nd.z);
        const cartNode = sec === 'sola' ? nodes.cart2 : sec === 'canyon' ? nodes.cart3 : null;
        const fetching = active && frac < 0.14 && cartNode;
        if (fetching) { tx = cartNode.x + (c.idx - 0.5) * 1.1; tz = cartNode.z + 1.35; }
        else if (!active && !allDone && Ts > 0 && c.helpTo && (c.helpMin || 0) > 0 && nodes[c.helpTo]) { tx = nodes[c.helpTo].x + 0.7; tz = nodes[c.helpTo].z + 1.7; }
        c.fig.position.x += (tx - c.fig.position.x) * 0.08;
        c.fig.position.z += (tz - c.fig.position.z) * 0.08;
        c.fig.rotation.y = (active && !fetching) ? Math.sin(Ts * 3 + c.idx) * 0.2 : 0;
      });
    });
    // parts traveling station -> next station (within THIS line only — no cross-floor jumps)
    const pools = solaTravel[ci] || [];
    for (let k = 0; k < ids.length - 1; k++) {
      const pool = pools[k]; if (!pool) continue;
      const A = nodes[ids[k]], B = nodes[ids[k + 1]]; if (!A || !B) continue;
      for (let u = 0; u < sn; u++) {
        const part = pool[u]; if (!part) continue;
        const depart = finish[k][u], cons = finish[k + 1][u] - time[k + 1];
        if (Ts <= 0 || depart >= cons || Ts < depart || Ts >= cons) { part.visible = false; continue; }
        const arrive = Math.min(depart + SOLA_TRAVEL, cons);
        part.visible = focusShows(stLineOf(ids[k]));
        if (Ts < arrive) { const fr = (arrive > depart) ? (Ts - depart) / (arrive - depart) : 1; part.position.set(A.x + (B.x - A.x) * fr, 1.04 + Math.sin(fr * Math.PI) * 0.4, A.z + (B.z - A.z) * fr); }
        else part.position.set(B.x, 1.04, B.z);
      }
    }
  });
  solaShipBoxes.forEach(b => { if (b.visible) b.visible = false; });    // finished boxes travel the lane now instead of piling here
  gShipSola = shipSec.sola; gShipCanyon = shipSec.canyon;               // the spawner turns these into traveling boxes
  const el = document.getElementById('solaShip'); if (el) el.textContent = shipSec.sola;
  const elc = document.getElementById('canyonShip'); if (elc) elc.textContent = shipSec.canyon;
}

// build editable time rows
const timeBox = document.getElementById('times');
// walk-time controls
const moveCtl = document.createElement('div'); moveCtl.className = 'movectl';
moveCtl.innerHTML = `<label class="mck"><input type="checkbox" id="walkOn" checked/> add walk time (by distance)</label>
  <div class="mrow">Walk speed <input type="number" id="walkSpeed" value="60" min="10" step="5"/> yd/min</div>
  <div class="mrow">Trips / unit <input type="number" id="trips" value="1" min="0" step="0.5"/></div>
  <div class="mrow" style="color:#6b7785">Each cart = 1 sofa's materials</div>`;
timeBox.appendChild(moveCtl);
// ONE host, THREE sections (Meritage / Sola / Canyon Crew) — a station's
// section comes from which slice of the floor it sits in, so dragging a table
// across a blue line re-files it automatically.
const stepsHost = document.createElement('div'); stepsHost.id = 'stepsHost'; timeBox.appendChild(stepsHost);
const stepsHost2 = { innerHTML: '', querySelectorAll: () => [] };   // legacy shim — everything renders in stepsHost now
(() => {   // styling for the 3-section layout
  const st = document.createElement('style');
  st.textContent = `
  #times{width:272px}
  #times .secHdr{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:12px 0 6px;padding:7px 10px;border-radius:8px;color:#fff;font-weight:800;font-size:12px;letter-spacing:.05em}
  #times .secHdr .secTot{font-weight:600;font-size:10.5px;opacity:.9;text-align:right}
  #times .stblock{border:1px solid #e3e7ec;border-left-width:4px;border-radius:10px;padding:8px 9px;margin:7px 0;background:#fff}
  #times .sttitle{display:flex;align-items:center;gap:6px}
  #times .stnm{font-weight:800;font-size:12px;color:#15263a;flex:1;min-width:50px;border:1px solid transparent;background:transparent;border-radius:5px;padding:1px 4px}
  #times .stnm:hover{border-color:#d8dee6;background:#fff}
  #times .stnm:focus{border-color:#7ba6e0;background:#fff;outline:none}
  #times .sttitle .sttot{margin-left:auto}
  #times .sdelsta{background:#fff;border:1px solid #dcae9f;color:#c0552c;border-radius:6px;padding:2px 7px;font-size:11px;cursor:pointer;flex:none}
  #times .sdelsta:hover{background:#c0552c;color:#fff}
  #times .smv{flex:none;width:34px;border:1px solid #cfd6de;border-radius:6px;background:#fff;font-size:11px;color:#3c4a5a;padding:1px 0;cursor:pointer}
  #times .smv:hover{border-color:#1d3a66}
  #times .addInSec{display:block;width:100%;margin:6px 0 2px;background:#f2f6fb;border:1.5px dashed #9db4cf;color:#1d3a66;border-radius:8px;padding:7px;font-size:12px;font-weight:700;cursor:pointer}
  #times .addInSec:hover{background:#e3edf8}
  #times .secempty{font-size:11px;color:#8a93a0;margin:4px 2px}
  #times .stfoot{display:flex;align-items:center;gap:6px;font-size:11px;color:#33414f;margin-top:5px}
  #times .stfoot .sppl{width:38px}
  #times .strow .stime{width:52px}
  #times .sadd{margin-left:auto}
  #times .secProdRow{display:flex;gap:7px;align-items:center;margin:6px 0 2px;font-size:11.5px;color:#5a6672}
  #times .secProdRow .secProd{flex:1;padding:4px 6px;border:1px solid #c9d2dd;border-radius:6px;font-size:12px;font-weight:700;color:#15263a}
  #times .secProdNote{font-size:11px;color:#8a6d1f;background:#fdf6ef;border:1px solid #ecd9c4;border-radius:7px;padding:5px 8px;margin:4px 0}
  #times .secProdNote .mkSteps{border:1px dashed #c9a25f;background:#fff;border-radius:6px;padding:2px 7px;cursor:pointer;font-size:11px;margin-left:4px}
  /* ---- FULL-PAGE Edit-times: the panel becomes its own page, three line
     columns side by side, bigger inputs — much easier to work in ---- */
  #times.fullpage{position:fixed !important;left:0 !important;top:0 !important;right:0 !important;bottom:0 !important;width:auto !important;height:auto !important;max-width:none !important;max-height:none !important;transform:none !important;zoom:1 !important;z-index:80;overflow:auto;background:#eef1f5;border-radius:0;box-shadow:none;padding:16px 30px 40px}
  #times.fullpage > h3{max-width:1440px;margin:2px auto 4px;font-size:19px}
  #times.fullpage .movectl{max-width:1440px;margin:0 auto 12px;display:flex;gap:18px;align-items:center;flex-wrap:wrap}
  #times.fullpage #stepsHost{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:0 26px;align-items:start;max-width:1440px;margin:0 auto}
  #times.fullpage .secCol{min-width:0}
  #times.fullpage .secHdr{font-size:14px;padding:10px 12px}
  #times.fullpage .stnm{font-size:14px}
  #times.fullpage .strow .sname{font-size:13px;padding:4px 6px}
  #times.fullpage .strow .stime{width:64px;font-size:13px;padding:4px}
  #times.fullpage .stblock{padding:10px 12px}
  #times.fullpage .stfoot{font-size:12.5px}
  #times.fullpage .panelX{width:30px;height:30px;line-height:28px;font-size:15px;top:12px;right:16px;position:fixed}`;
  document.head.appendChild(st);
})();

/* ---- ADDED STATIONS: extra benches you can drop on either side and drag where
   you want. They are independent — NOT part of the Meritage line, so they never
   affect its schedule/labor/bottleneck (kept out of ST). Which table a station
   shows up in depends on which side of the middle line it sits on. ---- */
const DIVIDER_X = DECK.x1;                                   // the painted middle line (legacy reference)
// ---- line membership follows the DRAWN CAD section lines exactly. The CAD
// polylines jog (e.g. line 4 runs at x=17.87 below z=−2.59, then 17.60 above),
// so the boundary x depends on z. plX() reads the boundary straight from the
// measured SECTION_LINES data — the same 1:1 CAD geometry that's painted on
// the floor. Meritage/Sola boundary = CAD line 2; Sola/Canyon = CAD line 4. ----
function plX(pl, z) {
  const vs = [];
  for (let i = 0; i < pl.length - 1; i++) { const a = pl[i], b = pl[i + 1]; if (a[0] === b[0]) vs.push([a[0], Math.min(a[1], b[1]), Math.max(a[1], b[1])]); }
  for (const [x, z0, z1] of vs) if (z >= z0 && z <= z1) return x;
  return z < vs[0][1] ? vs[0][0] : vs[vs.length - 1][0];   // beyond the drawn extent → nearest end continues straight
}
const SOLA_BX = z => plX(SECTION_LINES[1], z);               // CAD section line 2 (x≈4.91 below z=0.99, 5.18 above)
const CANYON_BX = z => plX(SECTION_LINES[2], z);             // CAD section line 3 (jagged) — Canyon Crew's space is line 3 → line 4; the strip east of line 4 is staging but strays parked there still FILE as Canyon
// ---- imported floor plans: extra floors that live beside the mezzanine ----
let customFloors = [];       // [{id, name, x, z, w, d, walls:[[x1,z1,x2,z2],...]}] — positions/sizes in meters, x/z = floor origin corner (level2 coords)
function floorAt(x, z) { return customFloors.find(f => x >= f.x - 0.5 && x <= f.x + f.w + 0.5 && z >= f.z - 0.5 && z <= f.z + f.d + 0.5) || null; }
const sideOf = (x, z = 0) => (x < SOLA_BX(z) ? 'meritage' : 'other');
const CANYON_X = 17.6;                                       // legacy constant (kept for default placements)
const sectionOf = (x, z = 0) => { const f = floorAt(x, z); if (f) return f.id; return x < SOLA_BX(z) ? 'meritage' : x < CANYON_BX(z) ? 'sola' : 'canyon'; };   // stations on an imported floor belong to THAT floor, not the mezzanine lines
const STA_COLORS = ['#1d3a66','#9a3b1f','#236043','#8f5390','#a8923a','#3f8f8f','#9c4f45','#c0552c','#2f6df6','#7a5b1f'];
function addStation(name, x, z, id, t) {
  id = id || ('x' + (++extraSeq));
  const cSec = sectionOf(x, z);                              // Canyon Crew assembly tables are 6' x 3'; other added tables 8' x 4'
  const r = cSec === 'canyon' ? makeBench(6, 3) : makeBench(8, 4);
  r.st.position.set(x, 0, z); level2.add(r.st);
  const accent = STA_COLORS[extraStations.length % STA_COLORS.length];   // varied colour per added station (like Meritage)
  const label = makeStationLabel(name, 'Added station', t ? t + ' min' : '—', accent);
  label.position.set(x, 2.85, z); level2.add(label);
  const mini = makeMiniLabel(name, accent); mini.position.set(x, 2.55, z); level2.add(mini);
  setLed(r.led, 'idle', false);
  const kind = kindForPart(name);                            // part shape matches what this station makes (from the SWI name)
  const visual = makeFeederWIP(kind); visual.g.position.set(x, 1.04, z); level2.add(visual.g);   // a WIP part that grows as it works
  nodes[id] = { s: { id, title: name, sub: 'Added station', accent, steps: [{ name, t: t || 0 }], ppl: 1, t: t || 0 }, st: r.st, led: r.led, label, mini, visual, kind, x, z, rot: 0, extra: true, t: t || 0, benchFt: cSec === 'canyon' ? '6x3' : '8x4' };
  POS[id] = [x, z];
  extraStations.push(id);
  buildExtraCrew(id);                                         // show its operator figure(s)
  if (typeof applyLabels === 'function') applyLabels();       // follow the current Labels mode (Off / Names / Full)
  if (typeof cadOn !== 'undefined' && cadOn) rebuildMyMarks();   // include the new station in the teal markers
  applyLineAccent(id);                                        // label tinted with its line's color
  if (typeof applyLineFocus === 'function') applyLineFocus(); // respect an active line focus
  return id;
}
function buildExtraCrew(id) {                                 // operator figures for an added station (mirrors Meritage)
  for (let i = crew.length - 1; i >= 0; i--) { if (crew[i].station === id) { level2.remove(crew[i].fig); crew.splice(i, 1); } }
  const nd = nodes[id]; if (!nd) return; const s = nd.s, np = coverOf(id) ? 0 : Math.max(0, s.ppl || 0);
  const base = Math.max(0, extraStations.indexOf(id));
  for (let i = 0; i < np; i++) {
    const color = OP_COLORS[(base * 2 + i + 3) % OP_COLORS.length];
    const fig = makeCrewFigure(color, s.title.split(' ')[0] + (np > 1 ? ' ' + (i + 1) : ''));
    const depFt = nd.benchFt === '6x3' ? 3 : 4;
    const spread = 1.1, bdx = (np > 1 ? (i - (np - 1) / 2) * 2 * spread : 0), bdz = (depFt * FT) / 2 + 0.6;   // stand on the anti-fatigue mat
    fig.position.set(nd.x + bdx, 0, nd.z + bdz); level2.add(fig);
    crew.push({ fig, station: id, bdx, bdz, homeX: nd.x + bdx, homeZ: nd.z + bdz, idx: i });
  }
}
const getAny = id => ST.find(s => s.id === id) || (nodes[id] && nodes[id].s) || null;
const isExtra = id => !!(nodes[id] && nodes[id].extra);
// an added table's label is tinted with its LINE's color, so membership is
// visible on the floor itself (navy = Meritage, green = Sola, brown = Canyon)
const SEC_LABEL_COL = { meritage: '#1d3a66', sola: '#236043', canyon: '#9a5b1f' };
function applyLineAccent(id) {
  const nd = nodes[id]; if (!nd || !nd.extra) return;
  const sec = sectionOf(nd.x, nd.z);
  // Canyon Crew assembly tables are 6' x 3'; other lines' added tables are 8' x 4'.
  // A table that changes lines (Shift-drag) swaps to the right bench.
  const want = sec === 'canyon' ? '6x3' : '8x4';
  if (nd.benchFt !== want) {
    const wasVisible = nd.st.visible;
    level2.remove(nd.st);
    const r = want === '6x3' ? makeBench(6, 3) : makeBench(8, 4);
    r.st.position.set(nd.x, 0, nd.z); r.st.rotation.y = nd.rot || 0; r.st.visible = wasVisible;
    level2.add(r.st); nd.st = r.st; nd.led = r.led; setLed(nd.led, 'idle', false);
    nd.benchFt = want;
    buildExtraCrew(id);                                        // crew re-seats at the new bench depth
  }
  const c = SEC_LABEL_COL[sec] || '#1d3a66';
  if (nd.s.accent !== c) { nd.s.accent = c; setStationTitle(id, nd.s.title); }   // full label rebuild so the pill recolors
}
function recalcAny(id) {
  const s = getAny(id); if (!s) return;
  if (s.steps) s.t = s.steps.reduce((a, st) => a + (parseFloat(st.t) || 0), 0);
  if (isExtra(id)) { nodes[id].t = s.t; const nd = nodes[id]; if (nd.label && nd.label.userData.redraw) nd.label.userData.redraw(s.t ? +s.t.toFixed(2) + ' min' : '—', s.accent); }
}

// every other station on the same line — the targets a step can move to
function moveTargets(id) {
  const line = stLineOf(id);
  const ids = lineStationIds(line).slice();
  if (line === 'meritage' && typeof extraStations !== 'undefined') extraStations.forEach(x => { if (nodes[x] && sectionOf(nodes[x].x, nodes[x].z) === 'meritage') ids.push(x); });
  return ids.filter(x => x !== id).map(x => getAny(x)).filter(Boolean);
}
function rowsHtml(list, accent, fac) {
  fac = fac || 1;   // active product's factor (1 for base/own-steps; scales factor products)
  let html = '';
  list.forEach(s => {
    const tgt = moveTargets(s.id);
    const smv = tgt.length ? `<select class="smv" data-id="${s.id}" title="Move this step to another station on this line"><option value="">⇄</option>${tgt.map(t => `<option value="${t.id}">→ ${(t.title || t.id).replace(/</g, '&lt;')}</option>`).join('')}</select>` : '';
    const ppl = Math.max(1, s.ppl || 1), st_t = (s.t || 0) * fac, cyc = (st_t / ppl);
    const canRemove = nodes[s.id] && nodes[s.id].extra;
    html += `<div class="stblock" style="border-left-color:${accent || '#1d3a66'}">
      <div class="sttitle"><input class="stnm" data-id="${s.id}" value="${(s.title || '').replace(/"/g, '&quot;')}" title="Station name — click to rename"/>${s.bot ? ' <b style="color:#c0552c">◄</b>' : ''}
        <span class="sttot">${cyc.toFixed(1).replace(/\.0$/, '')} min/unit</span><span class="tw" id="walk_${s.id}"></span>
        ${canRemove ? `<button class="sdelsta" data-id="${s.id}" title="Remove this station (its table disappears from the floor)">🗑 remove</button>` : ''}</div>`;
    (s.steps || []).forEach((st, si) => {
      html += `<div class="strow">
        <input class="sname" data-id="${s.id}" data-si="${si}" value="${(st.name || '').replace(/"/g, '&quot;')}" title="Step name — click to edit"/>
        <input class="stime" type="number" step="0.25" min="0" data-id="${s.id}" data-si="${si}" value="${+((+st.t || 0) * fac).toFixed(2)}" title="Minutes for this step"/>
        <span class="su">min</span>
        ${smv ? smv.replace('class="smv"', `class="smv" data-si="${si}"`) : ''}
        <button class="sdel" data-id="${s.id}" data-si="${si}" title="Delete this step">✕</button></div>`;
    });
    // crew control: own operators, or "covered by" another station's crew (admin-controlled)
    const covTargets = moveTargets(s.id);
    const cov = (typeof coverOf === 'function') ? coverOf(s.id) : null;
    const covSel = covTargets.length
      ? `<select class="scov" data-id="${s.id}" title="Does this station have its own operators, or is its work done by another station's crew?"><option value="">own crew</option>${covTargets.map(t => `<option value="${t.id}"${cov === t.id ? ' selected' : ''}>covered by ${(t.title || t.id).replace(/</g, '&lt;')}</option>`).join('')}</select>`
      : '';
    if (cov) {
      const covName = ((getAny(cov) || {}).title || cov).replace(/</g, '&lt;');
      html += `<div class="stfoot">${covSel}<span>done by <b>${covName}</b>'s crew · adds <b>${cyc.toFixed(1)} min/unit</b> to them</span>
        <button class="sadd" data-id="${s.id}" title="Add a step to this station">+ step</button></div>`;
    } else {
      html += `<div class="stfoot">👤<input class="sppl" type="number" min="1" max="6" step="1" data-id="${s.id}" value="${ppl}" title="People working at this station"/>
        <span>people → ${st_t.toFixed(0)} ÷ ${ppl} = <b>${cyc.toFixed(1)} min/unit</b></span>${covSel}
        <button class="sadd" data-id="${s.id}" title="Add a step to this station">+ step</button></div>`;
    }
    html += `</div>`;
  });
  return html;
}
// rename a station everywhere: data, the floating 3D labels, crew name tags,
// and the chart-name map. Light version (no re-render/save) used at load.
function setStationTitle(id, name) {
  const s = getAny(id), nd = nodes[id]; if (!s || !nd || !name) return;
  s.title = name;
  if (typeof FEEDNAME !== 'undefined' && FEEDNAME[id]) FEEDNAME[id] = name;
  if (nd.label) level2.remove(nd.label);
  if (nd.mini) level2.remove(nd.mini);
  const tStr = s.t ? +s.t.toFixed(2) + ' min' : '—';
  nd.label = makeStationLabel(name, s.sub || '', tStr, s.accent); nd.label.position.set(nd.x, 2.85, nd.z); level2.add(nd.label);
  nd.mini = makeMiniLabel(name, s.accent); nd.mini.position.set(nd.x, 2.55, nd.z); level2.add(nd.mini);
  if (isExtra(id)) buildExtraCrew(id); else { rebuildCrew(id); placeStation(id); }
  if (typeof applyLabels === 'function') applyLabels();
}
function renameStation(id, name) {
  name = (name || '').trim();
  if (!name) { renderTimes(); return; }                       // empty → just restore the field
  setStationTitle(id, name);
  renderTimes(); saveLayout();
  try { renderIdle(); renderHelpPanel(); renderTaskChart(); } catch (e) {}
}
function deleteStation(id) {                                  // remove an ADDED station (core Meritage stations stay)
  const nd = nodes[id]; if (!nd || !nd.extra) return;
  for (let i = crew.length - 1; i >= 0; i--) { if (crew[i].station === id) { level2.remove(crew[i].fig); crew.splice(i, 1); } }
  [nd.st, nd.label, nd.mini, nd.visual && nd.visual.g].forEach(o => { if (o) level2.remove(o); });
  const i = extraStations.indexOf(id); if (i >= 0) extraStations.splice(i, 1);
  delete nodes[id]; delete POS[id];
  renderTimes(); saveLayout();
  if (typeof cadOn !== 'undefined' && cadOn) rebuildMyMarks();
}
function afterEdit(id) {                                     // ST stations re-pace the line; added stations don't
  if (isExtra(id)) { renderTimes(); saveLayout(); }
  else { renderTimes(); schedule(); T = 0; setPlay(false); saveLayout(); }
}
// ---- full Sola-side (added stations + flow) save / restore. Used by BOTH the
// working layout AND named layouts so a saved/baked layout carries the Sola line
// (positions, per-station steps, people, rotation, and the flow arrows). ----
function extraSnap() {
  return extraStations.map(id => { const n = nodes[id]; return { id, name: n.s.title, x: n.x, z: n.z, t: n.t || 0, rot: n.rot || 0, ppl: n.s.ppl || 1, cover: n.s.cover || '', steps: (n.s.steps || []).map(st => [st.name, st.t]) }; });
}
function clearExtras() {
  [...extraStations].forEach(id => {
    const nd = nodes[id]; if (!nd) return;
    for (let i = crew.length - 1; i >= 0; i--) { if (crew[i].station === id) { level2.remove(crew[i].fig); crew.splice(i, 1); } }
    [nd.st, nd.label, nd.mini, nd.visual && nd.visual.g].forEach(o => { if (o) level2.remove(o); });
    delete nodes[id]; delete POS[id];
  });
  extraStations.length = 0;
}
function restoreExtras(list) {
  if (!Array.isArray(list)) return;
  list.forEach(e => {
    if (nodes[e.id]) return;
    addStation(e.name, e.x, e.z, e.id, e.t);
    const num = parseInt(String(e.id).replace(/\D/g, '')) || 0; if (num > extraSeq) extraSeq = num;
    const nd = nodes[e.id]; if (!nd) return;
    if (Array.isArray(e.steps) && e.steps.length) { nd.s.steps = e.steps.map(a => ({ name: a[0], t: +a[1] || 0 })); recalcAny(e.id); }
    if (e.ppl && e.ppl !== 1) { nd.s.ppl = e.ppl; buildExtraCrew(e.id); }
    if (e.cover) { nd.s.cover = e.cover; buildExtraCrew(e.id); }
    if (e.rot) setStationRot(e.id, e.rot);
  });
}
function restoreFlow(list) {
  flowArrows = Array.isArray(list) ? list.map(a => ({ from: a[0], to: a[1] })) : [];
  buildFlow(); if (typeof buildSolaSched === 'function') buildSolaSched();
}
function wireRows(host) {
  host.querySelectorAll('input.stnm').forEach(inp => inp.onchange = e => renameStation(e.target.dataset.id, e.target.value));
  host.querySelectorAll('input.sppl').forEach(inp => inp.onchange = e => {
    const id = e.target.dataset.id, s = getAny(id); s.ppl = Math.max(1, parseInt(e.target.value) || 1);
    if (isExtra(id)) buildExtraCrew(id); else { rebuildCrew(id); placeStation(id); }
    afterEdit(id);
  });
  host.querySelectorAll('select.scov').forEach(sel => sel.onchange = e => {   // admin: assign/clear which crew covers this station
    const id = e.target.dataset.id, s = getAny(id); if (!s) return;
    const val = e.target.value || null;
    s.cover = (val && val !== id) ? val : null;
    if (isExtra(id)) buildExtraCrew(id); else { rebuildCrew(id); placeStation(id); }
    renderTimes();
    schedule(); if (typeof buildSolaSched === 'function') buildSolaSched();
    try { renderIdle(); renderHelpPanel(); renderTaskChart(); } catch (_) {}
    T = 0; if (typeof setPlay === 'function') setPlay(false);
    saveLayout();
  });
  host.querySelectorAll('input.sname').forEach(inp => inp.onchange = e => {
    getAny(e.target.dataset.id).steps[+e.target.dataset.si].name = e.target.value; saveLayout();
  });
  host.querySelectorAll('input.stime').forEach(inp => inp.onchange = e => {
    const id = e.target.dataset.id, fac = (typeof prodF === 'function') ? prodF(stLineOf(id)) : 1;
    getAny(id).steps[+e.target.dataset.si].t = (parseFloat(e.target.value) || 0) / (fac || 1);   // store the BASE value; display was scaled by the product
    recalcAny(id); afterEdit(id);
  });
  host.querySelectorAll('button.sadd').forEach(b => b.onclick = e => {
    const id = e.target.dataset.id; getAny(id).steps.push({ name: 'New step', t: 0 }); recalcAny(id); renderTimes(); saveLayout();
  });
  host.querySelectorAll('button.sdel').forEach(b => b.onclick = e => {
    const id = e.target.dataset.id, s = getAny(id); s.steps.splice(+e.target.dataset.si, 1); if (!s.steps.length) s.steps.push({ name: s.sub || 'Step', t: 0 });
    recalcAny(id); afterEdit(id);
  });
  host.querySelectorAll('select.smv').forEach(sel => sel.onchange = e => {
    const src = e.target.dataset.id, si = +e.target.dataset.si, dst = e.target.value;
    if (!dst) return;
    const ss = getAny(src), ds = getAny(dst); if (!ss || !ds || !ss.steps || !ss.steps[si]) { renderTimes(); return; }
    const st = ss.steps.splice(si, 1)[0];                       // move the step, minutes and all
    if (!ss.steps.length) ss.steps.push({ name: ss.sub || 'Step', t: 0 });
    (ds.steps = ds.steps || []).push(st);
    recalcAny(src); recalcAny(dst);
    if (isExtra(src) && isExtra(dst)) { renderTimes(); saveLayout(); }
    else { renderTimes(); schedule(); T = 0; setPlay(false); saveLayout(); }   // a core Meritage station changed → re-pace
    try { renderIdle(); renderHelpPanel(); renderTaskChart(); } catch (e2) {}
  });
  host.querySelectorAll('button.sdelsta').forEach(b => b.onclick = e => {
    const id = e.target.dataset.id, nd = nodes[id];
    if (nd && confirm(`Remove station “${nd.s.title}”?`)) deleteStation(id);
  });
}
// where a new station lands for each section (open floor in that slice, staggered)
function addStationInSection(sec) {
  const name = (prompt('New station name:', 'New station') || '').trim(); if (!name) return;
  const n = extraStations.filter(id => sectionOf(nodes[id].x, nodes[id].z) === sec).length;
  const x = sec === 'meritage' ? 1.5 : sec === 'sola' ? 8.5 : 15.0;   // drop in the middle of each line's CAD space
  const z = Math.min(8.5, -7 + n * 2.5);
  addStation(name, x, z);
  if (!editing) setEditing(true);                             // straight into edit mode so it can be dragged into place
  renderTimes(); saveLayout();
}
function renderTimes() {
  const SECTIONS = [
    { key: 'meritage', label: 'MERITAGE',    color: '#1d3a66', list: [...ST, ...extraStations.filter(id => sectionOf(nodes[id].x, nodes[id].z) === 'meritage').map(id => nodes[id].s)] },
    { key: 'sola',     label: 'SOLA',        color: '#236043', list: extraStations.filter(id => sectionOf(nodes[id].x, nodes[id].z) === 'sola').map(id => nodes[id].s) },
    { key: 'canyon',   label: 'CANYON CREW', color: '#9a5b1f', list: extraStations.filter(id => sectionOf(nodes[id].x, nodes[id].z) === 'canyon').map(id => nodes[id].s) },
  ];
  let html = '';
  SECTIONS.forEach(sec => {
    const secFac = (typeof prodF === 'function') ? prodF(sec.key) : 1;
    const tot = sec.list.reduce((a, s) => a + (s.t || 0) * secFac, 0);
    const lp = (typeof lineProducts !== 'undefined' && lineProducts) ? lineProducts[sec.key] : null;
    const ap = lp ? lp.list[lp.active] : null;
    html += `<div class="secCol">`;
    html += `<div class="secHdr" style="background:${sec.color}"><span>${sec.label}</span><span class="secTot">${sec.list.length} station${sec.list.length === 1 ? '' : 's'} · ${tot.toFixed(1).replace(/\.0$/, '')} min</span></div>`;
    if (lp) {
      // pick which PRODUCT's steps you're looking at / editing
      html += `<div class="secProdRow"><span>Editing:</span><select class="secProd" data-line="${sec.key}">` +
        lp.list.map((q, i) => `<option value="${i}"${i === lp.active ? ' selected' : ''}>${(q.name || '').replace(/</g, '&lt;')}</option>`).join('') +
        `<option value="__add">＋ Add product…</option></select></div>`;
      if (ap && !ap.stations && lp.active > 0) {   // the base product IS the base steps — no note needed
        html += `<div class="secProdNote">Scales the base steps ×<input class="prFac" data-line="${sec.key}" type="number" min="5" step="1" value="${Math.round((ap.f || 1) * 100)}" style="width:46px;padding:1px 3px;border:1px solid #c9a25f;border-radius:4px"/>% — the steps below are the BASE product's. <button class="mkSteps" data-line="${sec.key}">✎ give it its own steps</button></div>`;
      }
    }
    html += sec.list.length ? rowsHtml(sec.list, sec.color, secFac)
      : `<div class="secempty">No ${sec.label.toLowerCase()} stations yet — add one below, or drag a table into this part of the floor.</div>`;
    html += `<button class="addInSec" data-sec="${sec.key}">＋ Add station to ${sec.label}</button>`;
    html += `</div>`;
  });
  stepsHost.innerHTML = html;
  wireRows(stepsHost);
  stepsHost.querySelectorAll('.addInSec').forEach(b => b.onclick = () => addStationInSection(b.dataset.sec));
  stepsHost.querySelectorAll('.secProd').forEach(el => el.onchange = e => {
    const ln = e.target.dataset.line;
    if (e.target.value === '__add') {                        // add a product to this line
      const nm = prompt('Product name for this line:');
      if (!nm) { e.target.value = String(lineProducts[ln].active); return; }
      const pc = parseFloat(prompt('Labor vs the base times, in % (100 = same):', '100')) || 100;
      lineProducts[ln].list.push({ name: nm.trim(), f: Math.max(0.05, pc / 100) });
      lineProducts[ln].active = lineProducts[ln].list.length - 1;
    } else {
      lineProducts[ln].active = +e.target.value;
    }
    activateProductSteps(ln); reflowAll();
  });
  stepsHost.querySelectorAll('.prFac').forEach(el => el.onchange = e => {
    const p = activeProduct(e.target.dataset.line);
    if (p && !p.stations) { p.f = Math.max(0.05, (+e.target.value || 100) / 100); reflowAll(); }
  });
  stepsHost.querySelectorAll('.mkSteps').forEach(el => el.onclick = e => {
    const ln = e.target.dataset.line, p = activeProduct(ln); if (!p || p.stations) return;
    const fct = Math.max(0.05, +p.f || 1);
    p.stations = {};
    lineStationIds(ln).forEach(id => { const s2 = getAny(id); if (s2) p.stations[id] = (s2.steps || []).map(st => [st.name, +((+st.t || 0) * fct).toFixed(2)]); });
    delete p.f;                                              // it owns absolute steps now
    activateProductSteps(ln); reflowAll();
  });
  if (typeof renderSolaData === 'function') renderSolaData();
}
renderTimes();

document.getElementById('walkOn').onchange = e => { walkOn = e.target.checked; schedule(); T = 0; setPlay(false); };
document.getElementById('walkSpeed').onchange = e => { walkSpeed = Math.max(10, parseFloat(e.target.value) || 60); schedule(); T = 0; setPlay(false); };
document.getElementById('trips').onchange = e => { tripsPerUnit = Math.max(0, parseFloat(e.target.value) || 0); schedule(); T = 0; setPlay(false); };

// ---- idle-time-per-operator chart (full day) ----
let dayMin = 420;   // AVAILABLE minutes per worker per day (drives takt + capacity everywhere)
// each line can run different furniture: name + labor factor vs the base times
let lineProducts = {
  _v: 5,   // version stamp — bumping it makes these defaults replace older saved product lists
  // A product may carry its own per-station STEPS ("stations": {stationId: [[name, min], ...]}).
  // Picking it swaps that line's Edit-times steps (the base steps are stashed and restored
  // untouched). Products without steps fall back to a labor factor "f" on the base times.
  meritage: { active: 0, list: [
    { name: 'Meritage 3-Seater', f: 1 },                                   // BASE — the live Edit-times steps
    { name: 'Meritage 2-Seater', f: 0.89 },                                // MEASURED ratio: 20:30 vs 23:00
    { name: 'Meritage Chair', stations: {                                  // MEASURED: swivel SWI minus swivel work + leg assembly 8 + leg install 18 (10 during frame assembly + 8 leg finishing) = 203.46 min
      con: [['Connector prep — 16 connectors', 11]],
      tre: [['Trellis support assembly', 10]],
      sea: [['Seat frame + connectors', 31]],
      bak: [['Backrest and arms frame', 90]],
      arm: [['Leg assembly', 8]],
      fa:  [['Join arms + trellis support', 24], ['Leg install — during frame assembly', 10], ['Leg finishing', 8]],
      pak: [['Box bottom + strap', 4.66], ['Cushions, wrap, top box', 6.8]],
    } },
    { name: 'Meritage Swivel Chair', stations: {                           // MEASURED: swivel SWI 2026-07 — 215.46 min total (sheet header 204 excludes packing)
      con: [['Connector prep — 16 connectors', 11]],
      tre: [['Trellis support assembly', 10]],
      sea: [['Seat frame + connectors', 31]],
      bak: [['Backrest and arms frame', 90]],
      arm: [['Wheel base: bearings + attach', 20], ['Loctite + floor pegs', 2], ['Swivel plate extrusion', 2], ['Drill + chamfered disc + plate', 3], ['Washers + spin check', 2.5]],
      fa:  [['Join arms + trellis support', 24], ['Attach swivel assembly', 8.5]],
      pak: [['Box bottom + strap', 4.66], ['Cushions, wrap, top box', 6.8]],
    } },
  ] },
  sola:     { active: 0, list: [{ name: 'Sola Lounge — no arms', f: 1 }, { name: 'Sola Lounge — 1 arm', f: 1.01 }, { name: 'Sola Lounge — both arms', f: 1.065 }, { name: 'Sola — middle leg', f: 1.02 }] },   // MEASURED (no-arms middle-leg SWI): middle leg adds only the 3:20 Middle Leg Sub-Assembly step → 172.0/168.7 ≈ 102%. 1-arm/both-arms: each arm adds +3.5 (conn-plate) +2.0 (frame); both = base + 2x = ~179.7 ≈ 106.5%
  canyon:   { active: 0, list: [{ name: 'Canyon Chair', f: 1 }] },
};
let baseSteps = {};   // lineKey -> {stationId: steps snapshot} while a steps-product is active (persisted as __baseSteps)
// merge a SAVED product list with the code defaults: keep everything the user
// has (edits, own-steps), and APPEND any default product they don't have yet
// (matched by name) — so new products like 'both arms' reach existing layouts
// without wiping edited ones.
const DEFAULT_PRODUCTS = JSON.parse(JSON.stringify(lineProducts));
function mergeProducts(saved) {
  if (!saved || !saved.meritage) return;
  ['meritage', 'sola', 'canyon'].forEach(line => {
    if (!saved[line]) { saved[line] = JSON.parse(JSON.stringify(DEFAULT_PRODUCTS[line])); return; }
    const byName = new Map(DEFAULT_PRODUCTS[line].list.map(p => [p.name, p]));
    saved[line].list.forEach(p => {
      // keep your own-steps products untouched; refresh estimate FACTORS from the
      // latest measured defaults so switching sizes actually changes the numbers
      const dp = byName.get(p.name);
      if (dp && !p.stations && !dp.stations && typeof dp.f === 'number') p.f = dp.f;
    });
    // retire the guessed Canyon Ottoman (kept only if the user gave it real steps)
    saved[line].list = saved[line].list.filter(p => !(p.name === 'Canyon Ottoman' && !p.stations));
    if (saved[line].active >= saved[line].list.length) saved[line].active = 0;
    const have = new Set(saved[line].list.map(p => p.name));
    DEFAULT_PRODUCTS[line].list.forEach(dp => { if (!have.has(dp.name)) saved[line].list.push(JSON.parse(JSON.stringify(dp))); });
  });
  saved._v = DEFAULT_PRODUCTS._v;
  lineProducts = saved;
}
function lineStationIds(line) { if (typeof ST === 'undefined' || typeof extraStations === 'undefined') return []; return line === 'meritage' ? ST.map(s2 => s2.id) : extraStations.filter(id => nodes[id] && sectionOf(nodes[id].x, nodes[id].z) === line); }
function activeProduct(line) { if (typeof lineProducts === 'undefined' || !lineProducts) return null; const lp = lineProducts[line]; return lp ? lp.list[lp.active] : null; }
// swap a line's live steps to the active product's step set (or restore the base)
function activateProductSteps(line) {
  const p = activeProduct(line), ids = lineStationIds(line);
  if (p && p.stations) {
    if (!baseSteps[line]) { baseSteps[line] = {}; ids.forEach(id => { const s2 = getAny(id); if (s2) baseSteps[line][id] = JSON.parse(JSON.stringify(s2.steps || [])); }); }
    ids.forEach(id => { const s2 = getAny(id); if (!s2) return; s2.steps = (p.stations[id] || []).map(a => ({ name: a[0], t: +a[1] || 0 })); });
  } else if (baseSteps[line]) {
    ids.forEach(id => { const s2 = getAny(id); if (s2 && baseSteps[line][id]) s2.steps = baseSteps[line][id].map(x => ({ name: x.name, t: x.t })); });
    delete baseSteps[line];
  }
  ids.forEach(id => { const s2 = getAny(id); if (!s2) return; s2.t = (s2.steps || []).reduce((a, st) => a + (+st.t || 0), 0); if (typeof recalcAny === 'function') recalcAny(id); });
  renderTimes();
}
// while a steps-product is active, Edit-times edits belong to THAT product — sync them back on save
function syncProductSteps() {
  if (typeof lineProducts === 'undefined' || !lineProducts || typeof ST === 'undefined') return;
  ['meritage', 'sola', 'canyon'].forEach(line => {
    const p = activeProduct(line);
    if (!p || !p.stations) return;
    lineStationIds(line).forEach(id => { const s2 = getAny(id); if (s2) p.stations[id] = (s2.steps || []).map(st => [st.name, +st.t || 0]); });
  });
}
function reflowAll() {   // one call after any product / available-time change
  try { buildHelp(); } catch (e) {}   // help paths are product-specific — re-resolve which arrows apply
  schedule(); if (typeof buildSolaSched === 'function') buildSolaSched();
  if (typeof renderSolaData === 'function') renderSolaData();
  try { renderIdle(); renderHelpPanel(); renderTaskChart(); } catch (e) {}
  if (typeof refreshRunSelectors === 'function') refreshRunSelectors();
  saveLayout();
}
/* ---- "Running:" product selector INSIDE each line's HUD card — pick what
   each line builds right where you press Play. Stays in sync with the 🛋
   Products panel and the Edit-times pickers (one active product per line). ---- */
function refreshRunSelectors() {
  if (typeof lineProducts === 'undefined' || !lineProducts || !document.querySelector('.readouts')) return;
  if (!document.getElementById('runProdCss')) {
    const st = document.createElement('style'); st.id = 'runProdCss';
    st.textContent = '.runProdChip{background:rgba(255,255,255,.93);border:1px solid #dfe3e8;border-radius:10px;padding:3px 8px;display:flex;flex-direction:column;justify-content:center;box-shadow:0 1px 4px rgba(20,30,45,.08)}.runProdChip .k{font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:#5a6672}.runProd{border:none;background:transparent;font-weight:800;font-size:12px;color:#15263a;max-width:180px;padding:0;cursor:pointer}.runProd:focus{outline:none}';
    document.head.appendChild(st);
  }
  const map = { 'MERITAGE': 'meritage', 'SOLA': 'sola', 'CANYON CREW': 'canyon' };
  document.querySelectorAll('.readouts .rdttl').forEach(t => {
    const key = map[(t.textContent || '').trim()]; if (!key) return;
    let chip = t.parentNode.querySelector('.runProdChip');
    if (!chip) {
      chip = document.createElement('div'); chip.className = 'rd runProdChip';
      chip.innerHTML = '<div class="k">Running</div><select class="runProd" title="What this line builds when you press Play"></select>';
      t.parentNode.insertBefore(chip, t.nextSibling);
      chip.querySelector('.runProd').onchange = e => { lineProducts[key].active = +e.target.value; activateProductSteps(key); reflowAll(); };
    }
    const sel = chip.querySelector('.runProd'), lp = lineProducts[key];
    const want = lp.list.map((p, i) => `<option value="${i}"${i === lp.active ? ' selected' : ''}>${(p.name || '').replace(/</g, '&lt;')}</option>`).join('');
    if (sel.innerHTML !== want) sel.innerHTML = want; else sel.value = String(lp.active);
  });
}
let taktDemand = 10;   // units/day target for the takt line
let chartLine = 'meritage';   // which line the Idle / Task / Help panels show
function lineSel() {
  return `<select class="lineSel" style="font-size:11px;padding:2px 4px;margin:0 0 7px">
    <option value="meritage"${chartLine === 'meritage' ? ' selected' : ''}>Meritage</option>
    <option value="sola"${chartLine === 'sola' ? ' selected' : ''}>Sola</option>
    <option value="canyon"${chartLine === 'canyon' ? ' selected' : ''}>Canyon Crew</option></select>`;
}
function wireLineSel(panel) {
  const s = panel.querySelector('.lineSel');
  if (s) s.onchange = e => { chartLine = e.target.value; renderIdle(); renderHelpPanel(); renderTaskChart(); };
}
const idlePanel = document.getElementById('idlePanel');
const FEEDNAME = { con:'Connectors', arm:'Arms', bak:'Back frame', tre:'Trellis', sea:'Seat frame' };
// ordered station ids for ONE added line, by floor section ('sola' | 'canyon'),
// in true flow order (reuses the sim's independent-line ordering).
function orderedLine(sec) {
  return solaComponents().flat().filter(id => nodes[id] && sectionOf(nodes[id].x, nodes[id].z) === sec);
}
function operatorsList(line) {
  const list = [];
  if (line !== 'meritage') {   // Sola or Canyon Crew — its own set of added stations
    const ord = orderedLine(line);
    ord.forEach(id => {
      if (coverOf(id)) return;                                   // covered station: no operators of its own
      const s = nodes[id].s, ppl = Math.max(1, s.ppl || 1);
      const covered = ord.filter(x => coverOf(x) === id).reduce((a, x) => a + (nodes[x].s.t || 0) / Math.max(1, nodes[x].s.ppl || 1), 0);
      const per = (s.t || 0) / ppl + covered;                    // own cycle + any station this crew covers
      for (let i = 0; i < ppl; i++) list.push({ name: s.title + (ppl > 1 ? ' ' + (i + 1) : ''), bpu: per });
    });
    return list;
  }
  for (const id of ['con','arm','bak','tre','sea','fa','pak']) {
    if (!isPrimary(id)) continue;                   // covered stations have no operators of their own
    const s = get(id), base = opLoad(id);           // own per-unit time + any station this crew covers (e.g. FA + Cushions/Pack)
    const nm = FEEDNAME[id] || s.title;
    const ppl = Math.max(0, s.ppl || 0);
    for (let i = 0; i < ppl; i++) {
      list.push({ name: nm + (ppl > 1 ? ' ' + (i+1) : ''), bpu: base + helpFromOp(id, i) });   // each operator's own help time adds to their busy
    }
  }
  return list;
}
function renderIdle() {
  if (!idlePanel || idlePanel.style.display === 'none') return;
  const ops = operatorsList(chartLine);
  if (!ops.length) { idlePanel.innerHTML = `<h3>Idle time per operator</h3>` + lineSel() + '<div class="ihint">No right-side stations yet.</div>'; wireLineSel(idlePanel); return; }
  const cyc = Math.max(0.001, ...ops.map(o => o.bpu));     // line paces at the busiest operator
  const units = dayMin / cyc;
  let html = `<h3>Idle time per operator — ${(dayMin/60).toFixed(1)}-hr day</h3>` + lineSel();
  html += `<div class="ihint">~${units.toFixed(1)} units/day · day length <input type="number" id="dayHrs" value="${(dayMin/60)}" min="1" max="16" step="0.5" style="width:46px"> hr · blue = working</div>`;
  ops.forEach(o => {
    const busy = Math.min(dayMin, o.bpu * units), idle = Math.max(0, dayMin - busy), util = busy / dayMin * 100;
    html += `<div class="irow"><span class="inm">${o.name}</span>`
         +  `<span class="ibar"><i style="width:${util.toFixed(1)}%"></i></span>`
         +  `<span class="iv"><b>${Math.round(idle)} min</b> idle (${Math.round(100-util)}%)</span></div>`;
  });
  idlePanel.innerHTML = html;
  addPanelX(idlePanel, () => { idlePanel.style.display = 'none'; });
  wireLineSel(idlePanel);
  const dh = document.getElementById('dayHrs');
  if (dh) dh.onchange = e => { dayMin = Math.max(60, (parseFloat(e.target.value) || 7) * 60); reflowAll(); };
}
document.getElementById('idlebtn').onclick = () => {
  idlePanel.style.display = (idlePanel.style.display === 'none') ? 'block' : 'none';
  renderIdle();
};

// ---- help-paths dashboard ----
const helpPanel = document.getElementById('helpPanel');
const stName = id => { const s = getAny(id); return s ? s.title : id; };
// "applies to" product picker for one help arrow — options come from the arrow's own line
function prodTagSel(a, i) {
  const line = stLineOf(a.from);
  const lp = (typeof lineProducts !== 'undefined' && lineProducts) ? lineProducts[line] : null;
  if (!lp) return '';
  let opts = `<option value=""${!a.prod ? ' selected' : ''}>All products</option>` +
    lp.list.map(p => `<option value="${(p.name || '').replace(/"/g, '&quot;')}"${a.prod === p.name ? ' selected' : ''}>${(p.name || '').replace(/</g, '&lt;')}</option>`).join('');
  if (a.prod && !lp.list.some(p => p.name === a.prod)) opts += `<option value="${a.prod.replace(/"/g, '&quot;')}" selected>${a.prod.replace(/</g, '&lt;')} (missing)</option>`;
  return `applies to <select class="hprod" data-i="${i}" title="This help path only counts while the line is building this product" style="font-size:10px;max-width:150px;padding:1px 2px">${opts}</select>`;
}
function wireProdTags() {
  helpPanel.querySelectorAll('.hprod').forEach(sel => sel.onchange = e => {
    const a = helpArrows[+e.target.dataset.i]; a.prod = e.target.value || null;
    buildHelp(); schedule(); if (typeof buildSolaSched === 'function') buildSolaSched();
    renderIdle(); if (typeof renderSolaData === 'function') renderSolaData(); saveLayout(); renderHelpPanel();
  });
}
function bottleneckInfo() {   // busiest PRIMARY crew on the Meritage line (its combined own+covered load)
  let bn = null;
  ST.forEach(s => { if (isPrimary(s.id)) { const v = opLoad(s.id); if (!bn || v > bn.time) bn = { key: s.id, time: v }; } });
  bn = bn || { key: 'sea', time: effNet('sea') };
  const cov = coveredBy(bn.key).map(c => getAny(c).title);
  bn.name = getAny(bn.key).title + (cov.length ? ' + ' + cov.join(' + ') : '');
  bn.cap = dayMinSafe() / Math.max(0.1, bn.time);
  return bn;
}
// a help arrow relieves the bottleneck if it targets the bottleneck station OR a station that station covers
function isBottleneckTarget(to, bnKey) { return to === bnKey || coverOf(to) === bnKey; }
function renderHelpPanel() {
  if (!helpPanel || helpPanel.style.display === 'none') return;
  if (chartLine !== 'meritage') {   // Sola or Canyon Crew — each its own line
    const ids = orderedLine(chartLine);
    const lname = chartLine === 'canyon' ? 'Canyon Crew' : 'Sola';
    const cyc = ids.length ? Math.max(0.1, ...ids.map(id => effNet(id))) : 0.1;
    const bnId = ids.slice().sort((a, b) => effNet(b) - effNet(a))[0];
    const secSet = new Set(ids);
    const sHead = `<h3>Help paths</h3>` + lineSel() + `<div class="ihint"><b>${lname}: ${ids.length ? (dayMinSafe() / Math.max(0.1, cyc)).toFixed(1) : '—'} units/day</b>${bnId ? ' · slowest: ' + stName(bnId) + ' (' + effNet(bnId).toFixed(1) + ' min)' : ''}. Click “➤ Help arrow”, then a FROM then a TO station on this line.</div>`;
    const sHelp = helpArrows.map((a, i) => ({ a, i })).filter(({ a }) => secSet.has(a.to) || secSet.has(a.from));
    if (!sHelp.length) { helpPanel.innerHTML = sHead + `<div class="ihint">No ${lname} help paths yet.</div>`; addPanelX(helpPanel, () => { helpPanel.style.display = 'none'; }); wireLineSel(helpPanel); return; }
    let sh = sHead;
    sHelp.forEach(({ a, i }) => {
      const on = arrowOn(a);
      const spare = availIdleAny(a.from, a.fromIdx || 0) + (on ? (a.helpMin || 0) : 0);
      const before = eff(a.to), after = effNet(a.to);
      const fromPpl = (getAny(a.from) && getAny(a.from).ppl) || 1;
      const fromLabel = stName(a.from) + (fromPpl > 1 ? ' ' + ((a.fromIdx || 0) + 1) : '');
      const onBn = a.to === bnId;
      sh += `<div class="hrow"${on ? '' : ' style="opacity:.55"'}>
        <div class="hnm">${fromLabel} → <b>${stName(a.to)}</b> ${on ? (onBn ? '<span style="color:#2f7d52">✓ slowest</span>' : '<span style="color:#c0552c">⚠ not slowest</span>') : '<span style="color:#8a8f98">⏸ off — different product running</span>'}</div>
        <div class="hctl">takes <input type="number" class="hmin" data-i="${i}" min="0" max="${spare.toFixed(1)}" step="0.5" value="${(a.helpMin || 0)}"> min/unit off ${stName(a.to)}
          <button class="hdel" data-i="${i}">✕</button></div>
        <div class="hsub">${prodTagSel(a, i)}${on ? ` · ${stName(a.to)} step: ${before.toFixed(1)} → <b>${after.toFixed(1)} min</b> · helper has ${spare.toFixed(1)} min/unit spare` : ''}</div>
      </div>`;
    });
    helpPanel.innerHTML = sh;
    addPanelX(helpPanel, () => { helpPanel.style.display = 'none'; });
    helpPanel.querySelectorAll('.hmin').forEach(inp => inp.onchange = e => {
      const a = helpArrows[+e.target.dataset.i]; const spare = availIdleAny(a.from, a.fromIdx || 0) + (a.helpMin || 0);
      a.helpMin = Math.max(0, Math.min(spare, parseFloat(e.target.value) || 0));
      buildHelp(); buildSolaSched(); renderIdle(); renderSolaData(); renderTaskChart(); saveLayout(); renderHelpPanel();
    });
    helpPanel.querySelectorAll('.hdel').forEach(b => b.onclick = e => {
      helpArrows.splice(+e.target.dataset.i, 1); buildHelp(); buildSolaSched(); renderIdle(); renderSolaData(); renderTaskChart(); saveLayout(); renderHelpPanel();
    });
    wireProdTags(); wireLineSel(helpPanel); return;
  }
  const bn = bottleneckInfo();
  const bnName = bn.name;
  const head = `<h3>Help paths</h3>` + lineSel() + `<div class="ihint"><b>Line now: ${bn.cap.toFixed(1)} chairs/day</b> · bottleneck: ${bnName} (${bn.time.toFixed(1)} min). Output only rises when the bottleneck drops.</div>`;
  if (!helpArrows.length) { helpPanel.innerHTML = head + '<div class="ihint">No paths — click “➤ Help arrow”, then a FROM station and the TO station.</div>'; addPanelX(helpPanel, () => { helpPanel.style.display = 'none'; }); wireLineSel(helpPanel); return; }
  let html = head;
  helpArrows.forEach((a, i) => {
    const on = arrowOn(a);
    const spare = availIdleOp(a.from, a.fromIdx || 0) + (on ? (a.helpMin || 0) : 0);
    const before = eff(a.to), after = effNet(a.to);
    const onBn = isBottleneckTarget(a.to, bn.key);
    const fromPpl = (get(a.from) && get(a.from).ppl) || 1;
    const fromLabel = stName(a.from) + (fromPpl > 1 ? ' ' + ((a.fromIdx || 0) + 1) : '');
    html += `<div class="hrow"${on ? '' : ' style="opacity:.55"'}>
      <div class="hnm">${fromLabel} → <b>${stName(a.to)}</b> ${on ? (onBn ? '<span style="color:#2f7d52">✓ bottleneck</span>' : '<span style="color:#c0552c">⚠ not bottleneck</span>') : '<span style="color:#8a8f98">⏸ off — different product running</span>'}</div>
      <div class="hctl">takes <input type="number" class="hmin" data-i="${i}" min="0" max="${spare.toFixed(1)}" step="0.5" value="${(a.helpMin||0)}"> min/chair off ${stName(a.to)}
        <button class="hdel" data-i="${i}">✕</button></div>
      <div class="hsub">${prodTagSel(a, i)}${on ? ` · ${stName(a.to)} step: ${before.toFixed(1)} → <b>${after.toFixed(1)} min</b> · helper has ${spare.toFixed(1)} min/chair spare${onBn ? '' : ' · won\'t raise output until the bottleneck is relieved'}` : ''}</div>
    </div>`;
  });
  helpPanel.innerHTML = html;
  addPanelX(helpPanel, () => { helpPanel.style.display = 'none'; });
  helpPanel.querySelectorAll('.hmin').forEach(inp => inp.onchange = e => {
    const a = helpArrows[+e.target.dataset.i]; const spare = availIdleOp(a.from, a.fromIdx || 0) + (a.helpMin || 0);
    a.helpMin = Math.max(0, Math.min(spare, parseFloat(e.target.value) || 0));
    buildHelp(); schedule(); renderIdle(); saveLayout();
  });
  helpPanel.querySelectorAll('.hdel').forEach(b => b.onclick = e => {
    helpArrows.splice(+e.target.dataset.i, 1); buildHelp(); schedule(); renderIdle(); saveLayout();
  });
  wireProdTags(); wireLineSel(helpPanel);
}
document.getElementById('helppaths').onclick = () => {
  helpPanel.style.display = (helpPanel.style.display === 'none') ? 'block' : 'none';
  renderHelpPanel();
};

// ---- task-distribution / operator-loading chart ----
const taskPanel = document.getElementById('taskPanel');
function renderTaskChart() {
  if (!taskPanel || taskPanel.style.display === 'none') return;
  let rows, totalLabor;
  if (chartLine !== 'meritage') {   // Sola or Canyon Crew — each its own line
    const ids = orderedLine(chartLine);
    const cf = prodF(chartLine);
    rows = ids.filter(id => !coverOf(id)).map(id => {                    // covered stations fold into their covering crew's bar
      const s = nodes[id].s;
      const cov = ids.filter(x => coverOf(x) === id);
      const tt = effNet(id) + cov.reduce((a, x) => a + effNet(x), 0);    // effNet reflects help paths (and walk); coverage rolls in
      const steps = cov.length ? [...(s.steps || []), ...cov.flatMap(x => nodes[x].s.steps || [])] : s.steps;
      const title = cov.length ? s.title + ' + ' + cov.map(x => nodes[x].s.title).join(' + ') : s.title;
      return { title, tt, steps, bn: false };
    });
    totalLabor = ids.reduce((a, id) => a + (nodes[id].s.t || 0), 0) * cf;
  } else {
    // Full assembly + pack are done by the SAME 2 people back-to-back → one bar.
    rows = ['con','arm','bak','tre','sea'].map(id => ({ title: get(id).title, tt: effNet(id), steps: get(id).steps, bn: false }));
    rows.push({ title: 'FULL ASSEMBLY + PACK', tt: effNet('fa') + effNet('pak'), steps: [...(get('fa').steps || []), ...(get('pak').steps || [])], bn: false });
    totalLabor = ['con','arm','bak','tre','sea','fa','pak'].reduce((a, id) => a + (get(id).t || 0), 0) * prodF('meritage');
  }
  let bnR = null; rows.forEach(r => { if (!bnR || r.tt > bnR.tt) bnR = r; }); if (bnR) bnR.bn = true;
  const cyc = Math.max(0.001, ...rows.map(r => r.tt));
  const takt = dayMin / Math.max(1, taktDemand);
  const scaleMax = Math.max(cyc, takt) * 1.04;            // fit both the bars and the takt line
  const taktPct = (takt / scaleMax) * 100;
  let html = `<h3>Task distribution — operator loading</h3>` + lineSel();
  if (!rows.length) { taskPanel.innerHTML = html + '<div class="ihint">No right-side stations yet.</div>'; wireLineSel(taskPanel); return; }
  html += `<div class="ihint"><b>Cycle: ${totalLabor.toFixed(1)} min/unit</b> · current pace ${cyc.toFixed(1)} · <span id="taktVal" title="Double-click to type a takt time — the chart updates to show it" style="color:#d11;font-weight:700;cursor:pointer;border-bottom:1px dashed #d11">takt ${takt.toFixed(1)} min</span> (<input type="number" id="taktDemand" value="${+taktDemand.toFixed(1)}" min="1" style="width:44px"> units / <span id="dayHrsVal" title="Double-click to change the day length" style="cursor:pointer;border-bottom:1px dashed #9aa">${(dayMin/60).toFixed(1)}-hr</span> day). Red line = takt.</div>`;
  rows.forEach(row => {
    const tt = row.tt;
    const onBn = row.bn;
    const stepsArr = (row.steps && row.steps.length) ? row.steps : [{ name: row.title, t: tt }];
    const baseSum = stepsArr.reduce((a, st) => a + (parseFloat(st.t) || 0), 0) || tt;
    const f = tt / baseSum;                                   // scale steps so the bar totals the NET station time (matches the label + takt line)
    let seg = '';
    stepsArr.forEach((st, i) => {
      const sw = ((parseFloat(st.t) || 0) * f / scaleMax) * 100;
      const col = onBn ? (i % 2 ? '#c0552c' : '#d98a6e') : (i % 2 ? '#2f6df6' : '#7ba6e0');
      seg += `<i style="width:${sw}%;background:${col}" title="${(st.name||'').replace(/"/g,'')} · ${st.t} min"></i>`;
    });
    html += `<div class="trow2"><span class="tn2">${row.title}${onBn?' ◄':''}</span><span class="bar2">${seg}<span class="takt2" style="left:${taktPct}%"></span></span><span class="v2">${tt.toFixed(1)}m</span></div>`;
  });
  taskPanel.innerHTML = html;
  addPanelX(taskPanel, () => { taskPanel.style.display = 'none'; });
  wireLineSel(taskPanel);
  const td = document.getElementById('taktDemand');
  if (td) td.oninput = e => {                               // live: takt line + minutes move as you type/spin
    taktDemand = Math.max(1, parseFloat(e.target.value) || 1);
    renderTaskChart();
    const n = document.getElementById('taktDemand'); if (n) { n.focus(); }   // keep focus through the re-render
  };
  // double-click the takt figure to TYPE a takt time (min) — demand back-computes and every bar/line re-renders
  const dblEdit = (id, getCur, apply) => {
    const el = document.getElementById(id); if (!el) return;
    el.ondblclick = () => {
      const inp = document.createElement('input');
      inp.type = 'number'; inp.step = '0.5'; inp.min = '0.5'; inp.value = getCur(); inp.style.width = '60px';
      el.replaceWith(inp); inp.focus(); inp.select();
      let done = false;
      const commit = () => { if (done) return; done = true; const v = parseFloat(inp.value); if (v > 0) apply(v); renderTaskChart(); renderIdle(); };
      inp.onkeydown = e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { done = true; renderTaskChart(); } };
      inp.onblur = commit;
    };
  };
  dblEdit('taktVal', () => (dayMin / Math.max(0.1, taktDemand)).toFixed(1), v => { taktDemand = dayMin / v; });
  dblEdit('dayHrsVal', () => (dayMin / 60).toFixed(1), v => { dayMin = Math.max(60, Math.min(16 * 60, v * 60)); reflowAll(); });
}
document.getElementById('taskbtn').onclick = () => {
  taskPanel.style.display = (taskPanel.style.display === 'none') ? 'block' : 'none';
  renderTaskChart();
};

// ---- Takt board: pace / capacity / takt for EVERY product on EVERY line, in one full page ----
(function plannerCss(){
  const s = document.createElement('style'); s.textContent = `
  #plannerPanel{position:fixed;inset:0;z-index:82;overflow:auto;background:#eef1f5;padding:16px 30px 44px}
  #plannerPanel h3{max-width:1500px;margin:2px auto 2px;font-size:20px;color:#15263a}
  #plannerPanel .plctl{max-width:1500px;margin:0 auto 16px;font-size:12.5px;color:#5a6672;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
  #plannerPanel .plctl input[type=number]{width:52px;text-align:center}
  #plannerPanel .plgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:22px;max-width:1500px;margin:0 auto;align-items:start}
  #plannerPanel .plcol{background:#fff;border:1px solid #e2e7ee;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(20,30,45,.06)}
  #plannerPanel .plhd{padding:11px 16px;color:#fff;font-weight:800;font-size:15px;display:flex;justify-content:space-between;align-items:center}
  #plannerPanel .pladd{display:flex;gap:6px;align-items:center;padding:10px 16px;background:#f7f9fc;border-bottom:1px solid #eef1f5}
  #plannerPanel .pladd .plProd{flex:1;font-size:12.5px;padding:3px 5px}
  #plannerPanel .pladd .plQty{width:52px;text-align:center;font-size:12.5px}
  #plannerPanel .pladd .plAdd{background:#1f6df6;border:0;color:#fff;border-radius:7px;padding:4px 11px;font-size:12px;font-weight:700;cursor:pointer}
  #plannerPanel .plrow{padding:10px 16px;border-top:1px solid #eef1f5}
  #plannerPanel .plnm{font-size:13.5px;color:#15263a;display:flex;align-items:center;gap:7px;margin-bottom:5px}
  #plannerPanel .plnm b{color:#15263a}
  #plannerPanel .plseq{display:inline-flex;align-items:center;justify-content:center;width:19px;height:19px;border-radius:50%;background:#e7eef7;color:#33414f;font-size:11px;font-weight:800;flex:none}
  #plannerPanel .plorder{cursor:default}
  #plannerPanel .plgrip{cursor:grab;color:#aab2bd;font-size:14px;letter-spacing:-3px;flex:none;padding-right:3px}
  #plannerPanel .plorder.dragging{opacity:.45}
  #plannerPanel .plorder.dragover{box-shadow:inset 0 3px 0 #1f6df6;border-radius:6px}
  #plannerPanel .plctls{margin-left:auto;display:flex;gap:3px}
  #plannerPanel .plctls button{border:1px solid #cfd6de;background:#fff;color:#5a6672;border-radius:5px;padding:1px 6px;font-size:11px;cursor:pointer;line-height:1.4}
  #plannerPanel .plctls .plDel{color:#c0552c;border-color:#dcae9f}
  #plannerPanel .plbar{position:relative;height:16px;background:#eef2f7;border-radius:5px;overflow:visible;margin:3px 0 5px}
  #plannerPanel .plbar > i{position:absolute;top:0;height:100%;border-radius:4px}
  #plannerPanel .plmk{position:absolute;top:-3px;bottom:-3px;width:2px;background:#e11;box-shadow:0 0 0 .5px rgba(255,255,255,.6)}
  #plannerPanel .plmeta{font-size:11.5px;color:#5a6672}
  #plannerPanel .plover{color:#c0552c;font-weight:700}
  #plannerPanel .plsum{padding:10px 16px;border-top:2px solid #eef1f5;font-size:12.5px;font-weight:700}
  #plannerPanel .plsum.ok{color:#2f7d52;background:#f2faf5}
  #plannerPanel .plsum.over{color:#c0552c;background:#fdf4f1}`;
  document.head.appendChild(s);
})();
// pace / labor / capacity / takt for ONE product WITHOUT changing what the line is running (pure read from the definition)
function productMetrics(line, prod) {
  const ids = lineStationIds(line).filter(id => getAny(id));
  const isSteps = !!prod.stations;
  const f = isSteps ? 1 : Math.max(0.05, +prod.f || 1);
  const baseT = id => {
    if (isSteps) return (prod.stations[id] || []).reduce((a, st) => a + (+st[1] || 0), 0);
    if (typeof baseSteps !== 'undefined' && baseSteps[line] && baseSteps[line][id]) return baseSteps[line][id].reduce((a, st) => a + (+st.t || 0), 0);
    const s = getAny(id); return (s.steps || []).reduce((a, st) => a + (+st.t || 0), 0);
  };
  const helpP = id => (typeof helpArrows === 'undefined') ? 0 : helpArrows.reduce((s, a) => s + ((a.to === id && (!a.prod || a.prod === prod.name)) ? (a.helpMin || 0) : 0), 0);
  const netT = id => { const s = getAny(id), ppl = Math.max(1, s.ppl || 1); return Math.max(0.1, (baseT(id) / ppl) * f + walkOf(id) - helpP(id)); };
  const load = id => netT(id) + ids.filter(x => coverOf(x) === id).reduce((a, x) => a + netT(x), 0);
  let pace = 0.1, bn = '—';
  ids.forEach(id => { if (isPrimary(id)) { const v = load(id); if (v > pace) { pace = v; bn = getAny(id).title; } } });
  const labor = ids.reduce((a, id) => a + baseT(id), 0) * f;
  const demand = Math.max(0.1, +prod.demand || taktDemand || 10);
  return { pace, labor, cap: dayMinSafe() / Math.max(0.1, pace), demand, takt: dayMinSafe() / demand, bn };
}
// ---- daily build plan: which furniture, how many, and in what order, per line ----
function planClock(offsetMin) {
  let t = Math.round(planStart + offsetMin); t = ((t % 1440) + 1440) % 1440;
  const h = Math.floor(t / 60), mm = t % 60, ap = h < 12 ? 'AM' : 'PM', hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(mm).padStart(2, '0')} ${ap}`;
}
function renderPlanner() {
  const panel = document.getElementById('plannerPanel');
  if (!panel || panel.style.display === 'none') return;
  const LINES = [['meritage', 'MERITAGE', '#1d3a66'], ['sola', 'SOLA', '#236043'], ['canyon', 'CANYON CREW', '#9a5b1f']];
  const avail = dayMinSafe();
  const cols = LINES.map(([key, label, color]) => {
    const lp = (typeof lineProducts !== 'undefined' && lineProducts) ? lineProducts[key] : null;
    const list = (lp && lp.list) || [];
    const orders = (dayPlan[key] || []).filter(o => list[o.p]);
    let cum = 0;
    const rows = orders.map((o, idx) => {
      const prod = list[o.p], m = productMetrics(key, prod), q = Math.max(0, o.q || 0);
      const mins = q * m.pace, start = cum; cum += mins;
      return { idx, name: prod.name, q, pace: m.pace, mins, start, end: cum };
    });
    return { key, label, color, list, orders, rows, total: cum };
  });
  const scale = Math.max(avail, ...cols.map(c => c.total), 1) * 1.02;
  let html = `<h3>Planner: build the day's schedule</h3>`;
  html += `<div class="plctl">Day length <input type="number" id="plDay" value="${(avail / 60)}" min="1" max="16" step="0.5"> hr`
        + ` · Start <input type="time" id="plStart" value="${String(Math.floor(planStart / 60)).padStart(2, '0')}:${String(planStart % 60).padStart(2, '0')}" style="font-size:12px">`
        + ` · pick each line's furniture, how many, and the order to build them; the schedule builds itself. <b style="color:#e11">Red line</b> = end of day.</div>`;
  html += `<div class="plgrid">`;
  cols.forEach(c => {
    const over = c.total > avail + 0.5;
    html += `<div class="plcol"><div class="plhd" style="background:${c.color}"><span>${c.label}</span><span>${c.total > 0 ? (planClock(0) + ' → ' + planClock(c.total)) : '—'}</span></div>`;
    if (c.list.length) {
      html += `<div class="pladd"><select class="plProd" data-line="${c.key}">${c.list.map((p, i) => `<option value="${i}">${(p.name || '').replace(/</g, '&lt;')}</option>`).join('')}</select>`
            + `<input type="number" class="plQty" data-line="${c.key}" value="1" min="1" step="1" title="How many to build">`
            + `<button class="plAdd" data-line="${c.key}">+ add</button></div>`;
    } else { html += `<div class="plrow" style="color:#8a8f98">No products on this line.</div>`; }
    if (!c.rows.length) { html += `<div class="plrow" style="color:#8a8f98">No builds planned yet. Add the furniture you need today.</div>`; }
    c.rows.forEach(r => {
      const segOver = r.end > avail + 0.5;
      const fill = segOver ? 'repeating-linear-gradient(45deg,#c0552c,#c0552c 6px,#dd9b82 6px,#dd9b82 12px)' : c.color;
      html += `<div class="plrow plorder" draggable="true" data-line="${c.key}" data-i="${r.idx}">
        <div class="plnm"><span class="plgrip" title="Drag to reorder">⠿</span><span class="plseq">${r.idx + 1}</span> <b>${r.q}×</b> ${(r.name || '').replace(/</g, '&lt;')}
          <span class="plctls"><button class="plUp" data-line="${c.key}" data-i="${r.idx}" title="Build earlier">▲</button><button class="plDn" data-line="${c.key}" data-i="${r.idx}" title="Build later">▼</button><button class="plDel" data-line="${c.key}" data-i="${r.idx}" title="Remove">✕</button></span></div>
        <div class="plbar"><i style="left:${(r.start / scale * 100).toFixed(2)}%;width:${(r.mins / scale * 100).toFixed(2)}%;background:${fill}"></i><span class="plmk" style="left:${(avail / scale * 100).toFixed(2)}%"></span></div>
        <div class="plmeta">${r.q} unit${r.q === 1 ? '' : 's'} · ${r.pace.toFixed(1)}m each · ${r.mins.toFixed(0)}m total · done <b>${planClock(r.end)}</b>${segOver ? ' <span class="plover">· runs past end of day</span>' : ''}</div>
      </div>`;
    });
    if (c.rows.length) {
      const units = c.orders.reduce((a, o) => a + Math.max(0, o.q || 0), 0);
      html += `<div class="plsum ${over ? 'over' : 'ok'}">${units} unit${units === 1 ? '' : 's'} · ${c.total.toFixed(0)} of ${avail.toFixed(0)} min · ${over ? ('⚠ over by ' + (c.total - avail).toFixed(0) + ' min, won\'t all finish today') : ('✓ fits with ' + (avail - c.total).toFixed(0) + ' min to spare')}</div>`;
    }
    html += `</div>`;
  });
  html += `</div>`;
  panel.innerHTML = html;
  addPanelX(panel, () => { panel.style.display = 'none'; const b = document.getElementById('plannerbtn'); if (b) b.classList.remove('on'); });
  const dEl = document.getElementById('plDay');
  if (dEl) dEl.onchange = e => { dayMin = Math.max(60, Math.min(16 * 60, (parseFloat(e.target.value) || 7) * 60)); if (typeof reflowAll === 'function') reflowAll(); renderPlanner(); };
  const sEl = document.getElementById('plStart');
  if (sEl) sEl.onchange = e => { const m = /^(\d\d):(\d\d)$/.exec(e.target.value); if (m) { planStart = (+m[1]) * 60 + (+m[2]); saveLayout(); renderPlanner(); } };
  panel.querySelectorAll('.plAdd').forEach(btn => btn.onclick = e => {
    const line = e.target.dataset.line;
    const sel = panel.querySelector(`.plProd[data-line="${line}"]`), qty = panel.querySelector(`.plQty[data-line="${line}"]`);
    if (!sel) return;
    (dayPlan[line] = dayPlan[line] || []).push({ p: +sel.value, q: Math.max(1, parseInt(qty && qty.value) || 1) });
    saveLayout(); renderPlanner();
  });
  panel.querySelectorAll('.plDel').forEach(btn => btn.onclick = e => {
    dayPlan[e.target.dataset.line].splice(+e.target.dataset.i, 1); saveLayout(); renderPlanner();
  });
  const move = (line, i, d) => { const arr = dayPlan[line], j = i + d; if (j < 0 || j >= arr.length) return; const t = arr[i]; arr[i] = arr[j]; arr[j] = t; saveLayout(); renderPlanner(); };
  panel.querySelectorAll('.plUp').forEach(btn => btn.onclick = e => move(e.target.dataset.line, +e.target.dataset.i, -1));
  panel.querySelectorAll('.plDn').forEach(btn => btn.onclick = e => move(e.target.dataset.line, +e.target.dataset.i, 1));
  // drag to reorder within a line ("move the furniture if one got there before the other")
  const clearDnd = () => panel.querySelectorAll('.plorder').forEach(r => r.classList.remove('dragover', 'dragging'));
  panel.querySelectorAll('.plorder').forEach(row => {
    row.ondragstart = e => { plDrag = { line: row.dataset.line, i: +row.dataset.i }; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', row.dataset.i); } catch (_) {} row.classList.add('dragging'); };
    row.ondragend = () => { plDrag = null; clearDnd(); };
    row.ondragover = e => { if (plDrag && plDrag.line === row.dataset.line) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (!row.classList.contains('dragover')) { panel.querySelectorAll('.plorder.dragover').forEach(r => r.classList.remove('dragover')); row.classList.add('dragover'); } } };
    row.ondragleave = () => row.classList.remove('dragover');
    row.ondrop = e => {
      e.preventDefault();
      if (!plDrag || plDrag.line !== row.dataset.line) return;
      const line = row.dataset.line, from = plDrag.i, to = +row.dataset.i;
      plDrag = null;
      if (from === to) { renderPlanner(); return; }
      const arr = dayPlan[line], [it] = arr.splice(from, 1);
      arr.splice(from < to ? to - 1 : to, 0, it);
      saveLayout(); renderPlanner();
    };
  });
}
document.getElementById('plannerbtn').onclick = () => {
  const panel = document.getElementById('plannerPanel');
  const show = panel.style.display === 'none';
  panel.style.display = show ? 'block' : 'none';
  document.getElementById('plannerbtn').classList.toggle('on', show);
  renderPlanner();
};

// ---- Takt board: pace / capacity / takt for EVERY product on EVERY line, side by side ----
(function taktBoardCss(){
  const s = document.createElement('style'); s.textContent = `
  #taktPanel{position:fixed;inset:0;z-index:82;overflow:auto;background:#eef1f5;padding:16px 30px 44px}
  #taktPanel h3{max-width:1500px;margin:2px auto 2px;font-size:20px;color:#15263a}
  #taktPanel .tkctl{max-width:1500px;margin:0 auto 16px;font-size:12.5px;color:#5a6672;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
  #taktPanel .tkctl input{width:52px;text-align:center}
  #taktPanel .tkgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:22px;max-width:1500px;margin:0 auto;align-items:start}
  #taktPanel .tkcol{background:#fff;border:1px solid #e2e7ee;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(20,30,45,.06)}
  #taktPanel .tkhd{padding:11px 16px;color:#fff;font-weight:800;font-size:15px;display:flex;justify-content:space-between;align-items:center}
  #taktPanel .tkrow{padding:11px 16px;border-top:1px solid #eef1f5}
  #taktPanel .tkrow.run{background:#f4f9ff}
  #taktPanel .tknm{font-weight:700;font-size:14px;color:#15263a;display:flex;align-items:center;gap:8px;margin-bottom:6px}
  #taktPanel .tkchip{font-size:10px;font-weight:800;background:#1f6df6;color:#fff;border-radius:9px;padding:1px 8px;letter-spacing:.03em}
  #taktPanel .tkbar{position:relative;height:17px;background:#eef2f7;border-radius:5px;overflow:visible;margin:5px 0 7px}
  #taktPanel .tkbar > i{display:block;height:100%;border-radius:5px}
  #taktPanel .tkmk{position:absolute;top:-3px;bottom:-3px;width:2px;background:#e11;box-shadow:0 0 0 .5px rgba(255,255,255,.6)}
  #taktPanel .tkmeta{font-size:12px;color:#5a6672;display:flex;gap:14px;flex-wrap:wrap;align-items:center}
  #taktPanel .tkmeta b{color:#15263a}
  #taktPanel .tkmeta input{width:50px;text-align:center;font-size:12px}
  #taktPanel .tkok{color:#2f7d52;font-weight:700}
  #taktPanel .tkover{color:#c0552c;font-weight:700}
  #taktPanel .tkoptbox{background:#f2faf5;border:1px solid #bfe3cd;border-radius:8px;padding:7px 10px;margin-top:8px}
  #taktPanel .tkopthd{font-size:12px;color:#26523a;margin-bottom:4px}
  #taktPanel .tkopthd b{color:#15263a}
  #taktPanel .tkoptbar{height:13px;margin:4px 0 6px}
  #taktPanel .tkoptbar > i{background:linear-gradient(90deg,#7cc79a,#2f7d52)}
  #taktPanel .tkopta{font-size:11.5px;color:#3c5a49;padding:1px 0}
  #taktPanel .tkopta b{color:#15263a}
  #taktPanel .tkoptnone{font-size:11.5px;color:#7a8a80}
  #taktPanel #tkOpt.on{background:#2f7d52;border-color:#2f7d52}`;
  document.head.appendChild(s);
})();
// propose up to N help paths for one product on one line, minimizing the pace.
// PURE what-if: reads the product definition, never touches helpArrows.
function optimizeHelpFor(line, prod, N) {
  const ids = lineStationIds(line).filter(id => getAny(id));
  const isSteps = !!prod.stations;
  const f = isSteps ? 1 : Math.max(0.05, +prod.f || 1);
  const baseT = id => {
    if (isSteps) return (prod.stations[id] || []).reduce((a, st) => a + (+st[1] || 0), 0);
    if (typeof baseSteps !== 'undefined' && baseSteps[line] && baseSteps[line][id]) return baseSteps[line][id].reduce((a, st) => a + (+st.t || 0), 0);
    const s = getAny(id); return (s.steps || []).reduce((a, st) => a + (+st.t || 0), 0);
  };
  const nt = id => { const s = getAny(id), ppl = Math.max(1, s.ppl || 1); return Math.max(0.1, (baseT(id) / ppl) * f + walkOf(id)); };
  const prim = ids.filter(id => isPrimary(id));
  if (!prim.length) return null;
  const load0 = {}; prim.forEach(id => { load0[id] = nt(id) + ids.filter(x => coverOf(x) === id).reduce((a, x) => a + nt(x), 0); });
  const ops = []; prim.forEach(id => { const ppl = Math.max(1, getAny(id).ppl || 1); for (let i = 0; i < ppl; i++) ops.push({ id, idx: i, given: 0 }); });
  const recv = {}; prim.forEach(id => recv[id] = 0);
  const busy = op => Math.max(0.1, load0[op.id] - recv[op.id]) + op.given;
  const paceNoHelp = Math.max(...prim.map(id => load0[id]), 0.1);
  const arrows = [];
  for (let k = 0; k < N; k++) {
    let bOp = ops[0]; ops.forEach(o => { if (busy(o) > busy(bOp)) bOp = o; });
    const B = busy(bOp), bSt = bOp.id;
    const givers = ops.filter(o => o.id !== bSt && o.given === 0);   // one path per operator (they walk to one place)
    if (!givers.length) break;
    let g = givers[0]; givers.forEach(o => { if (busy(o) < busy(g)) g = o; });
    const G = busy(g);
    let L2 = 0; ops.forEach(o => { if (o.id !== bSt && o !== g) L2 = Math.max(L2, busy(o)); });
    const half = (B - G) / 2, toNext = B - L2;
    let m = (L2 > (B + G) / 2 + 0.05 && toNext >= 0.3) ? toNext : half;   // stop at the next constraint, else balance giver & receiver
    m = Math.floor(m * 10) / 10;
    if (m < 0.3) break;                                                   // no meaningful gain left
    recv[bSt] += m; g.given += m;
    const ex = arrows.find(a => a.from === g.id && a.fromIdx === g.idx && a.to === bSt);
    if (ex) ex.min += m; else arrows.push({ from: g.id, fromIdx: g.idx, to: bSt, min: m });
  }
  const pace = Math.max(...ops.map(busy), 0.1);
  return { pace, paceNoHelp, arrows };
}
let tkOptShow = false, tkMaxHelp = 3;   // Takt board optimizer: proposal display toggle + path budget
function renderTaktBoard() {
  const panel = document.getElementById('taktPanel');
  if (!panel || panel.style.display === 'none') return;
  const LINES = [['meritage', 'MERITAGE', '#1d3a66'], ['sola', 'SOLA', '#236043'], ['canyon', 'CANYON CREW', '#9a5b1f']];
  const cols = LINES.map(([key, label, color]) => {
    const lp = (typeof lineProducts !== 'undefined' && lineProducts) ? lineProducts[key] : null;
    const products = (lp && lp.list) ? lp.list.map((p, i) => ({ name: p.name, i, ...productMetrics(key, p) })) : [];
    return { key, label, color, products, running: lp ? lp.active : -1 };
  });
  let scaleMax = 1; cols.forEach(c => c.products.forEach(p => { scaleMax = Math.max(scaleMax, p.pace, p.takt); })); scaleMax *= 1.05;
  let html = `<h3>Takt board: pace &amp; capacity by product</h3>`;
  html += `<div class="tkctl">Day length <input type="number" id="tkDay" value="${(dayMinSafe()/60)}" min="1" max="16" step="0.5"> hr`
        + ` · <b style="color:#2f6df6">bar</b> = pace (min/unit) · <b style="color:#e11">red line</b> = takt · set each product's target/day to move its takt · <b style="color:#2f7d52">green</b> meets takt, <b style="color:#c0552c">red</b> is over`
        + ` · <span style="border-left:1px solid #cfd6de;padding-left:14px">up to <input type="number" id="tkMaxHelp" value="${tkMaxHelp}" min="1" max="12" step="1" title="Path budget: most help paths the optimizer may propose per line"> help paths</span>`
        + ` <button id="tkOpt" class="${tkOptShow ? 'on' : ''}" style="padding:4px 12px">⚡ Optimize</button>`
        + `${tkOptShow ? ' <span style="color:#2f7d52;font-weight:700">showing proposals only, your help paths are untouched</span>' : ''}</div>`;
  html += `<div class="tkgrid">`;
  cols.forEach(c => {
    html += `<div class="tkcol"><div class="tkhd" style="background:${c.color}"><span>${c.label}</span><span>${c.products.length} product${c.products.length === 1 ? '' : 's'}</span></div>`;
    if (!c.products.length) { html += `<div class="tkrow" style="color:#8a8f98">No products yet.</div></div>`; return; }
    c.products.forEach(p => {
      const over = p.pace > p.takt + 0.05;
      const paceW = Math.min(100, p.pace / scaleMax * 100), taktL = Math.min(100, p.takt / scaleMax * 100);
      const grad = over ? 'linear-gradient(90deg,#e0906e,#c0552c)' : 'linear-gradient(90deg,#7ba6e0,#2f6df6)';
      html += `<div class="tkrow${p.i === c.running ? ' run' : ''}">
        <div class="tknm">${(p.name || '').replace(/</g, '&lt;')}${p.i === c.running ? '<span class="tkchip">RUNNING</span>' : ''}</div>
        <div class="tkbar"><i style="width:${paceW}%;background:${grad}"></i><span class="tkmk" style="left:${taktL}%"></span></div>
        <div class="tkmeta">
          <span>pace <b>${p.pace.toFixed(1)}m</b></span>
          <span>labor <b>${p.labor.toFixed(0)}m</b></span>
          <span>capacity <b>${p.cap.toFixed(1)}/day</b></span>
          <span>takt <b>${p.takt.toFixed(1)}m</b> @ <input type="number" class="tkTarget" data-line="${c.key}" data-i="${p.i}" value="${(+p.demand.toFixed(1))}" min="1" step="1">/day</span>
          <span class="${over ? 'tkover' : 'tkok'}">${over ? ('⚠ over takt by ' + (p.pace - p.takt).toFixed(1) + 'm') : '✓ meets takt'}</span>
        </div>`;
      if (tkOptShow) {
        const opt = optimizeHelpFor(c.key, (lineProducts[c.key] || { list: [] }).list[p.i], tkMaxHelp);
        if (opt && opt.arrows.length && opt.pace < p.pace - 0.2) {
          const optW = Math.min(100, opt.pace / scaleMax * 100);
          const capNow = dayMinSafe() / Math.max(0.1, p.pace), capOpt = dayMinSafe() / Math.max(0.1, opt.pace);
          const optOver = opt.pace > p.takt + 0.05;
          html += `<div class="tkoptbox">
            <div class="tkopthd">⚡ with ${opt.arrows.length} help path${opt.arrows.length === 1 ? '' : 's'}: pace <b>${p.pace.toFixed(1)} → ${opt.pace.toFixed(1)}m</b> · capacity <b>${capNow.toFixed(1)} → ${capOpt.toFixed(1)}/day</b>${optOver ? '' : ' · <span style="color:#2f7d52">✓ would meet takt</span>'}</div>
            <div class="tkbar tkoptbar"><i style="width:${optW}%"></i><span class="tkmk" style="left:${Math.min(100, p.takt / scaleMax * 100)}%"></span></div>
            ${opt.arrows.map(a => { const fs = getAny(a.from), fp = Math.max(1, fs.ppl || 1); return `<div class="tkopta">${(fs.title || a.from)}${fp > 1 ? ' op ' + (a.fromIdx + 1) : ''} → <b>${(getAny(a.to) || {}).title || a.to}</b> · ${a.min.toFixed(1)} min/unit</div>`; }).join('')}
          </div>`;
        } else if (opt) {
          html += `<div class="tkoptbox tkoptnone">⚡ already balanced: no meaningful gain within ${tkMaxHelp} path${tkMaxHelp === 1 ? '' : 's'}</div>`;
        }
      }
      html += `</div>`;
    });
    html += `</div>`;
  });
  html += `</div>`;
  panel.innerHTML = html;
  addPanelX(panel, () => { panel.style.display = 'none'; const b = document.getElementById('taktbtn'); if (b) b.classList.remove('on'); });
  const dEl = document.getElementById('tkDay');
  if (dEl) dEl.onchange = e => { dayMin = Math.max(60, Math.min(16 * 60, (parseFloat(e.target.value) || 7) * 60)); if (typeof reflowAll === 'function') reflowAll(); renderTaktBoard(); };
  panel.querySelectorAll('.tkTarget').forEach(inp => inp.onchange = e => {
    const lp = lineProducts[e.target.dataset.line], p = lp && lp.list[+e.target.dataset.i];
    if (p) { p.demand = Math.max(1, parseFloat(e.target.value) || 10); saveLayout(); renderTaktBoard(); }
  });
  const oEl = document.getElementById('tkOpt');
  if (oEl) oEl.onclick = () => { tkOptShow = !tkOptShow; renderTaktBoard(); };
  const mEl = document.getElementById('tkMaxHelp');
  if (mEl) mEl.onchange = e => { tkMaxHelp = Math.max(1, Math.min(12, parseInt(e.target.value) || 3)); if (tkOptShow) renderTaktBoard(); };
}
document.getElementById('taktbtn').onclick = () => {
  const panel = document.getElementById('taktPanel');
  const show = panel.style.display === 'none';
  panel.style.display = show ? 'block' : 'none';
  document.getElementById('taktbtn').classList.toggle('on', show);
  renderTaktBoard();
};
// toggle the editable Station-times panel like the other panels
{ const tb = document.getElementById('timesbtn'); if (tb) tb.onclick = () => {
  const hidden = timeBox.style.display === 'none';
  timeBox.classList.add('fullpage');                   // Edit times is its own page now
  timeBox.style.display = hidden ? 'block' : 'none';
  tb.classList.toggle('on', hidden);
}; }
timeBox.classList.add('fullpage');
timeBox.style.display = 'none';                        // starts closed — the floor is the home screen
{ const tb = document.getElementById('timesbtn'); if (tb) tb.classList.remove('on'); }

/* =========================== EDIT LAYOUT =========================== */
// (YARD is defined near the top, next to FT)
const u2y = u => u / YARD;                  // units -> yards
const LAYOUT_KEY = 'm3d_layout_v2';   // bumped: deck rescaled to real footprint

function placeStation(id) {
  const nd = nodes[id]; if (!nd) return;
  const x = nd.x, z = nd.z, r = nd.rot || 0, cs = Math.cos(r), sn = Math.sin(r);
  nd.st.position.x = x; nd.st.position.z = z; nd.st.rotation.y = r;
  if (nd.label) { nd.label.position.x = x; nd.label.position.z = z; }
  if (nd.mini) { nd.mini.position.x = x; nd.mini.position.z = z; }
  if (nd.visual) { nd.visual.g.position.x = x; nd.visual.g.position.z = z; nd.visual.g.rotation.y = r; }
  crew.filter(c => c.station === id).forEach(c => {
    const rx = c.bdx * cs + c.bdz * sn, rz = c.bdz * cs - c.bdx * sn;   // rotate the operator's offset with the table (matches THREE Y-rotation, so crew tracks the mat)
    c.homeX = x + rx; c.homeZ = z + rz;
    if (!editing) { c.fig.position.x = c.homeX; c.fig.position.z = c.homeZ; }
  });
}
const STORDER = ['con','arm','bak','tre','sea','fa','pak'];
function rebuildCrew(id) {              // recreate a station's operator figures to match its people count
  for (let i = crew.length - 1; i >= 0; i--) { if (crew[i].station === id) { level2.remove(crew[i].fig); crew.splice(i, 1); } }
  const s = get(id), nd = nodes[id]; if (!nd) return;
  const np = coverOf(id) ? 0 : Math.max(0, s.ppl || 0);   // a covered station's work is done by the covering crew, so no figures stand here
  const base = Math.max(0, STORDER.indexOf(id)), spread = s.double ? 4 * FT : 1.1;
  for (let i = 0; i < np; i++) {
    const color = OP_COLORS[(base * 2 + i) % OP_COLORS.length];
    const fig = makeCrewFigure(color, s.title.split(' ')[0] + (np > 1 ? ' ' + (i + 1) : ''));
    const bdx = (np > 1 ? (i - (np - 1) / 2) * 2 * spread : 0), bdz = ((s.role === 'fa' ? 5 : 4) * FT) / 2 + 0.6;
    fig.position.set(nd.x + bdx, 0, nd.z + bdz); level2.add(fig);
    crew.push({ fig, station: id, bdx, bdz, homeX: nd.x + bdx, homeZ: nd.z + bdz, idx: i });
  }
  if (typeof assignHelpers === 'function') assignHelpers();
}
function setStationPos(id, x, z) {
  const nd = nodes[id]; if (!nd) return;
  nd.x = x; nd.z = z; POS[id] = [x, z];
  placeStation(id);
  if (id === 'con' && typeof rebuildDivider === 'function') rebuildDivider();   // crossing follows the connector
  if (id === 'cart2' && typeof refreshCart2Feed === 'function') refreshCart2Feed();
  if (id === 'cart3' && typeof refreshCart3Feed === 'function') refreshCart3Feed();
}
function setStationRot(id, rot) {
  const nd = nodes[id]; if (!nd) return;
  nd.rot = rot; placeStation(id);
}
// Build the working-layout object from the LIVE scene (not from storage).
function buildWorkingLayout() {
  const o = {}; Object.keys(POS).forEach(id => { if (POS[id]) o[id] = POS[id]; }); o.__wps = cartWaypoints.map(w => [w.x, w.z]); o.__wps2 = cart2Waypoints.map(w => [w.x, w.z]); o.__help = helpArrows.map(a => [a.from, a.to, a.helpMin || 0, a.fromIdx || 0, a.prod || '']); o.__rot = {}; Object.keys(nodes).forEach(id => { o.__rot[id] = nodes[id].rot || 0; }); o.__steps = Object.fromEntries(ST.map(s => [s.id, s.steps.map(st => [st.name, st.t])])); o.__ppl = Object.fromEntries(ST.map(s => [s.id, s.ppl || 1])); o.__cover = Object.fromEntries(ST.map(s => [s.id, s.cover || ''])); o.__plan = JSON.parse(JSON.stringify(dayPlan)); o.__planStart = planStart; o.__floors = JSON.parse(JSON.stringify(customFloors)); o.__access = accessPts.map(a => [a.x, a.z]); o.__elev = [EL[0], EL[1]]; o.__racks = racks.map(r => [r.x, r.z, r.g.rotation.y || 0]); o.__extras = extraSnap(); o.__flow = flowArrows.map(a => [a.from, a.to]); o.__areas = areas.map(a => [a.kind, +a.x.toFixed(2), +a.z.toFixed(2), a.rot || 0]); o.__rwps = returnWps.map(w => [w.x, w.z]); o.__rwps2 = returnWps2.map(w => [w.x, w.z]); o.__wps3 = cart3Waypoints.map(w => [w.x, w.z]); o.__rwps3 = returnWps3.map(w => [w.x, w.z]); o.__ends = [retEnd, retEnd2, retEnd3].map(e => e ? [e.x, e.z] : null); o.__fwps = prodWps.map(l => l.map(w => [w.x, w.z])); o.__fstart = prodStart.slice(); o.__dayMin = dayMin; o.__products = JSON.parse(JSON.stringify(lineProducts)); o.__baseSteps = JSON.parse(JSON.stringify(baseSteps)); o.__boxZone = [boxZone.x, boxZone.z, boxZone.w, boxZone.d]; o.__names = Object.fromEntries(ST.map(s2 => [s2.id, s2.title])); return o;
}
// In-memory mirror so the layout survives even when localStorage is blocked
// (Safari / file:// often refuses to persist) — bake reads THIS, never storage.
let __workingLayout = {};
/* ---- undo: every saveLayout() records the previous state; Ctrl/Cmd+Z (or the
   ↩ Undo button) restores it. Stack capped at 50 steps. ---- */
var undoStack = [], undoApplying = false;
function refreshUndoBtn() { const b = document.getElementById('undoBtn'); if (b) b.style.opacity = undoStack.length ? '1' : '0.45'; }
function saveLayout() {
  if (typeof syncProductSteps === 'function') syncProductSteps();   // Edit-times edits belong to the active product
  const next = buildWorkingLayout();
  try {
    if (!undoApplying && Object.keys(__workingLayout).length && JSON.stringify(next) !== JSON.stringify(__workingLayout)) {
      undoStack.push(__workingLayout); if (undoStack.length > 50) undoStack.shift(); refreshUndoBtn();
    }
  } catch (e) {}
  __workingLayout = next;
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(next)); } catch (e) {}
  try { cloudQueueWorking(); } catch (e) {}   // shared store (when configured): debounce-push so everyone gets it
  try { refreshProdFlow(); } catch (e) {}   // catch-all: any layout mutation may move a forklift access — re-route the furniture lanes
}
function undoLayout() {
  if (!undoStack.length) return;
  const prev = undoStack.pop();
  undoApplying = true;
  try {
    clearExtras();
    helpArrows = []; buildHelp();                            // applyWorkingLayout skips an empty __help, so clear first
    applyWorkingLayout(prev);
    __workingLayout = prev;
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(prev)); } catch (e) {}
    try { cloudQueueWorking(); } catch (e) {}
    renderTimes(); schedule(); if (typeof buildSolaSched === 'function') buildSolaSched();
    try { renderIdle(); renderHelpPanel(); } catch (e) {}
    T = 0; Ts = 0; setPlay(false);
  } finally { undoApplying = false; }
  refreshUndoBtn();
}
window.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
    const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;   // keep native text undo
    e.preventDefault(); undoLayout();
  }
});
function applyWorkingLayout(o) {   // apply a working-layout object to the LIVE scene (shared by load + import)
  if (!o) return; if (o.__names) Object.entries(o.__names).forEach(([id, nm]) => { const st2 = getAny(id); if (st2 && nm && st2.title !== nm) setStationTitle(id, nm); }); if (Array.isArray(o.__areas)) restoreAreas(o.__areas); if (Array.isArray(o.__floors)) restoreFloors(o.__floors); restoreExtras(o.__extras); if (Array.isArray(o.__boxZone)) { boxZone = { x: o.__boxZone[0], z: o.__boxZone[1], w: o.__boxZone[2], d: o.__boxZone[3] }; refreshBoxZone(); } if (Array.isArray(o.__rwps)) returnWps = o.__rwps.map(a => ({ x: a[0], z: a[1] })); if (Array.isArray(o.__rwps2)) returnWps2 = o.__rwps2.map(a => ({ x: a[0], z: a[1] })); if (Array.isArray(o.__rwps3)) returnWps3 = o.__rwps3.map(a => ({ x: a[0], z: a[1] })); if (Array.isArray(o.__wps)) cartWaypoints = o.__wps.map(a => ({ x: a[0], z: a[1] })); if (Array.isArray(o.__wps2)) { cart2Waypoints = o.__wps2.map(a => ({ x: a[0], z: a[1] })); refreshCart2Feed(); } if (Array.isArray(o.__wps3)) { cart3Waypoints = o.__wps3.map(a => ({ x: a[0], z: a[1] })); } if (Array.isArray(o.__ends)) { const e = o.__ends; retEnd = e[0] ? { x: e[0][0], z: e[0][1] } : null; retEnd2 = e[1] ? { x: e[1][0], z: e[1][1] } : null; retEnd3 = e[2] ? { x: e[2][0], z: e[2][1] } : null; } if (Array.isArray(o.__fwps)) prodWps = [0, 1, 2].map(i => (o.__fwps[i] || []).map(a => ({ x: a[0], z: a[1] }))); if (Array.isArray(o.__fstart)) prodStart = [0, 1, 2].map(i => o.__fstart[i] || null); if (typeof o.__dayMin === 'number' && o.__dayMin > 0) dayMin = o.__dayMin; if (o.__products && o.__products.meritage) mergeProducts(o.__products); if (o.__baseSteps) baseSteps = o.__baseSteps; refreshCart3Feed(); if (Array.isArray(o.__help) && o.__help.length) { helpArrows = o.__help.map(a => ({ from: a[0], to: a[1], helpMin: a[2] || 0, fromIdx: a[3] || 0, prod: a[4] || null })); buildHelp(); } if (Array.isArray(o.__flow)) restoreFlow(o.__flow); Object.keys(o).forEach(id => { if (id !== '__wps' && id !== '__help' && id !== '__rot' && nodes[id]) setStationPos(id, o[id][0], o[id][1]); }); if (o.__rot) Object.keys(o.__rot).forEach(id => { if (nodes[id]) setStationRot(id, o.__rot[id]); }); if (o.__steps) { ST.forEach(s => { if (o.__steps[s.id]) { s.steps = o.__steps[s.id].map(a => ({ name: a[0], t: +a[1] || 0 })); recalc(s.id); } }); renderTimes(); } if (o.__cover) { ST.forEach(s => { s.cover = o.__cover[s.id] || null; }); } if (o.__ppl) { ST.forEach(s => { if (o.__ppl[s.id] != null) { s.ppl = o.__ppl[s.id]; } }); } ST.forEach(s => { rebuildCrew(s.id); placeStation(s.id); }); renderTimes(); if (o.__plan && typeof o.__plan === 'object') { dayPlan = { meritage: o.__plan.meritage || [], sola: o.__plan.sola || [], canyon: o.__plan.canyon || [] }; } if (typeof o.__planStart === 'number') planStart = o.__planStart; if (typeof renderPlanner === 'function') renderPlanner(); if (Array.isArray(o.__access)) { clearAccess(); o.__access.forEach(p => addAccess(p[0], p[1])); } if (Array.isArray(o.__elev)) moveElevator(o.__elev[0], o.__elev[1]); if (Array.isArray(o.__racks)) { clearRacks(); o.__racks.forEach(p => addRack(p[0], p[1], p[2])); } extraStations.forEach(applyLineAccent); if (typeof refreshProdFlow === 'function') refreshProdFlow(); if (typeof applyLineFocus === 'function') applyLineFocus();
}
let hadSavedLayout = false;   // true when ANY layout (localStorage or baked) was loaded — defaults must then keep their hands off
function loadLayout() { try { let o = null; try { o = JSON.parse(localStorage.getItem(LAYOUT_KEY)); } catch (e) {} if (!o && window.__M3D_LAYOUT__) o = window.__M3D_LAYOUT__;   // baked-in working layout (travels with the file)
  hadSavedLayout = !!o; applyWorkingLayout(o); } catch (e) {} }

// 1-yard grid on the deck
function buildGrid() {
  const g = new THREE.Group(); g.visible = false;
  const y = FLOOR2 + 0.04;
  const minor = new THREE.LineBasicMaterial({ color: 0x9aa6b2, transparent: true, opacity: 0.45 });
  const major = new THREE.LineBasicMaterial({ color: 0x33414f, transparent: true, opacity: 0.8 });
  const vp = [], vpM = [], hp = [], hpM = [];
  const GX0 = FLOOR_X0, GX1 = FLOOR_X1, GZ0 = FLOOR_Z0, GZ1 = FLOOR_Z1;   // cover the whole 35 x 21 yd floor
  let i = 0;
  for (let x = GX0; x <= GX1 + 1e-6; x += YARD, i++) { (i % 5 === 0 ? vpM : vp).push(x, y, GZ0, x, y, GZ1); }
  i = 0;
  for (let z = GZ0; z <= GZ1 + 1e-6; z += YARD, i++) { (i % 5 === 0 ? hpM : hp).push(GX0, y, z, GX1, y, z); }
  const mk = (pts, mat) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); return new THREE.LineSegments(geo, mat); };
  g.add(mk(vp, minor), mk(hp, minor), mk(vpM, major), mk(hpM, major));
  // yard ruler labels every 5 yd along the near edges
  const mkLbl = (txt, wx, wz) => {
    const c = document.createElement('canvas'); c.width = 96; c.height = 48; const cx = c.getContext('2d');
    cx.fillStyle = '#1d3a66'; cx.font = '700 30px Arial'; cx.textAlign = 'center'; cx.fillText(txt, 48, 34);
    const tex = new THREE.CanvasTexture(c); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set(2.0, 1.0, 1); sp.position.set(wx, y + 0.2, wz); g.add(sp);
  };
  let yd = 0;
  for (let x = GX0; x <= GX1 + 1e-6; x += 5 * YARD, yd += 5) mkLbl(yd + 'yd', x, GZ1 + 0.7);
  yd = 0;
  for (let z = GZ0; z <= GZ1 + 1e-6; z += 5 * YARD, yd += 5) mkLbl(yd + 'yd', GX0 - 0.7, z);
  return g;
}
const grid = buildGrid(); scene.add(grid);

// dynamic measurement lines from the dragged station to all others
const measureMat = new THREE.LineBasicMaterial({ color: 0xc0552c });
const measureGeo = new THREE.BufferGeometry();
const measure = new THREE.LineSegments(measureGeo, measureMat); measure.visible = false; scene.add(measure);

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const deckPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(FLOOR2 - 0.0)); // y = FLOOR2
let editing = false, dragId = null, savedView = null;
const stList = () => [...ST.map(s => nodes[s.id]), ...extraStations.map(id => nodes[id]), nodes.cart, nodes.cart2, nodes.cart3].filter(n => n && n.st);
const measurePanel = document.getElementById('measure');
const editBtn = document.getElementById('edit');

document.getElementById('addStation').onclick = () => {
  const name = (prompt('New station name:', 'New station') || '').trim();
  if (!name) return;
  const n = extraStations.length;
  const x = 16, z = -5 + n * 2.5;                               // drop in the open area on the OTHER (right) side; drag it anywhere
  addStation(name, x, z);
  if (!editing) setEditing(true);                               // enter edit mode so you can drag it where you want
  renderTimes();                                               // show it in the side's steps table
  saveLayout();
};

function pointerNDC(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
}
function pickStation(e) {
  pointerNDC(e); raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(stList().map(n => n.st), true);
  if (!hits.length) return null;
  let o = hits[0].object;
  while (o) { const f = stList().find(n => n.st === o); if (f) return f.s.id; o = o.parent; }
  return null;
}
function deckPoint(e) {
  pointerNDC(e); raycaster.setFromCamera(ndc, camera);
  const p = new THREE.Vector3();
  return raycaster.ray.intersectPlane(deckPlane, p) ? p : null;
}
function refreshMeasure() {
  if (!dragId) { measure.visible = false; measurePanel.innerHTML = ''; return; }
  const a = nodes[dragId]; const pts = [];
  const linked = new Set(linkSet(dragId));
  const rows = [];
  const targets = ST.concat([{ id: 'cart', title: 'Materials cart' }]);
  targets.forEach(s => {
    if (s.id === dragId) return; const b = nodes[s.id]; if (!b) return;
    const lk = linked.has(s.id);
    if (lk) pts.push(a.x, FLOOR2 + 0.06, a.z, b.x, FLOOR2 + 0.06, b.z);  // only draw lines to linked tables
    rows.push({ t: s.title, y: u2y(Math.hypot(a.x - b.x, a.z - b.z)), lk });
  });
  measureGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  measureGeo.computeBoundingSphere(); measure.visible = pts.length > 0;
  rows.sort((p, q) => (q.lk - p.lk) || (p.y - q.y));
  measurePanel.innerHTML = `<h4>${nodes[dragId].s.title}</h4><div class="mhint">▸ linked = distance counts</div>` +
    rows.map(r => `<div class="mr ${r.lk ? 'lk' : 'no'}"><span>${r.lk ? '▸ ' : ''}${r.t}</span><b>${r.y.toFixed(1)} yd</b></div>`).join('');
}
function setEditing(on) {
  editing = on;
  editBtn.textContent = on ? '✓ Done editing' : '✥ Edit layout';
  editBtn.classList.toggle('on', on);
  grid.visible = on;
  pathLine.visible = on; wpGroup.visible = on; wpGroup2.visible = on; wpGroup3.visible = on; prodWpGroup.visible = on;
  aisleMesh.visible = on && aisleOn; aisleMesh2.visible = on && aisleOn; aisleMesh3.visible = on && aisleOn;   // blue 5' lanes: only in edit mode, and only if the Lanes toggle is on
  returnLine.visible = on; returnLine2.visible = on; returnLine3.visible = on; // amber dashed = return leg back to the elevator
  if (boxZoneHandle) boxZoneHandle.visible = on;     // the box-storage resize handle only shows while editing
  if (on) { refreshPath(); refreshCart2Feed(); refreshCart3Feed(); }
  refreshProdFlow();                                 // green furniture-flow lanes show/hide with edit mode
  if (typeof applyLineFocus === 'function') applyLineFocus();   // re-apply the line focus over the edit-mode visibilities
  if (!on) { helpArming = false; armSource = null; const hb = document.getElementById('helparrow'); if (hb) hb.classList.remove('on'); if (typeof setFlowArming === 'function') setFlowArming(false); }
  if (on) {
    // keep zoom + pan in edit mode, but disable rotate and free the left button for dragging stations
    controls.enabled = true; controls.enableRotate = false; controls.enableZoom = true; controls.enablePan = true;
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };   // drag empty floor to pan; grabbing a station disables pan for that drag
    controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_PAN };
  } else {
    controls.enabled = true; controls.enableRotate = !is2D; controls.enableZoom = true; controls.enablePan = true;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  }
  measurePanel.style.display = on ? 'block' : 'none';
  document.getElementById('editHint').style.display = on ? 'block' : 'none';
  if (on) {
    setPlay(false);
    if (!is2D) {                                             // in 2D the plan view stays exactly as-is
      savedView = { p: camera.position.clone(), t: controls.target.clone() };
      camera.position.set((DECK.x0 + DECK.x1) / 2, FLOOR2 + 46, (DECK.z0 + DECK.z1) / 2 + 0.01);
      controls.target.set((DECK.x0 + DECK.x1) / 2, FLOOR2, (DECK.z0 + DECK.z1) / 2);
      camera.lookAt(controls.target);
    }
  } else {
    dragId = null; measure.visible = false; measurePanel.innerHTML = '';
    if (elevHidden) setElevHidden(false);            // always bring the elevator back when leaving Edit Layout
    if (typeof setCadOverlay === 'function') setCadOverlay(false);   // the CAD overlay is an edit-only comparison aid
    if (!is2D && savedView) { camera.position.copy(savedView.p); controls.target.copy(savedView.t); }
    // settle crew back home
    crew.forEach(c => { c.fig.position.x = c.homeX; c.fig.position.z = c.homeZ; });
    saveLayout();
  }
}
editBtn.onclick = () => setEditing(!editing);
let dragWp = null, helpArming = false, armSource = null, selectedStation = null, dragFix = null, flowArming = false, flowSource = null, dragFenceR = null;
function pickWaypoint(e) {
  pointerNDC(e); raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects([...wpGroup.children, ...wpGroup2.children, ...wpGroup3.children, ...prodWpGroup.children, ...(endpointsOn ? endGroup.children : [])], false);
  return hits.length ? hits[0].object.userData : null;   // { cart, wp } or { cart:'end*' } or null
}
function fixtureList() {   // draggable non-station objects: access points, racks, then the elevator
  const arr = [];
  accessPts.forEach(a => arr.push({ root: a.g, kind: 'access', ref: a, set: (x, z) => { a.x = x; a.z = z; a.g.position.set(x, 0, z); } }));
  racks.forEach(r => arr.push({ root: r.g, kind: 'rack', ref: r, set: (x, z) => { r.x = x; r.z = z; r.g.position.set(x, 0, z); } }));
  if (surroundings.visible) areas.forEach(a => arr.push({ root: a.g, kind: 'area', ref: a, set: (x, z) => { a.x = x; a.z = z; a.g.position.set(x, 0, z); } }));   // surrounding staging areas
  arr.push({ root: boxZoneG, kind: 'boxzone', set: (x, z) => { boxZone.x = x; boxZone.z = z; refreshBoxZone(); } });   // the drawable box-storage zone
  arr.push({ root: elevator.shaft, kind: 'elev', set: (x, z) => moveElevator(x, z) });
  return arr;
}
function pickFixture(e) {
  pointerNDC(e); raycaster.setFromCamera(ndc, camera);
  const list = fixtureList();
  const hits = raycaster.intersectObjects(list.map(f => f.root), true);
  if (!hits.length) return null;
  const shits = raycaster.intersectObjects(stList().map(n => n.st), true);   // a station overlapping an area wins the grab (bench sits above the flat pad)
  if (shits.length && shits[0].distance < hits[0].distance + 0.05) return null;
  let o = hits[0].object;
  while (o) { const idx = list.findIndex(f => f.root === o); if (idx >= 0) return idx; o = o.parent; }
  return null;
}
const helpBtn = document.getElementById('helparrow');
helpBtn.onclick = () => {
  if (!editing) setEditing(true);
  helpArming = !helpArming; armSource = null;
  if (helpArming) setFlowArming(false);              // only one arming tool at a time
  helpBtn.classList.toggle('on', helpArming);
  helpBtn.textContent = helpArming ? '➤ click FROM → TO' : '➤ Help arrow';
};
const flowBtn = document.getElementById('flowarrow');
function setFlowArming(on) {
  flowArming = on; flowSource = null;
  flowBtn.classList.toggle('on', on);
  flowBtn.textContent = on ? '⇢ click FROM → TO' : '⇢ Flow line';
}
flowBtn.onclick = () => {
  if (!editing) setEditing(true);
  if (!flowArming) { helpArming = false; helpBtn.classList.remove('on'); helpBtn.textContent = '➤ Help arrow'; }
  setFlowArming(!flowArming);
};
const snap = v => Math.round(v / (YARD / 2)) * (YARD / 2);   // snap to 0.5 yd
renderer.domElement.addEventListener('pointerdown', e => {
  if (!editing) return;
  if (cadOn && cadOverlay && (e.shiftKey || e.button === 2)) {   // Shift-drag (or right-drag) moves the CAD overlay to align it
    const p = deckPoint(e); if (p) { cadDragging = { sx: p.x, sz: p.z, ox: cadOverlay.g.position.x, oz: cadOverlay.g.position.z }; controls.enabled = false; e.preventDefault(); return; }
  }
  {                                                    // grab the box-storage zone's corner handle → resize (draw) the zone
    const p = deckPoint(e);
    if (p && Math.abs(p.x - (boxZone.x + boxZone.w / 2)) < 0.8 && Math.abs(p.z - (boxZone.z + boxZone.d / 2)) < 0.8) {
      boxResizing = true; controls.enabled = false; renderer.domElement.setPointerCapture(e.pointerId); return;
    }
  }
  if (flowArming) {                                   // drawing a part-flow arrow: pick FROM, then TO
    const sid = pickStation(e); if (!sid) return;
    if (!flowSource) { flowSource = sid; }
    else { if (sid !== flowSource && !flowArrows.some(a => a.from === flowSource && a.to === sid)) {
        flowArrows.push({ from: flowSource, to: sid }); buildFlow(); buildSolaSched(); saveLayout();
      } flowSource = null; }
    return;
  }
  if (helpArming) {                                   // drawing a help arrow: pick source, then target
    const sid = pickStation(e); if (!sid) return;
    if (!armSource) { armSource = sid; }
    else { if (sid !== armSource) {
        const fs = getAny(armSource); const ppl = (fs && fs.ppl) || 1;
        const used = new Set(helpArrows.filter(a => a.from === armSource && arrowOn(a)).map(a => a.fromIdx || 0));
        let fromIdx = ppl - 1; for (let i = 0; i < ppl; i++) { if (!used.has(i)) { fromIdx = i; break; } }   // next free operator at this station (per product)
        const hp = activeProduct(stLineOf(armSource));   // new arrows belong to whatever this line is building right now
        helpArrows.push({ from: armSource, fromIdx, to: sid, helpMin: Math.min(5, +availIdleAny(armSource, fromIdx).toFixed(1)), prod: hp ? hp.name : null });
        buildHelp(); schedule(); buildSolaSched(); renderIdle(); renderSolaData(); renderHelpPanel(); saveLayout();   // re-pace both lines (a Sola help arrow affects the Sola flow-shop)
      } armSource = null; }
    return;
  }
  const fi = pickFixture(e);
  if (fi != null) { dragFix = fi; controls.enabled = false; renderer.domElement.setPointerCapture(e.pointerId); return; }   // grabbed something -> don't pan
  const wp = pickWaypoint(e);
  if (wp != null) { dragWp = wp; controls.enabled = false; renderer.domElement.setPointerCapture(e.pointerId); return; }
  const id = pickStation(e);
  if (id) {
    dragId = id; selectedStation = id; controls.enabled = false; renderer.domElement.setPointerCapture(e.pointerId); refreshMeasure();
    // fence the drag inside the table's OWN line slice — a table can't drift
    // across a CAD boundary by accident. Hold SHIFT while dragging to cross on purpose.
    dragFenceR = sectionOf(nodes[id].x, nodes[id].z);
  }
  // else: clicked empty floor -> OrbitControls pans the camera
});
document.getElementById('rotbtn').onclick = () => {
  if (!editing) setEditing(true);
  if (!selectedStation) return;
  setStationRot(selectedStation, ((nodes[selectedStation].rot || 0) + Math.PI / 2) % (Math.PI * 2));
  saveLayout();
};
renderer.domElement.addEventListener('pointermove', e => {
  if (!editing) return;
  const p = deckPoint(e); if (!p) return;
  if (cadDragging) { cadOverlay.g.position.x = cadDragging.ox + (p.x - cadDragging.sx); cadOverlay.g.position.z = cadDragging.oz + (p.z - cadDragging.sz); return; }
  if (boxResizing) {                                   // draw the zone: NW corner stays pinned, the dragged SE corner sets width/depth
    const x0 = boxZone.x - boxZone.w / 2, z0 = boxZone.z - boxZone.d / 2;
    const w = Math.max(2.2, snap(p.x) - x0), d = Math.max(1.4, snap(p.z) - z0);
    boxZone.w = w; boxZone.d = d; boxZone.x = x0 + w / 2; boxZone.z = z0 + d / 2;
    refreshBoxZone(); return;
  }
  if (dragFix != null) {   // fixtures + surrounding areas can sit anywhere on the warehouse floor
    const f = fixtureList()[dragFix];
    if (f) f.set(Math.max(FLOOR_X0 - 1.2, Math.min(FLOOR_X1 + 1.2, snap(p.x))), Math.max(FLOOR_Z0 - 0.5, Math.min(FLOOR_Z1 + 0.5, snap(p.z))));
    if (f && (f.kind === 'access' || f.kind === 'elev' || f.kind === 'area')) refreshProdFlow();   // furniture lanes end at the nearest access point / forklift area — track it
    return;
  }
  const cx = Math.max(FLOOR_X0 + 0.6, Math.min(FLOOR_X1 - 0.6, snap(p.x)));   // stations + waypoints can go ANYWHERE on the 35x21 floor (side strips included)
  const cz = Math.max(FLOOR_Z0 + 0.6, Math.min(FLOOR_Z1 - 0.6, snap(p.z)));
  if (dragWp != null) {
    if (dragWp.cart === 'cart2') { cart2Waypoints[dragWp.wp] = { x: cx, z: cz }; refreshCart2Feed(); }
    else if (dragWp.cart === 'cart3') { cart3Waypoints[dragWp.wp] = { x: cx, z: cz }; refreshCart3Feed(); }
    else if (dragWp.cart === 'ret') { returnWps[dragWp.wp] = { x: cx, z: cz }; refreshPath(); }
    else if (dragWp.cart === 'ret2') { returnWps2[dragWp.wp] = { x: cx, z: cz }; refreshCart2Feed(); }
    else if (dragWp.cart === 'ret3') { returnWps3[dragWp.wp] = { x: cx, z: cz }; refreshCart3Feed(); }
    else if (dragWp.cart === 'end') { retEnd = { x: cx, z: cz }; refreshPath(); }
    else if (dragWp.cart === 'end2') { retEnd2 = { x: cx, z: cz }; refreshCart2Feed(); }
    else if (dragWp.cart === 'end3') { retEnd3 = { x: cx, z: cz }; refreshCart3Feed(); }
    else if (dragWp.cart && dragWp.cart.startsWith('pf')) { prodWps[+dragWp.cart[2]][dragWp.wp] = { x: cx, z: cz }; refreshProdFlow(); }
    else { cartWaypoints[dragWp.wp] = { x: cx, z: cz }; refreshPath(); }
    return;
  }
  if (!dragId) return;
  let x = Math.max(FLOOR_X0 + 1.4, Math.min(FLOOR_X1 - 1.4, cx));        // stations can sit ANYWHERE on the floor — side strips included
  const z = Math.max(FLOOR_Z0 + 1.4, Math.min(FLOOR_Z1 - 1.4, cz));
  if (dragFenceR && !e.shiftKey) {                                        // fenced inside its line at the CAD boundary for THIS z (the lines jog)
    const bS = SOLA_BX(z), bC = CANYON_BX(z);
    if (dragFenceR === 'meritage') x = Math.min(x, bS - 0.35);
    else if (dragFenceR === 'sola') x = Math.max(bS + 0.35, Math.min(bC - 0.35, x));
    else x = Math.max(bC + 0.35, x);
  } else if (e.shiftKey) dragFenceR = null;                               // once you cross with Shift, the fence re-arms on the next grab
  setStationPos(dragId, x, z);
  refreshMeasure(); refreshPath(); if (dragId === 'cart2') refreshCart2Feed(); if (dragId === 'cart3') refreshCart3Feed(); refreshProdFlow();
  if (cadOn) rebuildMyMarks();   // keep the teal "mine" markers on the bench as it moves
  schedule();                 // walk times + cycle/capacity update live as you move
});
renderer.domElement.addEventListener('pointerup', () => {
  if (cadDragging) { cadDragging = false; if (editing) controls.enabled = true; return; }
  if (boxResizing) { boxResizing = false; if (editing) controls.enabled = true; saveLayout(); return; }
  if (editing) controls.enabled = true;                  // re-enable camera pan after a station/waypoint drag
  if (dragFix != null) { dragFix = null; saveLayout(); }
  if (dragWp != null) { dragWp = null; saveLayout(); }
  if (dragId) { if (isExtra(dragId)) applyLineAccent(dragId); dragId = null; dragFenceR = null; measure.visible = false; measurePanel.innerHTML = ''; renderTimes(); saveLayout(); }   // a Shift-drag across a boundary re-files the table + recolors its label
});
// right-click a waypoint to delete it; right-click a station to delete its help arrows
renderer.domElement.addEventListener('contextmenu', e => {
  if (!editing) return;
  e.preventDefault();                                  // no browser menu while editing
  if (pickElevatorOrGhost(e)) { setElevHidden(!elevHidden); return; }   // right-click the elevator to hide it (path stays); right-click its ghost to show it
  const fi = pickFixture(e);
  if (fi != null) {   // delete access point or rack on right-click
    const f = fixtureList()[fi];
    if (f.kind === 'access') { level2.remove(f.ref.g); const i=forkLifts.indexOf(f.ref.rec); if(i>=0) forkLifts.splice(i,1); accessPts.splice(accessPts.indexOf(f.ref), 1); saveLayout(); return; }
    if (f.kind === 'rack') { level2.remove(f.ref.g); racks.splice(racks.indexOf(f.ref), 1); saveLayout(); return; }
    if (f.kind === 'area') { dropForkRec(f.ref.g); surroundings.remove(f.ref.g); areas.splice(areas.indexOf(f.ref), 1); saveLayout(); return; }
  }
  const wp = pickWaypoint(e);
  if (wp != null) {
    if (wp.cart === 'cart2') { cart2Waypoints.splice(wp.wp, 1); refreshCart2Feed(); }
    else if (wp.cart === 'cart3') { cart3Waypoints.splice(wp.wp, 1); refreshCart3Feed(); }
    else if (wp.cart === 'ret') { returnWps.splice(wp.wp, 1); refreshPath(); }
    else if (wp.cart === 'ret2') { returnWps2.splice(wp.wp, 1); refreshCart2Feed(); }
    else if (wp.cart === 'ret3') { returnWps3.splice(wp.wp, 1); refreshCart3Feed(); }
    else if (wp.cart === 'end') { retEnd = null; refreshPath(); }        // right-click endpoint → snap back to the elevator
    else if (wp.cart === 'end2') { retEnd2 = null; refreshCart2Feed(); }
    else if (wp.cart === 'end3') { retEnd3 = null; refreshCart3Feed(); }
    else if (wp.cart && wp.cart.startsWith('pf')) { prodWps[+wp.cart[2]].splice(wp.wp, 1); refreshProdFlow(); }
    else { cartWaypoints.splice(wp.wp, 1); refreshPath(); }
    saveLayout(); return;
  }
  const id = pickStation(e);
  if (id && flowArrows.some(a => a.from === id || a.to === id)) {   // right-click a station clears its flow lines first
    flowArrows = flowArrows.filter(a => a.from !== id && a.to !== id); buildFlow(); buildSolaSched(); saveLayout(); return;
  }
  if (id && helpArrows.some(a => a.from === id || a.to === id)) {
    helpArrows = helpArrows.filter(a => a.from !== id && a.to !== id); buildHelp(); schedule(); buildSolaSched(); renderIdle(); renderSolaData(); saveLayout();
  }
});
// add a waypoint at the midpoint of the current path — for whichever cart was last selected
document.getElementById('addwp').onclick = () => {
  if (!editing) setEditing(true);
  if (selectedStation === 'cart2') {
    const a = cart2Waypoints.length ? cart2Waypoints[cart2Waypoints.length - 1] : { x: EL[0], z: EL[1] };
    cart2Waypoints.push({ x: (a.x + nodes.cart2.x) / 2, z: (a.z + nodes.cart2.z) / 2 });
    refreshCart2Feed();
  } else if (selectedStation === 'cart3') {
    const a = cart3Waypoints.length ? cart3Waypoints[cart3Waypoints.length - 1] : { x: EL[0], z: EL[1] };
    cart3Waypoints.push({ x: (a.x + nodes.cart3.x) / 2, z: (a.z + nodes.cart3.z) / 2 });
    refreshCart3Feed();
  } else {
    const a = cartWaypoints.length ? cartWaypoints[cartWaypoints.length - 1] : { x: EL[0], z: EL[1] };
    cartWaypoints.push({ x: (a.x + nodes.cart.x) / 2, z: (a.z + nodes.cart.z) / 2 });
    refreshPath();
  }
  saveLayout();
};
// "⟲ Return wp" button (injected next to ＋ Cart waypoint): adds a draggable
// waypoint on the RETURN leg (cart spot → elevator) of the last-selected cart,
// so the aisle loop can be routed around the line.
(() => {
  const awp = document.getElementById('addwp'); if (!awp) return;
  const b = document.createElement('button');
  b.id = 'returnwp'; b.className = awp.className || '';
  b.textContent = '⟲ Return wp';
  b.title = 'Add a waypoint on the cart’s RETURN path (cart spot back to the elevator) — drag it to route the loop, right-click to delete';
  awp.parentNode.insertBefore(b, awp.nextSibling);
  b.onclick = () => {
    if (!editing) setEditing(true);
    if (selectedStation === 'cart2') {
      const a = returnWps2.length ? returnWps2[returnWps2.length - 1] : { x: nodes.cart2.x, z: nodes.cart2.z }; const e = endPt(2);
      returnWps2.push({ x: (a.x + e[0]) / 2, z: (a.z + e[1]) / 2 });
      refreshCart2Feed();
    } else if (selectedStation === 'cart3') {
      const a = returnWps3.length ? returnWps3[returnWps3.length - 1] : { x: nodes.cart3.x, z: nodes.cart3.z }; const e = endPt(3);
      returnWps3.push({ x: (a.x + e[0]) / 2, z: (a.z + e[1]) / 2 });
      refreshCart3Feed();
    } else {
      const a = returnWps.length ? returnWps[returnWps.length - 1] : { x: nodes.cart.x, z: nodes.cart.z }; const e = endPt(1);
      returnWps.push({ x: (a.x + e[0]) / 2, z: (a.z + e[1]) / 2 });
      refreshPath();
    }
    saveLayout();
  };
  // 🔵 Lanes toggle: show/hide the blue 5' aisle tint while in Edit Layout
  const lanes = document.createElement('button');
  lanes.id = 'lanesBtn'; lanes.className = awp.className || '';
  lanes.textContent = '🔵 Lanes: on';
  lanes.title = 'Show / hide the blue 5\'-wide cart lanes while editing the layout';
  const _grpView = document.getElementById('grpView');
  if (_grpView) _grpView.appendChild(lanes); else b.parentNode.insertBefore(lanes, b.nextSibling);
  lanes.onclick = () => {
    aisleOn = !aisleOn;
    lanes.textContent = '🔵 Lanes: ' + (aisleOn ? 'on' : 'off');
    aisleMesh.visible = editing && aisleOn; aisleMesh2.visible = editing && aisleOn; aisleMesh3.visible = editing && aisleOn;
    refreshProdFlow();
  };
  // ⚑ Endpoints toggle: show the marker at each cart line's END (elevator by
  // default). Turn it on to see which carts loop back to the elevator and which
  // don't; in Edit Layout, drag a marker to move that line's endpoint, right-click
  // it to snap back to the elevator.
  const ends = document.createElement('button');
  ends.id = 'endsBtn'; ends.className = awp.className || '';
  ends.textContent = '⚑ Endpoints: off';
  ends.title = 'Show the endpoint of each cart line. In Edit Layout, drag a marker to end that line somewhere other than the elevator; right-click to snap it back.';
  lanes.parentNode.insertBefore(ends, lanes.nextSibling);
  // 🛒 Run carts: preview the materials carts driving their delivery loops (edit mode)
  const rc = document.createElement('button');
  rc.id = 'runCartsBtn'; rc.className = awp.className || '';
  rc.textContent = '🛒 Run carts';
  const _grpRun = document.getElementById('grpRun');
  if (_grpRun) _grpRun.appendChild(rc); else ends.parentNode.insertBefore(rc, ends.nextSibling);
  rc.onclick = () => {                                 // works on the normal floor AND in Edit Layout
    if (cartDemoOn) { stopCartDemo(); return; }
    cartDemoOn = true; rc.textContent = '🛒 Carts: running'; rc.classList.add('on');
  };
  ends.onclick = () => {
    endpointsOn = !endpointsOn;
    ends.textContent = '⚑ Endpoints: ' + (endpointsOn ? 'on' : 'off');
    ends.classList.toggle('on', endpointsOn);
    refreshEnds();
  };
  // ⇊ Ship point: pin which table a line's green furniture lane starts from.
  // Click a Sola/Canyon table (in Edit Layout), then this button — that table
  // becomes the line's ship point (saved with the layout). Click again on the
  // same table to go back to automatic (flow-order) selection.
  const shipB = document.createElement('button');
  shipB.id = 'shipStartBtn'; shipB.className = awp.className || '';
  shipB.textContent = '⇊ Ship point';
  shipB.title = 'Choose which table each line\'s green furniture lane starts from';
  const _buildRow = document.getElementById('buildRow');
  if (_buildRow) _buildRow.appendChild(shipB); else ends.parentNode.insertBefore(shipB, ends.nextSibling);
  // a simple picker: one dropdown per line, listing that line's tables
  const shipPanel = document.createElement('div');
  shipPanel.id = 'shipPanel';
  shipPanel.style.cssText = 'position:fixed;display:none;z-index:60;background:#fff;border:1px solid #d8dee6;border-radius:12px;box-shadow:0 12px 30px rgba(20,30,45,.18);padding:12px 14px;font:12px/1.5 Arial,sans-serif;color:#15263a;min-width:260px;max-width:320px';
  document.body.appendChild(shipPanel);
  function renderShipPanel() {
    const opts = (sec, idx) => {
      const ids = extraStations.filter(id => nodes[id] && sectionOf(nodes[id].x, nodes[id].z) === sec);
      const cur = prodStart[idx];
      return `<select data-i="${idx}" style="width:100%;padding:5px;border:1px solid #c9d2dd;border-radius:6px;margin:2px 0 10px;font-size:12px">
        <option value="">Auto — last table in flow order</option>` +
        ids.map(id => `<option value="${id}"${cur === id ? ' selected' : ''}>${(nodes[id].s.title || id).replace(/</g, '&lt;')}</option>`).join('') +
        `</select>`;
    };
    shipPanel.innerHTML = `<b style="font-size:13px">⇊ Ship points</b>
      <div style="color:#5a6672;margin:2px 0 8px">Where each line's furniture lane starts.</div>
      <div style="color:#1d3a66;font-weight:700">MERITAGE</div><div style="margin:2px 0 10px">Cushions &amp; Pack (fixed)</div>
      <div style="color:#236043;font-weight:700">SOLA</div>${opts('sola', 1)}
      <div style="color:#9a5b1f;font-weight:700">CANYON CREW</div>${opts('canyon', 2)}
      <button id="shipClose" style="width:100%;padding:6px;border:1px solid #c9d2dd;border-radius:8px;background:#f2f6fb;cursor:pointer;font-weight:700">Done</button>`;
    shipPanel.querySelectorAll('select').forEach(s => s.onchange = e => { prodStart[+e.target.dataset.i] = e.target.value || null; refreshProdFlow(); saveLayout(); });
    const c = shipPanel.querySelector('#shipClose'); if (c) c.onclick = () => { shipPanel.style.display = 'none'; };
  }
  // 📦 Flow lanes: show/hide the green furniture lanes (the boxes still travel)
  const flB = document.createElement('button');
  flB.id = 'flowLanesBtn'; flB.className = shipB.className || '';
  flB.textContent = '📦 Flow lanes: on';
  if (_grpView) _grpView.appendChild(flB); else shipB.parentNode.insertBefore(flB, shipB.nextSibling);
  flB.onclick = () => {
    prodLanesOn = !prodLanesOn;
    flB.textContent = '📦 Flow lanes: ' + (prodLanesOn ? 'on' : 'off');
    flB.classList.toggle('on', !prodLanesOn);
    refreshProdFlow();
  };
  // ⏱ Available time per worker — drives takt and capacity everywhere
  const avB = document.createElement('button');
  avB.id = 'availBtn'; avB.className = shipB.className || '';
  avB.textContent = '⏱ Avail time';
  const _grpAn = document.getElementById('grpAnalyze');
  if (_grpAn) _grpAn.appendChild(avB); else flB.parentNode.insertBefore(avB, flB.nextSibling);
  const avPanel = document.createElement('div');
  avPanel.id = 'availPanel';
  avPanel.style.cssText = 'position:fixed;display:none;z-index:60;background:#fff;border:1px solid #d8dee6;border-radius:12px;box-shadow:0 12px 30px rgba(20,30,45,.18);padding:12px 14px;font:12px/1.5 Arial,sans-serif;color:#15263a;min-width:250px';
  document.body.appendChild(avPanel);
  avB.onclick = () => {
    if (avPanel.style.display === 'block') { avPanel.style.display = 'none'; return; }
    avPanel.innerHTML = `<b style="font-size:13px">⏱ Available time per worker</b>
      <div style="display:flex;gap:6px;align-items:center;margin:8px 0 2px"><input id="avMin" type="number" min="60" max="960" step="15" value="${dayMin}" style="width:84px;padding:5px;border:1px solid #c9d2dd;border-radius:6px"/><span>min / day</span></div>
      <div style="color:#8a93a0;font-size:11px;margin:2px 0 8px">e.g. 480 shift − breaks = 420. Sets takt (= time ÷ demand), capacity and units/day everywhere.</div>
      <button id="avClose" style="width:100%;padding:6px;border:1px solid #c9d2dd;border-radius:8px;background:#f2f6fb;cursor:pointer;font-weight:700">Done</button>`;
    avPanel.querySelector('#avMin').onchange = e => { dayMin = Math.max(60, Math.min(960, +e.target.value || 420)); reflowAll(); };
    avPanel.querySelector('#avClose').onclick = () => { avPanel.style.display = 'none'; };
    const r = avB.getBoundingClientRect();
    avPanel.style.left = Math.max(8, Math.min(window.innerWidth - 280, r.left)) + 'px';
    avPanel.style.top = (r.bottom + 8) + 'px';
    avPanel.style.display = 'block';
  };
  shipB.onclick = () => {
    if (shipPanel.style.display === 'block') { shipPanel.style.display = 'none'; return; }
    renderShipPanel();
    const r = shipB.getBoundingClientRect();
    shipPanel.style.left = Math.max(8, Math.min(window.innerWidth - 330, r.left)) + 'px';
    shipPanel.style.top = (r.bottom + 8) + 'px';
    shipPanel.style.display = 'block';
  };
})();
// Double-click ON a lane (in Edit Layout) to add a waypoint exactly there.
// Works on every leg: the way OUT to a cart spot (green) and the way BACK to
// the elevator (amber) — the waypoint is inserted into the right spot in the
// sequence, so the lane bends where you clicked.
function segClosest(px, pz, ax, az, bx2, bz2) {
  const dx = bx2 - ax, dz = bz2 - az, L2 = dx * dx + dz * dz || 1e-9;
  let t = ((px - ax) * dx + (pz - az) * dz) / L2; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
renderer.domElement.addEventListener('dblclick', e => {
  if (!editing) return;
  const p = deckPoint(e); if (!p) return;
  const legs = [
    { pts: [[EL[0], EL[1]], ...cartWaypoints.map(w => [w.x, w.z]), [nodes.cart.x, nodes.cart.z]], arr: cartWaypoints, refresh: refreshPath },
    { pts: [[nodes.cart.x, nodes.cart.z], ...returnWps.map(w => [w.x, w.z]), endPt(1)], arr: returnWps, refresh: refreshPath },
    { pts: [[EL[0], EL[1]], ...cart2Waypoints.map(w => [w.x, w.z]), [nodes.cart2.x, nodes.cart2.z]], arr: cart2Waypoints, refresh: refreshCart2Feed },
    { pts: [[nodes.cart2.x, nodes.cart2.z], ...returnWps2.map(w => [w.x, w.z]), endPt(2)], arr: returnWps2, refresh: refreshCart2Feed },
    { pts: [[EL[0], EL[1]], ...cart3Waypoints.map(w => [w.x, w.z]), [nodes.cart3.x, nodes.cart3.z]], arr: cart3Waypoints, refresh: refreshCart3Feed },
    { pts: [[nodes.cart3.x, nodes.cart3.z], ...returnWps3.map(w => [w.x, w.z]), endPt(3)], arr: returnWps3, refresh: refreshCart3Feed },
  ];
  for (let i = 0; i < 3; i++) { const pp = prodPts(i); if (pp) legs.push({ pts: pp, arr: prodWps[i], refresh: refreshProdFlow }); }   // green furniture-flow lanes take dblclick waypoints too
  let best = null;
  legs.forEach(leg => {
    for (let i = 0; i < leg.pts.length - 1; i++) {
      const d = segClosest(p.x, p.z, leg.pts[i][0], leg.pts[i][1], leg.pts[i + 1][0], leg.pts[i + 1][1]);
      if (!best || d < best.d - 1e-6) best = { d, leg, i };   // near-ties keep the earlier leg (delivery beats return where the lanes overlap)
    }
  });
  if (!best || best.d > 4) return;                           // not near any lane
  best.leg.arr.splice(best.i, 0, { x: snap(p.x), z: snap(p.z) });   // insert INTO the clicked segment
  best.leg.refresh(); saveLayout();
});
// mention it in the edit hint
(() => { const h = document.getElementById('editHint'); if (h) h.innerHTML += ' <b>Double-click on a lane</b> to add a waypoint right there — works on the way out (green) and the return to the elevator (amber). <b>Tables are fenced inside their own line</b> (tinted zones) — hold <b>Shift</b> while dragging to move one across a boundary; its label recolors to the new line.'; })();
// add a forklift access point on the front edge
document.getElementById('accesspt').onclick = () => {
  if (!editing) setEditing(true);
  addAccess(deckCx, DECK.z1);
  saveLayout();
};
// 🚜 Add forklift: drops a Forklift Access area (full animated rig) on the floor
(() => {
  const ap = document.getElementById('accesspt'); if (!ap) return;
  const b = document.createElement('button');
  b.id = 'addForklift'; b.className = ap.className || '';
  b.textContent = '🚜 Add forklift';
  ap.parentNode.insertBefore(b, ap.nextSibling);
  b.onclick = () => {
    if (!editing) setEditing(true);
    const n = areas.filter(a => a.kind === 'forklift').length;
    addArea('forklift', FLOOR_X + ((n % 2) ? 2.2 : -2.2) * Math.ceil(n / 2 + 0.5), FLOOR_Z1 - 2.2);   // stagger new pads along the south edge
    refreshProdFlow(); saveLayout();
  };
})();
// add a finished-goods rack along the back
document.getElementById('rackbtn').onclick = () => {
  if (!editing) setEditing(true);
  addRack(deckCx, DECK.z0 + 1);
  saveLayout();
};
loadLayout();
/* ---- three-line reality: Meritage (left deck), SOLA (middle slices), and
   CANYON CREW (rightmost slice, east of section line 4). Seeding is ADDITIVE
   ONLY — nothing the user built is ever deleted.
   Canyon split comes from the engineer's SWI reference combination sheet
   (assembly portion only, 99 min total, 4 operators):
   Op1 = SWI 10–16 (30'), Op2 = 17–22 (26.5'), Op3 = 23–29 (26.5'),
   Op4 = 30–35 (16'). The sheet's 3-operator alternative (10–18 / 19–24 /
   25–35 ≈ 37/38/24) is noted here for reference. Step descriptions come from
   the SWI where the number maps; "SWI step N" where the sheet gave no text. ---- */
const CANYON_LINE = [   // rightmost slice — a single north→south column at x≈20.4
  { name: 'Canyon 1 — SWI 10–16', x: 20.4, z: -6, steps: [["Wedges onto X's (SWI 10)", 5], ['Internal endcap + sleeve nut (11)', 5], ['Center bar onto endcap (12)', 4], ['Knob, washer & set screw (13)', 3], ['R/L connectors + X (14)', 4], ['SWI step 15', 4], ['Sling support bars (16)', 5]] },
  { name: 'Canyon 2 — SWI 17–22', x: 20.4, z: -2, steps: [['Middle connector front (17)', 2], ['Middle connector back (18)', 5], ['Top connector front (19)', 1.5], ['Top connector back (20)', 2], ['Neoprene on hand rests (21)', 14], ['Rails into sling loops (22)', 2]] },
  { name: 'Canyon 3 — SWI 23–29', x: 20.4, z: 2, steps: [['Sling on seat + backing plates (23)', 14.5], ['End cap insert + pin (24)', 4], ['Press-fit end caps (25)', 1.5], ['Serial sticker (26)', 1.5], ['SWI step 27', 1], ['SWI step 28', 2], ['SWI step 29', 2]] },
  { name: 'Canyon 4 — SWI 30–35', x: 20.4, z: 6, steps: [['SWI step 30', 2], ['SWI step 31', 2], ['SWI step 32', 3], ['SWI step 33', 3], ['SWI step 34', 3], ['SWI step 35', 3]] },
];
// the SOLA line (middle) — restore data for layouts damaged by the removed
// migration, and the default for fresh opens. Times as the engineer had them.
const SOLA_LINE = [
  { name: 'Rivet Nuts + Connector Plate installation', x: 7.8, z: -4, t: 33.1 },
  { name: 'Frame', x: 9.5, z: -4, t: 38.2 },
  { name: 'trellis', x: 11.3, z: -4, t: 33 },
  { name: 'final installation', x: 11.3, z: 2, t: 28.4 },
  { name: 'cushions _ ship', x: 9.5, z: 2, t: 36 },
];
function seedLine(defs, idPrefix) {   // additive: only adds stations that don't exist; chains flow through them
  defs.forEach((s, i) => {
    const id = idPrefix + (i + 1);
    if (nodes[id]) return;
    addStation(s.name, s.x, s.z, id, 0);
    nodes[id].s.steps = s.steps ? s.steps.map(a => ({ name: a[0], t: a[1] })) : [{ name: s.name, t: s.t || 0 }];
    recalcAny(id);
  });
  extraSeq = Math.max(extraSeq, defs.length);
  const chain = defs.slice(0, -1).map((_, i) => ({ from: idPrefix + (i + 1), to: idPrefix + (i + 2) }));
  flowArrows = [
    ...flowArrows.filter(a => nodes[a.from] && nodes[a.to] && !chain.some(c => c.from === a.from && c.to === a.to)),
    ...chain.filter(c => nodes[c.from] && nodes[c.to]),
  ];
  buildFlow(); if (typeof buildSolaSched === 'function') buildSolaSched();
  renderTimes();
}
// HARD RULE — ABSOLUTE, NO EXCEPTIONS (learned three times): the app NEVER
// mutates a loaded layout. No seeding into it, no upgrades, no "cleanups",
// no deletions — even ones that look provably safe. An automated cleanup
// deleted the engineer's redesigned line because the id-based "clone"
// heuristic was backwards. Loaded layouts are read-only truth; the user
// edits them, nobody else. Defaults appear ONLY on a completely virgin open.
if (!hadSavedLayout && !extraStations.length) {
  seedLine(CANYON_LINE, 'c');
  seedLine(SOLA_LINE, 'sl');
}
__workingLayout = buildWorkingLayout();   // baseline so the FIRST edit is undoable (saveLayout skips the push while this is empty)
try { schedule(); } catch (e) { console.error('schedule failed', e); }   // set labor/cycle/readouts FIRST so a bad saved layout can't leave them stuck on the placeholder
try { renderTimes(); renderSolaData(); } catch (e) { console.error('panel render failed', e); }

/* ---- draggable floating windows: grab any panel by its title bar and move it;
   positions persist per panel. The listener is on the panel (not the title) so
   it survives the panels' innerHTML re-renders. ---- */
(() => {
  let topZ = 30;
  const keyOf = id => 'm3d_panel_' + id;
  const IDS = ['times', 'idlePanel', 'helpPanel', 'taskPanel', 'measure'];
  const CORNER = 20;                                        // px hit-zone at the bottom-right corner
  // a small resize grip in the corner of every panel (injected here so it lives with the code)
  const st = document.createElement('style');
  st.textContent = IDS.map(id => `#${id}`).join(',') +
    `{overflow:auto}` +
    IDS.map(id => `#${id}::after`).join(',') +
    `{content:"◢";position:sticky;float:right;bottom:0;right:0;margin-top:-14px;font-size:13px;line-height:1;color:#b3bcc8;pointer-events:none}`;
  document.head.appendChild(st);
  IDS.forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    // restore saved position + size (zoom scales the whole window: box + fonts together)
    try { const s = JSON.parse(localStorage.getItem(keyOf(id)));
      if (s) {
        if (typeof s.zoom === 'number') el.style.zoom = s.zoom;
        if (typeof s.left === 'number') { el.style.left = s.left + 'px'; el.style.top = s.top + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto'; }
      }
    } catch (e) {}
    const par = () => el.offsetParent || document.body;
    const zoomOf = () => parseFloat(el.style.zoom) || 1;
    const persist = () => { try { localStorage.setItem(keyOf(id), JSON.stringify({ left: el.offsetLeft, top: el.offsetTop, zoom: zoomOf() })); } catch (e) {} };
    const inCorner = e => { const r = el.getBoundingClientRect(); return (r.right - e.clientX) <= CORNER && (r.bottom - e.clientY) <= CORNER; };
    // keep the whole window on-screen; note `zoom` also scales left/top, so overflow (in visual px) is undone in offset px by dividing by zoom
    const clampOnScreen = () => {
      const z = zoomOf(), pr = par().getBoundingClientRect(), rr = el.getBoundingClientRect();
      let L = el.offsetLeft, T = el.offsetTop;
      if (rr.right > pr.right) L -= (rr.right - pr.right) / z;
      if (rr.bottom > pr.bottom) T -= (rr.bottom - pr.bottom) / z;
      el.style.left = Math.max(0, L) + 'px'; el.style.top = Math.max(0, T) + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto';
    };
    el.addEventListener('pointermove', e => { if (!e.buttons) el.style.cursor = inCorner(e) ? 'nwse-resize' : ''; });   // hint the resize corner
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      if (inCorner(e)) {                                    // ---- RESIZE: grow/shrink the window; text scales with it ----
        e.preventDefault(); e.stopPropagation(); el.style.zIndex = ++topZ;
        const pr = par().getBoundingClientRect();
        let r = el.getBoundingClientRect();
        el.style.left = ((r.left - pr.left) / zoomOf()) + 'px'; el.style.top = ((r.top - pr.top) / zoomOf()) + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto';   // pin (offset px) so it grows toward the corner
        r = el.getBoundingClientRect();
        const z0 = zoomOf();
        const d0 = Math.max(1, Math.hypot(e.clientX - r.left, e.clientY - r.top));
        const move = ev => {
          const d = Math.hypot(ev.clientX - r.left, ev.clientY - r.top);
          el.style.zoom = Math.max(0.55, Math.min(2.6, z0 * d / d0));
          clampOnScreen();
        };
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); persist(); };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
        return;
      }
      const h = e.target.closest('h3,h4'); if (!h || !el.contains(h)) return;   // else drag only by the title bar
      e.preventDefault(); el.style.zIndex = ++topZ;
      const z = zoomOf();                                   // cursor delta is in visual px; offset moves at delta/zoom
      const sx = e.clientX, sy = e.clientY, sl = el.offsetLeft, st2 = el.offsetTop;
      const move = ev => { el.style.left = Math.max(0, sl + (ev.clientX - sx) / z) + 'px'; el.style.top = Math.max(0, st2 + (ev.clientY - sy) / z) + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto'; clampOnScreen(); };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); persist(); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    });
  });
})();
refreshPath();
buildHelp();   // render seeded/loaded help paths
rebuildDivider();   // align the crossing to the connector station

/* ---- named layouts: save / load / compare different floor plans ---- */
const LAYOUTS_KEY = 'm3d_layouts_v2';
// Named layouts = those baked into this file (window.__M3D_LAYOUTS__) MERGED with
// any saved in this browser. So layouts baked into the app travel to any computer.
const builtinLayouts = () => { try { return (window.__M3D_LAYOUTS__ && typeof window.__M3D_LAYOUTS__ === 'object') ? window.__M3D_LAYOUTS__ : {}; } catch (e) { return {}; } };
// In-memory mirror (seeded from baked-in + this browser's storage). It is the
// source of truth this session, so layouts survive even if localStorage is
// blocked (Safari / file://) — bake reads THIS, never storage directly.
let __namedCache = null;
const readLayouts = () => {
  if (!__namedCache) { let ls = {}; try { ls = JSON.parse(localStorage.getItem(LAYOUTS_KEY)) || {}; } catch (e) {} __namedCache = Object.assign({}, builtinLayouts(), ls); }
  return __namedCache;
};
const writeLayouts = o => { __namedCache = o; try { localStorage.setItem(LAYOUTS_KEY, JSON.stringify(o)); } catch (e) {} try { cloudSyncNamed(o); } catch (e) {} };
function snapshot() {
  const pos = {}, times = {};
  ST.forEach(s => { const n = nodes[s.id]; pos[s.id] = [n.x, n.z]; times[s.id] = get(s.id).t; });
  if (nodes.cart) pos.cart = [nodes.cart.x, nodes.cart.z];
  const cap = sch ? dayMinSafe() / Math.max(sch.conT, sch.armT, sch.bakT, sch.treT, sch.seaT, sch.ASM + sch.PACK) : 0;
  return { pos, times, walkOn, walkSpeed, trips: tripsPerUnit, N, wps: cartWaypoints.map(w => [w.x, w.z]), help: helpArrows.map(a => [a.from, a.to, a.helpMin || 0, a.fromIdx || 0, a.prod || '']), rot: Object.fromEntries(ST.map(s => [s.id, nodes[s.id] ? (nodes[s.id].rot || 0) : 0])), steps: Object.fromEntries(ST.map(s => [s.id, s.steps.map(st => [st.name, st.t])])), ppl: Object.fromEntries(ST.map(s => [s.id, s.ppl || 1])), cover: Object.fromEntries(ST.map(s => [s.id, s.cover || ''])), plan: JSON.parse(JSON.stringify(dayPlan)), planStart, floors: JSON.parse(JSON.stringify(customFloors)), access: accessPts.map(a => [a.x, a.z]), elev: [EL[0], EL[1]], racks: racks.map(r => [r.x, r.z, r.g.rotation.y || 0]), extras: extraSnap(), flow: flowArrows.map(a => [a.from, a.to]), areas: areas.map(a => [a.kind, +a.x.toFixed(2), +a.z.toFixed(2), a.rot || 0]), rwps: returnWps.map(w => [w.x, w.z]), rwps2: returnWps2.map(w => [w.x, w.z]), wps3: cart3Waypoints.map(w => [w.x, w.z]), rwps3: returnWps3.map(w => [w.x, w.z]), ends: [retEnd, retEnd2, retEnd3].map(e => e ? [e.x, e.z] : null), fwps: prodWps.map(l => l.map(w => [w.x, w.z])), fstart: prodStart.slice(), dayMin, products: JSON.parse(JSON.stringify(lineProducts)), boxZone: [boxZone.x, boxZone.z, boxZone.w, boxZone.d], names: Object.fromEntries(ST.map(s2 => [s2.id, s2.title])), cap: +cap.toFixed(1) };
}
function applyLayout(L) {
  if (L.steps) { ST.forEach(s => { if (L.steps[s.id]) { s.steps = L.steps[s.id].map(a => ({ name: a[0], t: +a[1] || 0 })); recalc(s.id); } }); }
  if (L.cover) { ST.forEach(s => { s.cover = L.cover[s.id] || null; }); }
  if (L.ppl) { ST.forEach(s => { if (L.ppl[s.id] != null) s.ppl = L.ppl[s.id]; }); }
  if (L.ppl || L.cover) ST.forEach(s => { rebuildCrew(s.id); placeStation(s.id); });
  if (L.plan && typeof L.plan === 'object') { dayPlan = { meritage: L.plan.meritage || [], sola: L.plan.sola || [], canyon: L.plan.canyon || [] }; }
  if (typeof L.planStart === 'number') planStart = L.planStart;
  if (typeof renderPlanner === 'function') renderPlanner();
  else if (L.times) ST.forEach(s => { if (L.times[s.id] != null) { get(s.id).t = L.times[s.id]; get(s.id).steps = [{ name: s.sub || 'Step', t: L.times[s.id] }]; } });
  if (L.pos) Object.keys(L.pos).forEach(id => { if (nodes[id]) setStationPos(id, L.pos[id][0], L.pos[id][1]); });
  if (typeof L.walkOn === 'boolean') { walkOn = L.walkOn; const c = document.getElementById('walkOn'); if (c) c.checked = walkOn; }
  if (L.walkSpeed) { walkSpeed = L.walkSpeed; const c = document.getElementById('walkSpeed'); if (c) c.value = walkSpeed; }
  if (L.trips != null) { tripsPerUnit = L.trips; const c = document.getElementById('trips'); if (c) c.value = tripsPerUnit; }
  if (L.N) { N = L.N; nInput.value = N; }
  if (Array.isArray(L.rwps)) returnWps = L.rwps.map(a => ({ x: a[0], z: a[1] }));
  if (Array.isArray(L.rwps2)) { returnWps2 = L.rwps2.map(a => ({ x: a[0], z: a[1] })); refreshCart2Feed(); }
  if (Array.isArray(L.rwps3)) returnWps3 = L.rwps3.map(a => ({ x: a[0], z: a[1] }));
  if (Array.isArray(L.wps3)) { cart3Waypoints = L.wps3.map(a => ({ x: a[0], z: a[1] })); }
  if (Array.isArray(L.ends)) { const e = L.ends; retEnd = e[0] ? { x: e[0][0], z: e[0][1] } : null; retEnd2 = e[1] ? { x: e[1][0], z: e[1][1] } : null; retEnd3 = e[2] ? { x: e[2][0], z: e[2][1] } : null; }
  if (Array.isArray(L.fwps)) prodWps = [0, 1, 2].map(i => (L.fwps[i] || []).map(a => ({ x: a[0], z: a[1] })));
  if (Array.isArray(L.fstart)) prodStart = [0, 1, 2].map(i => L.fstart[i] || null);
  if (typeof L.dayMin === 'number' && L.dayMin > 0) dayMin = L.dayMin;
  if (L.products && L.products.meritage) mergeProducts(JSON.parse(JSON.stringify(L.products)));
  refreshCart3Feed();
  if (Array.isArray(L.wps)) { cartWaypoints = L.wps.map(a => ({ x: a[0], z: a[1] })); refreshPath(); }
  if (Array.isArray(L.help)) { helpArrows = L.help.map(a => ({ from: a[0], to: a[1], helpMin: a[2] || 0, fromIdx: a[3] || 0, prod: a[4] || null })); buildHelp(); }
  if (L.rot) Object.keys(L.rot).forEach(id => { if (nodes[id]) setStationRot(id, L.rot[id]); });
  if (Array.isArray(L.access)) { clearAccess(); L.access.forEach(p => addAccess(p[0], p[1])); refreshProdFlow(); }
  extraStations.forEach(applyLineAccent); if (typeof applyLineFocus === 'function') applyLineFocus();
  if (Array.isArray(L.elev)) moveElevator(L.elev[0], L.elev[1]);
  if (Array.isArray(L.racks)) { clearRacks(); L.racks.forEach(p => addRack(p[0], p[1], p[2])); }
  if (Array.isArray(L.floors)) restoreFloors(L.floors);
  if (Array.isArray(L.extras)) { clearExtras(); restoreExtras(L.extras); restoreFlow(L.flow); }   // rebuild the Sola side from this layout
  if (Array.isArray(L.areas)) restoreAreas(L.areas);                                                // rebuild the surrounding areas
  if (Array.isArray(L.boxZone)) { boxZone = { x: L.boxZone[0], z: L.boxZone[1], w: L.boxZone[2], d: L.boxZone[3] }; refreshBoxZone(); }
  if (L.names) Object.entries(L.names).forEach(([id, nm]) => { const st2 = getAny(id); if (st2 && nm && st2.title !== nm) setStationTitle(id, nm); });
  renderTimes();
  schedule(); T = 0; setPlay(false); saveLayout();
}
const layoutSel = document.getElementById('layoutSel');
function refreshLayoutSel(sel) {
  const o = readLayouts();
  layoutSel.innerHTML = '<option value="">— working —</option>' +
    Object.keys(o).map(n => `<option value="${n}">${n} · ${o[n].cap ?? '?'}/day</option>`).join('');
  layoutSel.value = sel || '';
}
document.getElementById('saveLayout').onclick = () => {
  const name = (prompt('Save this layout as:') || '').trim(); if (!name) return;
  const o = readLayouts(); o[name] = snapshot(); writeLayouts(o); refreshLayoutSel(name);
};
layoutSel.onchange = e => { const L = readLayouts()[e.target.value]; if (L) applyLayout(L); };
document.getElementById('delLayout').onclick = () => {
  const n = layoutSel.value; if (!n) return;
  if (!confirm(`Delete layout "${n}"?`)) return;
  const o = readLayouts(); delete o[n]; writeLayouts(o); refreshLayoutSel('');
};
refreshLayoutSel();

// ---- Export / Import a layout as a file (so a layout can be shared between
// computers — localStorage doesn't travel with the HTML file) ----
document.getElementById('exportLayout').onclick = () => {
  saveLayout();                                              // capture the current on-screen arrangement
  const data = JSON.stringify(buildWorkingLayout());        // from live scene, not storage
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  a.download = 'meritage-line-layout.json'; document.body.appendChild(a); a.click();
  a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
// Bake the current working layout + all named layouts into a fresh copy of this
// app, so opening that copy on any computer shows the same layouts built in.
const bakeBtn = document.getElementById('bakeApp');
if (bakeBtn) bakeBtn.onclick = () => {
  saveLayout();
  const working = buildWorkingLayout();                    // LIVE scene, not storage (works even if localStorage is blocked)
  const named = readLayouts();                             // in-memory mirror: builtin + this session's saves
  // Build the marker tags + strip-regex from fragments so the literal substrings
  // "<script id=\"m3dLayouts\">" and "</script>" never appear in THIS bundle's
  // source. If they did, __ORIGINAL_HTML (the serialized document, which contains
  // this very bundle) would carry them, and the strip-regex below would match
  // INSIDE the bundle and truncate everything up to its real closing tag.
  const LT = String.fromCharCode(60);                      // '<'  (never folded into a literal tag)
  const enc = o => JSON.stringify(o).replace(/</g, '\\u003c');   // keep stray '<' in data from breaking the script
  const inject = LT + 'script id="m3dLayouts">' +
    'window.__M3D_LAYOUT__=' + enc(working) + ';' +
    'window.__M3D_LAYOUTS__=' + enc(named) + ';' +
    LT + '/script>\n';
  const stripRe = new RegExp(LT + 'script id="m3dLayouts">[\\s\\S]*?' + LT + '/script>\\s*', 'i');
  let html = __ORIGINAL_HTML.replace(stripRe, '');         // drop any previously-baked layouts
  html = html.replace('</head>', inject + '</head>');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  a.download = 'Meritage_3D_Line.html'; document.body.appendChild(a); a.click();
  a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  const n = Object.keys(named).length;
  alert(`Saved a copy of the app with your working layout` + (n ? ` and ${n} saved layout${n > 1 ? 's' : ''}` : '') + ` built in.\nUse / share that downloaded file — it will show the same layouts on any computer.`);
};
const importFile = document.getElementById('importFile');
document.getElementById('importLayout').onclick = () => importFile.click();
importFile.onchange = e => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    let o; try { o = JSON.parse(reader.result); } catch (err) { alert('That file isn’t a valid layout export.'); return; }
    try { if (Object.keys(__workingLayout).length) { undoStack.push(__workingLayout); refreshUndoBtn(); } } catch (err) {}   // undo point before the import
    clearExtras();                                          // drop the current Sola side, then apply the imported one
    applyWorkingLayout(o);                                  // apply to the LIVE scene — no reload, works even if storage is blocked
    __workingLayout = buildWorkingLayout(); try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(__workingLayout)); } catch (e) {}
    renderTimes(); schedule(); if (typeof buildSolaSched === 'function') buildSolaSched(); T = 0; setPlay(false);
    alert('Layout imported.');
  };
  reader.readAsText(f); importFile.value = '';
};

/* ---- Printable line-plan report: a clean, shareable summary of the current
   layout (build sequence, each station's steps/people/times, help paths, KPIs)
   for the assembly-line lead. Opens in a new tab; Print → Save as PDF. ---- */
function captureFloorMap() {                                 // top-down snapshot of the whole floor for the report
  try {
    const b = { x0: -16, x1: 28.5, z0: -16, z1: 16 };
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    const aspect = renderer.domElement.width / renderer.domElement.height;
    let halfH = d / 2, halfW = halfH * aspect;
    if (halfW < w / 2) { halfW = w / 2; halfH = halfW / aspect; }
    const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 200);
    cam.position.set((b.x0 + b.x1) / 2, FLOOR2 + 40, (b.z0 + b.z1) / 2);
    cam.up.set(0, 0, -1); cam.lookAt((b.x0 + b.x1) / 2, FLOOR2, (b.z0 + b.z1) / 2);
    renderer.render(scene, cam);                             // main loop redraws with the real camera next frame
    return renderer.domElement.toDataURL('image/png');
  } catch (e) { return null; }
}
function buildReportHTML() {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = v => (Math.round(v * 10) / 10).toString();
  const stepList = steps => (!steps || !steps.length)
    ? '<div class="muted">No steps recorded yet.</div>'
    : '<ol class="steps">' + steps.map(st => `<li><span>${esc(st.name)}</span><b>${(+st.t) ? num(+st.t) + ' min' : '—'}</b></li>`).join('') + '</ol>';
  const card = (s, n) => {
    const id = s.id, ppl = Math.max(1, s.ppl || 1), tot = s.t || 0, per = effNet(id), hin = helpInto(id);
    const seq = n ? `<span class="seq">${n}</span>` : '';
    const helpNote = hin > 0 ? `<div class="hinote">helped: −${num(hin)} min/unit → net <b>${num(per)} min/unit</b></div>` : '';
    return `<div class="card">
      <div class="ch">${seq}<span class="ct">${esc(s.title)}</span>
        <span class="cm">${ppl} ${ppl > 1 ? 'people' : 'person'} · ${num(tot)} min total · <b>${num(per)} min/unit</b></span></div>
      ${helpNote}${stepList(s.steps)}</div>`;
  };
  const helpRows = arr => arr.length ? '<ul class="help">' + arr.map(a => {
    const fp = (getAny(a.from) && getAny(a.from).ppl) || 1;
    const fl = stName(a.from) + (fp > 1 ? ' (op ' + ((a.fromIdx || 0) + 1) + ')' : '');
    return `<li><b>${esc(fl)}</b> &rarr; helps <b>${esc(stName(a.to))}</b> · takes ${num(a.helpMin || 0)} min/unit off it</li>`;
  }).join('') + '</ul>' : '<div class="muted">No help paths set.</div>';

  // ---- Meritage ----
  const feeders = ['con', 'arm', 'bak', 'tre', 'sea'].map(get);
  const merLabor = ['con', 'arm', 'bak', 'tre', 'sea', 'fa', 'pak'].reduce((a, id) => a + (get(id).t || 0), 0);
  const merPpl = ['con', 'arm', 'bak', 'tre', 'sea', 'fa', 'pak'].reduce((a, id) => a + (get(id).ppl || 1), 0);
  const bn = bottleneckInfo(), bnName = bn.name;
  const takt = dayMin / taktDemand;
  const merHelp = helpArrows.filter(a => !isExtra(a.to));
  const kpi = (l, v) => `<div class="kpi"><div class="kl">${l}</div><div class="kv">${v}</div></div>`;
  const walkNote = walkOn ? ` Station times include walking to linked tables at ${walkSpeed} yd/min (${tripsPerUnit} trip${tripsPerUnit > 1 ? 's' : ''}/unit).` : '';
  let mer = `<section><h2>Meritage 3-Seater</h2>
    <div class="kpis">${kpi('Operators', merPpl)}${kpi('Cycle', num(merLabor) + ' min/unit')}${kpi('Current pace', num(bn.time) + ' min')}${kpi('Capacity', num(bn.cap) + ' /day')}${kpi('Takt (' + taktDemand + '/day)', num(takt) + ' min')}${kpi('Bottleneck', esc(bnName))}</div>
    <h3>Build sequence</h3>
    <p class="lead">The five sub-assembly stations run <b>in parallel</b>; their parts feed <b>Full Assembly</b>, then the unit goes to <b>Cushions &amp; Pack</b>.${walkNote}</p>
    <div class="stage"><div class="sh">1 · Sub-assemblies (parallel)</div><div class="grid">${feeders.map(s => card(s)).join('')}</div></div>
    <div class="stage"><div class="sh">2 · Full Assembly</div><div class="grid">${card(get('fa'))}</div></div>
    <div class="stage"><div class="sh">3 · Cushions &amp; Pack</div><div class="grid">${card(get('pak'))}</div></div>
    <h3>Help paths (operator sharing)</h3>${helpRows(merHelp)}</section>`;

  // ---- Sola (only if stations exist) ----
  const sIds = orderedSola();
  let sola = '';
  if (sIds.length) {
    const sLabor = sIds.reduce((a, id) => a + (nodes[id].s.t || 0), 0);
    const sPpl = sIds.reduce((a, id) => a + (nodes[id].s.ppl || 1), 0);
    let sCyc = 0.1, sBot = '—'; sIds.forEach(id => { const e = effNet(id); if (e > sCyc) { sCyc = e; sBot = nodes[id].s.title; } });
    const sCap = sCyc > 0 ? dayMinSafe() / sCyc : 0;
    const sHelp = helpArrows.filter(a => isExtra(a.to));
    sola = `<section><h2>Sola + Canyon Crew (right side)</h2>
      <div class="kpis">${kpi('Operators', sPpl)}${kpi('Cycle', num(sLabor) + ' min/unit')}${kpi('Current pace', num(sCyc) + ' min')}${kpi('Capacity', num(sCap) + ' /day')}${kpi('Stations', sIds.length)}${kpi('Bottleneck', esc(sBot))}</div>
      <h3>Build sequence (in order of flow)</h3>
      <p class="lead">Single-piece flow — each unit moves through the stations below in this order.</p>
      <div class="grid">${sIds.map((id, i) => card(nodes[id].s, i + 1)).join('')}</div>
      <h3>Help paths (operator sharing)</h3>${helpRows(sHelp)}</section>`;
  }

  const layoutName = (layoutSel && layoutSel.value) ? layoutSel.value : 'Working layout';
  const when = new Date().toLocaleString();
  const mapUrl = captureFloorMap();
  const mapSec = mapUrl ? `<section><h2>Floor Plan</h2>
    <p class="lead">Top-down view of this layout — Meritage on the left deck, Sola (middle) and Canyon Crew on the right, staging areas around them.</p>
    <img class="map" src="${mapUrl}" alt="Floor plan"></section>` : '';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Assembly Line Plan — ${esc(layoutName)}</title>
<style>
  :root{--navy:#1d3a66;--mut:#6b7785;--line:#e3e7ec}
  *{box-sizing:border-box} body{margin:0;font:15px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1c2530;background:#f4f6f8}
  .wrap{max-width:900px;margin:0 auto;padding:28px 30px 60px}
  .bar{position:sticky;top:0;background:#12203a;margin:-28px -30px 24px;padding:14px 30px;display:flex;justify-content:space-between;align-items:center}
  .bar h1{color:#fff;font-size:17px;margin:0} .bar button{background:#2f7d52;color:#fff;border:0;border-radius:8px;padding:9px 16px;font-size:14px;font-weight:600;cursor:pointer}
  .sub{color:var(--mut);font-size:13px;margin:0 0 22px}
  h2{color:var(--navy);font-size:22px;margin:30px 0 6px;padding-bottom:6px;border-bottom:2px solid var(--navy)}
  h3{color:var(--navy);font-size:15px;text-transform:uppercase;letter-spacing:.04em;margin:22px 0 8px}
  .lead{color:#33414f;margin:0 0 12px}
  .kpis{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0 4px}
  .kpi{flex:1;min-width:120px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:9px 12px}
  .kl{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut)} .kv{font-size:18px;font-weight:700;color:var(--navy)}
  .stage{margin:14px 0} .sh{font-weight:700;color:#c0552c;margin:0 0 8px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .card{background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px 14px;break-inside:avoid}
  .ch{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;border-bottom:1px solid var(--line);padding-bottom:7px;margin-bottom:7px}
  .seq{background:var(--navy);color:#fff;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex:none}
  .ct{font-weight:700;color:var(--navy);font-size:15px} .cm{color:var(--mut);font-size:12.5px;margin-left:auto}
  .hinote{font-size:12px;color:#2f7d52;margin:-2px 0 6px}
  ol.steps{margin:0;padding:0 0 0 20px} ol.steps li{margin:3px 0;display:flex;justify-content:space-between;gap:10px}
  ol.steps li span{flex:1} ol.steps li b{color:#33414f;white-space:nowrap}
  ul.help{margin:4px 0 0;padding:0 0 0 18px} ul.help li{margin:4px 0}
  .muted{color:var(--mut);font-style:italic;font-size:13px}
  img.map{width:100%;border:1px solid var(--line);border-radius:10px;margin:6px 0 4px;background:#e8ebee}
  @media print{ body{background:#fff} .no-print{display:none} .wrap{max-width:none;padding:0} .bar{position:static} section{break-inside:avoid} }
  @media(max-width:640px){ .grid{grid-template-columns:1fr} }
</style></head><body><div class="wrap">
  <div class="bar"><h1>Assembly Line Plan</h1><button class="no-print" onclick="window.print()">🖨 Print / Save as PDF</button></div>
  <p class="sub"><b>Layout:</b> ${esc(layoutName)} &nbsp;·&nbsp; Generated ${esc(when)} &nbsp;·&nbsp; TUUCI · Meritage &amp; Sola lines</p>
  ${mapSec}${mer}${sola}
</div></body></html>`;
}
function openReport() {
  const html = buildReportHTML();
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const w = window.open(url, '_blank');
  if (!w) { const a = document.createElement('a'); a.href = url; a.download = 'Assembly_Line_Plan.html'; document.body.appendChild(a); a.click(); a.remove(); }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
(() => {                                                     // add Report / Areas / Undo buttons into their groups
  const imp = document.getElementById('importLayout'); if (!imp) return;
  const cls = document.getElementById('play') ? document.getElementById('play').className.replace('go', '').trim() : '';
  const rep = document.createElement('button');
  rep.id = 'reportBtn'; rep.className = cls;
  rep.textContent = '📄 Report';
  rep.title = 'Open a printable line plan (build sequence, steps, people, help paths) to share with the assembly-line lead';
  const gAn = document.getElementById('grpAnalyze');
  if (gAn) gAn.appendChild(rep); else imp.parentNode.insertBefore(rep, imp.nextSibling);
  rep.onclick = openReport;
  const area = document.createElement('button');
  area.id = 'areasBtn'; area.className = cls;
  area.textContent = '🏭 Areas: on';
  area.title = 'Show / hide the surrounding warehouse areas (staging, racks, forklift lanes, gate)';
  const gV = document.getElementById('grpView');
  if (gV) gV.appendChild(area); else rep.parentNode.insertBefore(area, rep.nextSibling);
  area.onclick = () => { surroundings.visible = !surroundings.visible; area.textContent = '🏭 Areas: ' + (surroundings.visible ? 'on' : 'off'); };
  const und = document.createElement('button');
  und.id = 'undoBtn'; und.className = cls;
  und.textContent = '↩ Undo';
  und.title = 'Undo the last layout change (Ctrl/Cmd+Z)';
  const gB = document.getElementById('buildRow');
  if (gB) gB.appendChild(und); else area.parentNode.insertBefore(und, area.nextSibling);
  und.onclick = undoLayout;
  refreshUndoBtn();
})();
// ---- toolbar organization: Floor-tools reveal + Layouts dropdown ----
(() => {
  const ft = document.getElementById('floorTools'), br = document.getElementById('buildRow');
  if (ft && br) ft.onclick = () => { const open = !br.classList.contains('open'); br.classList.toggle('open', open); ft.classList.toggle('on', open); };
  const lb = document.getElementById('layoutsBtn'), lm = document.getElementById('layoutsMenu');
  if (lb && lm) {
    lb.onclick = e => { e.stopPropagation(); lm.classList.toggle('open'); };
    document.addEventListener('pointerdown', e => { if (lm.classList.contains('open') && !e.target.closest('#grpFile')) lm.classList.remove('open'); });
  }
})();

/* =========================== UPDATE =========================== */
function setLed(mat, state, active){ (Array.isArray(mat)?mat:[mat]).forEach(m=>{ m.color.setHex(RING[state]); m.emissive.setHex(state==='idle'?0x000000:RING[state]); m.emissiveIntensity = active?1.1:0.5; }); }

function update(){
  if (!sch) return;
  ui.clock.textContent = Math.round(T) + ' min';
  // feeders
  const fmap = { con:'conT', arm:'armT', bak:'bakT', tre:'treT', sea:'seaT' };
  let shipped = 0; for (let u=0;u<N;u++) if (T>=sch.faEnd[u]) shipped++;
  const fa = nodes.fa;
  ['con','arm','bak','tre','sea'].forEach(id => {
    const t = sch[fmap[id]];
    const built = Math.min(N, Math.floor(T / t));
    const frac = built >= N ? 1 : (T % t) / t;
    const nd = nodes[id];
    // bench shows only the part currently being worked (finished ones travel off)
    nd.visual.update(built >= N ? 0 : frac, 0, N);
    setLed(nd.led, built >= N ? 'done' : (T>0 && frac>0 ? 'active':'idle'), built < N && T>0);
    // ---- traveling finished parts: feeder -> FA staging -> consumed at faStart ----
    const t2 = t; const pool = travelParts[id]; const off = SLOT[id];
    const sx0 = nd.x, sz0 = nd.z;
    // rotate the staging offset with the FA table so parts stage ON the tabletop
    // whichever way it's turned (same convention as crew placement)
    const far2 = fa.rot || 0, fcs = Math.cos(far2), fsn = Math.sin(far2);
    const tx = fa.x + (off[0] * fcs + off[1] * fsn), tz = fa.z + (off[1] * fcs - off[0] * fsn);
    for (let u = 0; u < N; u++) {
      const part = pool[u]; if (!part) continue;
      const depart = t2 * (u + 1);
      const cons = sch.faStart[u];
      if (depart >= cons || T < depart || T >= cons) { part.visible = false; continue; }
      const arrive = Math.min(depart + TRAVEL, cons);
      part.visible = focusShows('meritage');
      if (T < arrive) {
        const f = (arrive > depart) ? (T - depart) / (arrive - depart) : 1;
        part.position.set(sx0 + (tx - sx0) * f, 1.04 + Math.sin(f * Math.PI) * 0.35, sz0 + (tz - sz0) * f);
      } else {
        part.position.set(tx, 1.04, tz);   // staged at FA, waiting to be used
      }
    }
  });
  // full assembly
  let cur = -1, phase = '';
  for (let u=0; u<N; u++){ if (T>=sch.faStart[u] && T<sch.faEnd[u]){ cur=u; phase = (T < sch.faStart[u]+sch.ASM) ? 'asm':'pack'; break; } }
  if (cur >= 0) {
    if (phase === 'asm') {
      const fr = (T - sch.faStart[cur]) / sch.ASM;
      fa.visual.g.visible = true; fa.visual.update(fr * 0.8);   // full assembly builds the frame only (no cushions yet)
      movingSofa.g.visible = false;
      setLed(fa.led, 'active', true);
    } else {
      fa.visual.g.visible = false;
      // frame slides to packing, where the cushions are actually put on
      const fr = (T - (sch.faStart[cur] + sch.ASM)) / sch.PACK;
      const sx = fa.x + (POS.pak[0] - fa.x) * Math.min(1, fr * 1.6);
      const sz = fa.z + (POS.pak[1] - fa.z) * Math.min(1, fr * 1.6);
      movingSofa.g.visible = focusShows('meritage'); movingSofa.g.position.set(sx, 1.04, sz);
      movingSofa.update(0.8 + Math.min(1, fr) * 0.2);           // cushions go on at the packing station
      setLed(fa.led, 'done', false);
    }
  } else {
    fa.visual.g.visible = false; movingSofa.g.visible = false;
    // waiting for kit?
    let nextWait = -1; for (let u=0;u<N;u++){ if (T<sch.faStart[u]){ nextWait=u; break; } }
    const waiting = nextWait>=0 && T < sch.kit[nextWait];
    setLed(fa.led, waiting ? 'wait' : (shipped>=N?'done':'idle'), false);
  }
  // packing led + crew
  const pak = nodes.pak;
  setLed(pak.led, (cur>=0 && phase==='pack') ? 'active' : (shipped>=N?'done':'idle'), cur>=0 && phase==='pack');
  // finished boxes no longer pile in the box zone — each one travels the green
  // furniture lane to the access point and queues there (see spawnOutBox)
  ui.ship.textContent = shipped;
  // finished sofas populate the racks; the forklift takes one down every 3rd
  gShippedM = shipped;                                                 // dispatcher (render loop) drains this into forklift trips
  if (shipped < lastShipped) { lastShipped = shipped; onRacks = 0; }   // clock reset/seek
  const rcap = racks.length * RACK_SLOTS;
  while (lastShipped < shipped) { lastShipped++; onRacks = Math.min(rcap, onRacks + 1); if (lastShipped % 3 === 0) onRacks = Math.max(0, onRacks - 1); }   // forklift trips come from the dispatcher now
  fillRacks();

  // FA crew walk to packing during pack phase; help-arrow operators walk to help during their idle slack
  const packing = (cur>=0 && phase==='pack');
  const cyc = Math.max(0.001, sch.conT, sch.armT, sch.bakT, sch.treT, sch.seaT, sch.ASM + sch.PACK);
  crew.forEach(c => {
    if (typeof isExtra === 'function' && isExtra(c.station)) return;   // added-line (Sola/Canyon) crew belong to solaUpdate — moving them here too made both lerps fight and operators hovered between stations
    let tx = c.homeX, tz = c.homeZ;
    if (c.station === 'fa' && packing) { tx = POS.pak[0] + (c.idx - 0.5) * 1.1; tz = POS.pak[1] + 1.7; }
    else if (c.helpTo && playing && nodes[c.helpTo] && (c.helpMin || 0) > 0) {
      // finishes own task each cycle, then walks to help for helpMin minutes, then returns
      const work = effNet(c.station), hm = c.helpMin || 0;
      const ph = (T % cyc) / cyc;
      if (ph > work / cyc && ph <= (work + hm) / cyc) { const n = nodes[c.helpTo]; tx = n.x + 0.7; tz = n.z + 1.7; }
    }
    c.fig.position.x += (tx - c.fig.position.x) * 0.08;
    c.fig.position.z += (tz - c.fig.position.z) * 0.08;
  });
}

/* ============ CARTS (static, for now): 3 carts parked in a line along the path ============ */
function updateCarts() {
  for (let i = 0; i < cartPool.length; i++) {     // slot 0 = cart spot, others back along the path toward the elevator
    const o = cartPool[i];
    o.mesh.visible = true;
    const [x, z] = pointAtDist(slotDist(i));
    o.mesh.position.set(x, 0, z);
  }
  elevator.car.position.y = FLOOR2;               // park the elevator car at the deck
  elevator.crate.visible = false;
}

/* =========================== LOOP =========================== */
const ro = new ResizeObserver(() => {
  const W = mount.clientWidth, H = mount.clientHeight || 520;
  camera.aspect = W / H; camera.updateProjectionMatrix(); renderer.setSize(W, H);
});
ro.observe(mount);
let last = performance.now();
function loop(now){
  const dt = (now - last) / 1000; last = now;
  let simDt = 0;                                   // sim-minutes advanced this frame — boxes + forklifts pace on THIS, so material handling scales with the sim speed
  if (playing) {
    const spd = dt * parseFloat(speed.value);
    simDt = spd;
    if (playScope !== 'sola' && T < horizon) T = Math.min(horizon, T + spd);          // Meritage clock
    if (playScope !== 'meritage' && Ts < solaHorizon) Ts = Math.min(solaHorizon, Ts + spd);  // Sola clock
    const merDone = playScope === 'sola' || T >= horizon;
    const solDone = playScope === 'meritage' || Ts >= solaHorizon;
    if (merDone && solDone) setPlay(false);
  }
  updateCarts();   // carts stay parked in a line along the path
  updateCartDemo(dt);   // 🛒 edit-mode cart test-drive
  if (!focusShows('meritage')) cartPool.forEach(c => { c.mesh.visible = false; });   // line focus hides the Meritage delivery carts
  crew.forEach(c => { const v = focusShows(stLineOf(c.station)); if (c.fig.visible !== v) c.fig.visible = v; });
  updateHelp();    // help-movement arrows follow the stations
  updateFlow();    // part-flow arrows follow the stations
  solaUpdate();    // animate the Sola line on its own clock
  // clock reset / seek-back: clear travelers, queues and ground pads
  if (spawnedM > gShippedM) spawnedM = gShippedM;
  if (spawnedSola > gShipSola) spawnedSola = gShipSola;
  if (spawnedCanyon > gShipCanyon) spawnedCanyon = gShipCanyon;
  if (T <= 0 && Ts <= 0) {
    resetOutbound();
    for (const fl of forkLifts) { fl.busy = false; fl.t = 0; fl.pkg.visible = false; fl.delivered = 0; if (fl.gnd) fl.gnd.forEach(b => b.visible = false); }
  }
  // spawn a traveling box for every newly finished unit — it slides down that
  // line's green lane to the access point
  while (spawnedM < gShippedM) { spawnedM++; spawnOutBox(0); }
  while (spawnedSola < gShipSola) { spawnedSola++; spawnOutBox(1); }
  while (spawnedCanyon < gShipCanyon) { spawnedCanyon++; spawnOutBox(2); }
  advanceOutBoxes(simDt);
  // dispatcher: a rig with boxes queued on its pallet square and free forks
  // takes the oldest one down — every rig in parallel, each at its real pace
  for (const fl of forkLifts) {
    if (fl.busy || !fl.waitMeshes || !fl.waitMeshes.length) continue;
    releaseOutMesh(fl.waitMeshes.shift()); parkWaiters(fl);
    fl.busy = true; fl.t = 0;
  }
  for (const fl of forkLifts) {                    // trip: rise empty, take the box at the deck, carry it down (~1.5 sim-min round trip)
    if (fl.busy) {
      fl.t += simDt; const p = fl.t / 1.5;
      if (p >= 1) {
        fl.busy = false; fl.lift.position.y = -(FLOOR2 - 0.3); fl.pkg.visible = false;
        if (fl.gnd) {                              // delivered: stage the box on the ground pad; a semi hauls the pad clear after 6
          if (fl.delivered >= fl.gnd.length) { fl.delivered = 0; fl.gnd.forEach(b => b.visible = false); }
          fl.gnd[fl.delivered].visible = true; fl.delivered++;
        }
      }
      else if (p < 0.4) { fl.lift.position.y = -(1 - p / 0.4) * (FLOOR2 - 0.3); fl.pkg.visible = false; }        // up to the deck, forks empty
      else if (p < 0.5) { fl.lift.position.y = 0; fl.pkg.visible = true; }                                        // pick up the furniture
      else { fl.lift.position.y = -((p - 0.5) / 0.5) * (FLOOR2 - 0.3); fl.pkg.visible = p < 0.97; }               // carry it down
    } else { fl.lift.position.y = -(FLOOR2 - 0.3); }   // idle: forks parked just off the ground, like a real truck
    if (fl.sync) fl.sync();
  }
  update();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
/* ---- every floating panel gets an ✕ so it's obvious how to close it ---- */
(() => {
  const st = document.createElement('style');
  st.textContent = '.panelX{position:absolute;top:6px;right:6px;width:22px;height:22px;line-height:20px;text-align:center;border:1px solid #d8dee6;border-radius:6px;background:#fff;color:#5a6672;font-size:12px;font-weight:700;cursor:pointer;padding:0;z-index:5}.panelX:hover{background:#c0552c;border-color:#c0552c;color:#fff}';
  document.head.appendChild(st);
})();
function addPanelX(panel, onClose) {
  if (!panel) return;
  const old = panel.querySelector(':scope > .panelX'); if (old) old.remove();
  const x = document.createElement('button'); x.className = 'panelX'; x.title = 'Close'; x.textContent = '✕';
  x.onclick = ev => { ev.stopPropagation(); onClose(); };
  panel.appendChild(x);
}
(() => {   // Edit-times panel keeps its ✕ (only stepsHost re-renders inside it)
  const tb = document.getElementById('timesbtn');
  addPanelX(timeBox, () => { timeBox.style.display = 'none'; if (tb) tb.classList.remove('on'); });
})();
/* ---- hover tooltips: every toolbar control shows a short plain-English
   description of what it does. One styled bubble (instant, consistent);
   existing title attributes are absorbed so nothing double-shows. ---- */
(() => {
  const TIPS = {
    play: 'Run / pause the simulation', reset: 'Set both line clocks back to 0',
    playScope: 'Choose which lines run when you press Play',
    n: 'How many units this run builds', speed: 'Simulation speed',
    addStation: 'Add a new station table — it lands on the floor and in Edit times',
    edit: 'Edit layout: drag tables, carts, waypoints and areas; grid + lanes turn on',
    addwp: 'Add a waypoint to the selected cart’s DELIVERY path (elevator → cart)',
    returnwp: 'Add a waypoint to the selected cart’s RETURN path (cart → endpoint)',
    lanesBtn: 'Show / hide the 5′ lanes while editing',
    runCartsBtn: 'Preview the materials carts driving their delivery loops (elevator → cart → back) while you edit the routes',
    endsBtn: 'Show each cart line’s endpoint flag — drag one to end that line somewhere other than the elevator; right-click it to snap back',
    shipStartBtn: 'Choose which table each line’s green furniture lane ships from',
    helparrow: 'Draw a help path: click the FROM station, then the TO station',
    flowarrow: 'Draw a flow line between stations: click FROM, then TO — sets the build order',
    rotbtn: 'Rotate the selected table 90°',
    accesspt: 'Add a forklift access point — the green furniture lanes run to the nearest one',
    addForklift: 'Add a Forklift Access pad with its own animated forklift — drag it into place, right-click to remove. Lanes route to the nearest forklift.',
    flowLanesBtn: 'Show / hide the green furniture-flow lanes — the boxes keep traveling either way',
    availBtn: 'Set the available minutes per worker per day — drives takt (= time ÷ demand), capacity and units/day everywhere',
    lineFocusSel: 'Look at one line by itself — every other line\u2019s tables, crew, carts, lanes and boxes disappear',
    rackbtn: 'Add a finished-goods rack',
    labels: 'Cycle the station labels: names / times / hidden',
    timesbtn: 'Open the station-times panel — edit steps, minutes and people per station',
    idlebtn: 'Idle time per operator across the day',
    helppaths: 'List and tune the help paths (minutes of help per unit)',
    taskbtn: 'Task distribution chart — operator loading vs the takt line',
    plannerbtn: 'Planner: pick the day\'s furniture, quantities and build order; it creates the schedule',
    taktbtn: 'Takt board: pace, capacity and takt for every product on every line, side by side',
    floorTools: 'Show / hide the floor-editing tools (stations, carts, lanes, racks)',
    layoutsBtn: 'Save, load, share, or bake in layouts',
    cloudBtn: 'Shared data status: local-only until IT configures the TUUCI SharePoint store',
    floorsBtn: 'Add or remove floor plans: import a CAD drawing (DXF) as a new floor, import standard-work CSVs as stations',
    cam: 'Angled 3-quarter camera view', top: 'Straight-down plan view',
    btn2d: 'Flat 2D layout view', cadBtn: 'Overlay the CAD floor plan 1:1 to compare against the model',
    layoutSel: 'Switch between saved layouts', saveLayout: 'Save the current layout under a name',
    delLayout: 'Delete the selected saved layout',
    bakeApp: 'Download a copy of this app with your layouts built in — opens correctly on any computer',
    exportLayout: 'Download the current layout as a file you can share',
    importLayout: 'Load a layout file shared with you',
    reportBtn: 'Open a printable report of the current layout for the line lead',
    areasBtn: 'Show / hide the surrounding warehouse areas',
    undoBtn: 'Undo the last layout change (Ctrl/Cmd+Z)',
  };
  const tipEl = document.createElement('div');
  tipEl.style.cssText = 'position:fixed;display:none;z-index:99;background:#1a2430;color:#fff;padding:6px 10px;border-radius:8px;font:11.5px/1.4 Arial,sans-serif;max-width:270px;box-shadow:0 6px 18px rgba(0,0,0,.3);pointer-events:none';
  document.body.appendChild(tipEl);
  document.querySelectorAll('button, select, input').forEach(el => {
    const tip = TIPS[el.id] || el.title || null;
    if (!tip) return;
    el.removeAttribute('title');
    el.dataset.tip = tip;
    el.addEventListener('mouseenter', () => {
      tipEl.textContent = el.dataset.tip;
      tipEl.style.display = 'block';
      const r = el.getBoundingClientRect();
      tipEl.style.left = Math.max(6, Math.min(window.innerWidth - tipEl.offsetWidth - 8, r.left)) + 'px';
      tipEl.style.top = (r.bottom + 7) + 'px';
    });
    el.addEventListener('mouseleave', () => { tipEl.style.display = 'none'; });
    el.addEventListener('click', () => { tipEl.style.display = 'none'; });
  });
})();
try { refreshRunSelectors(); } catch (e) {}
try { schedule(); update(); } catch (e) { console.error('init schedule/update failed', e); }
requestAnimationFrame(loop);   // always start the render loop

/* ============================================================
   TUUCI SHARED DATA (handoff Phase 1)
   The store is a SharePoint List (one row per layout) on the shared
   TUUCI site, reached through Microsoft Graph with each person's normal
   M365 sign-in. Until window.M3D_CLOUD is configured (after IT registers
   the app in Entra), everything keeps running local-only exactly as before.
   ============================================================ */
const CLOUD = (() => {
  const cfg = (typeof window !== 'undefined' && window.M3D_CLOUD) || {};
  const enabled = !!(((cfg.clientId && cfg.tenantId) || cfg.testToken) && cfg.siteHost && cfg.sitePath);
  return { cfg, enabled, state: enabled ? 'idle' : 'off', account: null, siteId: null, listId: null, items: {}, lastError: null, lastSync: 0, msal: null };
})();
const GRAPH_BASE = () => CLOUD.cfg.graphBase || 'https://graph.microsoft.com/v1.0';
async function cloudMsal() {
  if (!CLOUD.msal) {
    CLOUD.msal = new PublicClientApplication({
      auth: { clientId: CLOUD.cfg.clientId, authority: 'https://login.microsoftonline.com/' + CLOUD.cfg.tenantId, redirectUri: location.origin + location.pathname },
      cache: { cacheLocation: 'localStorage' },
    });
    await CLOUD.msal.initialize();
  }
  return CLOUD.msal;
}
async function cloudToken(interactive) {
  if (CLOUD.cfg.testToken) return CLOUD.cfg.testToken;
  const msal = await cloudMsal();
  const req = { scopes: ['Sites.ReadWrite.All'] };
  let acct = msal.getAllAccounts()[0];
  if (!acct) {
    if (!interactive) throw new Error('not signed in');
    const r = await msal.loginPopup(req); acct = r.account;
  }
  CLOUD.account = acct;
  try { const r = await msal.acquireTokenSilent({ ...req, account: acct }); return r.accessToken; }
  catch (e) { if (!interactive) throw e; const r = await msal.acquireTokenPopup(req); return r.accessToken; }
}
let __cloudInteractive = false;
async function gfetch(path, opt) {
  const tok = await cloudToken(__cloudInteractive);
  const url = path.startsWith('http') ? path : GRAPH_BASE() + path;
  const r = await fetch(url, { ...(opt || {}), headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', ...((opt && opt.headers) || {}) } });
  if (r.status === 412) { const err = new Error('conflict'); err.code = 412; throw err; }
  if (!r.ok) { const t = await r.text().catch(() => ''); const err = new Error('Graph ' + r.status + ': ' + t.slice(0, 240)); err.code = r.status; throw err; }
  return r.status === 204 ? null : r.json();
}
async function cloudEnsureList() {
  if (CLOUD.listId) return;
  const site = await gfetch('/sites/' + CLOUD.cfg.siteHost + ':' + CLOUD.cfg.sitePath + '?$select=id');
  CLOUD.siteId = site.id;
  const name = CLOUD.cfg.listName || 'M3D Layouts';
  const ls = await gfetch(`/sites/${CLOUD.siteId}/lists?$select=id,displayName`);
  let list = (ls.value || []).find(l => l.displayName === name);
  if (!list) list = await gfetch(`/sites/${CLOUD.siteId}/lists`, { method: 'POST', body: JSON.stringify({ displayName: name, columns: [{ name: 'Data', text: { allowMultipleLines: true } }], list: { template: 'genericList' } }) });
  CLOUD.listId = list.id;
}
async function cloudPullAll() {
  await cloudEnsureList();
  const out = {};
  let url = `/sites/${CLOUD.siteId}/lists/${CLOUD.listId}/items?$expand=fields($select=Title,Data)&$top=200`;
  while (url) {
    const page = await gfetch(url);
    (page.value || []).forEach(it => {
      const nm = it.fields && it.fields.Title; if (!nm) return;
      CLOUD.items[nm] = { id: String(it.id), etag: it['@odata.etag'] || '' };
      try { out[nm] = JSON.parse(it.fields.Data || 'null'); } catch (e) {}
    });
    url = page['@odata.nextLink'] || null;
  }
  return out;
}
async function cloudPut(name, obj, force) {
  await cloudEnsureList();
  const known = CLOUD.items[name];
  if (known) {
    const headers = (force || !known.etag) ? {} : { 'If-Match': known.etag };
    await gfetch(`/sites/${CLOUD.siteId}/lists/${CLOUD.listId}/items/${known.id}/fields`, { method: 'PATCH', headers, body: JSON.stringify({ Data: JSON.stringify(obj) }) });
    const it = await gfetch(`/sites/${CLOUD.siteId}/lists/${CLOUD.listId}/items/${known.id}?$select=id`);
    known.etag = it['@odata.etag'] || '';
  } else {
    const it = await gfetch(`/sites/${CLOUD.siteId}/lists/${CLOUD.listId}/items`, { method: 'POST', body: JSON.stringify({ fields: { Title: name, Data: JSON.stringify(obj) } }) });
    CLOUD.items[name] = { id: String(it.id), etag: it['@odata.etag'] || '' };
  }
}
async function cloudDeleteItem(name) {
  const known = CLOUD.items[name]; if (!known) return;
  await gfetch(`/sites/${CLOUD.siteId}/lists/${CLOUD.listId}/items/${known.id}`, { method: 'DELETE' });
  delete CLOUD.items[name];
}
async function cloudPullOne(name) {
  const known = CLOUD.items[name]; if (!known) return null;
  const it = await gfetch(`/sites/${CLOUD.siteId}/lists/${CLOUD.listId}/items/${known.id}?$expand=fields($select=Title,Data)`);
  known.etag = it['@odata.etag'] || '';
  try { return JSON.parse(it.fields.Data || 'null'); } catch (e) { return null; }
}
// ---- sync engine: debounced working-layout push + named-layout diff push ----
let __cloudTimer = null, __cloudBusy = false, __cloudDirtyWorking = false, __namedPushed = {};
function cloudQueueWorking() {
  if (CLOUD.state !== 'on') return;
  __cloudDirtyWorking = true;
  clearTimeout(__cloudTimer); __cloudTimer = setTimeout(cloudFlush, 1800);
}
async function cloudFlush() {
  if (__cloudBusy || CLOUD.state !== 'on') return;
  __cloudBusy = true;
  try {
    if (__cloudDirtyWorking) {
      __cloudDirtyWorking = false;
      try { await cloudPut('__working', __workingLayout); }
      catch (e) { if (e.code === 412) await cloudConflictWorking(); else throw e; }
    }
    CLOUD.lastSync = Date.now(); CLOUD.lastError = null;
  } catch (e) { CLOUD.lastError = e.message || String(e); }
  finally { __cloudBusy = false; refreshCloudChip(); }
}
async function cloudConflictWorking() {
  const theirs = await cloudPullOne('__working');   // refreshes the etag either way
  const keepMine = confirm('Someone else just saved a different working layout to the shared store.\n\nOK = keep MY version (theirs is overwritten)\nCancel = load THEIR version');
  if (keepMine) { await cloudPut('__working', __workingLayout, true); }
  else if (theirs) {
    clearExtras(); helpArrows = []; buildHelp();
    applyWorkingLayout(theirs);
    __workingLayout = buildWorkingLayout();
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(__workingLayout)); } catch (e) {}
  }
}
function cloudSyncNamed(map) {
  if (CLOUD.state !== 'on') return;
  (async () => {
    try {
      for (const [nm, obj] of Object.entries(map)) {
        const j = JSON.stringify(obj);
        if (__namedPushed[nm] !== j) { await cloudPut(nm, obj); __namedPushed[nm] = j; }
      }
      for (const nm of Object.keys(__namedPushed)) {
        if (!(nm in map)) { await cloudDeleteItem(nm); delete __namedPushed[nm]; }
      }
      CLOUD.lastSync = Date.now(); CLOUD.lastError = null;
    } catch (e) { CLOUD.lastError = e.message || String(e); }
    refreshCloudChip();
  })();
}
async function cloudConnect(interactive) {
  if (!CLOUD.enabled || CLOUD.state === 'on' || CLOUD.state === 'connecting') return;
  __cloudInteractive = !!interactive;
  if (!interactive && !CLOUD.cfg.testToken) {   // only auto-connect when an account is already cached
    try { const msal = await cloudMsal(); if (!msal.getAllAccounts().length) { refreshCloudChip(); return; } }
    catch (e) { refreshCloudChip(); return; }
  }
  CLOUD.state = 'connecting'; refreshCloudChip();
  try {
    const all = await cloudPullAll();
    if (all.__working) {   // the shared store is the source of truth on connect
      clearExtras(); helpArrows = []; buildHelp();
      applyWorkingLayout(all.__working);
      __workingLayout = buildWorkingLayout();
      try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(__workingLayout)); } catch (e) {}
    } else { __cloudDirtyWorking = true; }   // first machine in seeds the store
    const local = readLayouts();
    const merged = Object.assign({}, local);
    Object.entries(all).forEach(([nm, obj]) => { if (nm !== '__working' && obj) { merged[nm] = obj; __namedPushed[nm] = JSON.stringify(obj); } });
    __namedCache = merged;
    try { localStorage.setItem(LAYOUTS_KEY, JSON.stringify(merged)); } catch (e) {}
    refreshLayoutSel(layoutSel.value);
    CLOUD.state = 'on';
    cloudFlush();
    cloudSyncNamed(merged);   // push anything the store doesn't have yet
  } catch (e) { CLOUD.state = 'error'; CLOUD.lastError = e.message || String(e); }
  __cloudInteractive = false;
  refreshCloudChip();
}
// ---- status chip in the toolbar ----
function refreshCloudChip() {
  const b = document.getElementById('cloudBtn'); if (!b) return;
  const map = { off: '☁ Local only', idle: '☁ Sign in', connecting: '☁ Connecting…', on: '☁ Shared ✓', error: '☁ Retry sync' };
  b.textContent = map[CLOUD.state] || '☁';
  b.classList.toggle('on', CLOUD.state === 'on');
  b.title = CLOUD.state === 'error' ? ('Sync error: ' + (CLOUD.lastError || '')) : '';
}
(() => {
  const gf = document.getElementById('grpFile'); if (!gf) return;
  const b = document.createElement('button'); b.id = 'cloudBtn';
  gf.parentNode.insertBefore(b, gf);
  b.onclick = () => {
    if (!CLOUD.enabled) {
      alert('Shared data is not configured yet, so this copy saves locally only.\n\nWhen IT registers the app in Microsoft Entra (see the handoff plan), fill in window.M3D_CLOUD near the top of this file: tenantId, clientId, siteHost, sitePath. From then on everyone who opens this page reads and writes ONE shared store on the TUUCI SharePoint site.');
      return;
    }
    if (CLOUD.state === 'on') {
      alert('Connected to the shared TUUCI store.\nSite: ' + CLOUD.cfg.siteHost + CLOUD.cfg.sitePath +
        '\nSigned in: ' + (CLOUD.account ? (CLOUD.account.username || CLOUD.account.name) : 'service') +
        (CLOUD.lastSync ? '\nLast sync: ' + new Date(CLOUD.lastSync).toLocaleTimeString() : '') +
        (CLOUD.lastError ? '\nLast error: ' + CLOUD.lastError : ''));
      return;
    }
    if (CLOUD.state === 'error') CLOUD.state = 'idle';
    cloudConnect(true);
  };
  refreshCloudChip();
  if (CLOUD.enabled) setTimeout(() => cloudConnect(false), 900);
})();

/* ============================================================
   FLOOR PLANS: import a CAD drawing (DXF) as a NEW floor beside the
   mezzanine, import standard-work CSVs as stations with their steps,
   and add/remove floors. Each imported floor is its own area: stations
   placed on it form their own independent line (flow arrows, help paths
   and animation all work), without touching the mezzanine lines.
   ============================================================ */
const floorGroups = {};                       // floor id -> THREE.Group (runtime only)
let floorSeq = 0;
function floorNextOrigin(w, d) {              // place new floors in a row east of the mezzanine
  let x = 30;
  customFloors.forEach(f => { x = Math.max(x, f.x + f.w + 8); });
  return { x, z: -d / 2 };
}
function buildFloorGroup(f) {
  const g = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(f.w, 0.5, f.d), deckMat);
  slab.position.set(f.x + f.w / 2, -0.29, f.z + f.d / 2); slab.receiveShadow = true; g.add(slab);
  for (const [cx, cz] of [[f.x + 0.6, f.z + 0.6], [f.x + f.w - 0.6, f.z + 0.6], [f.x + 0.6, f.z + f.d - 0.6], [f.x + f.w - 0.6, f.z + f.d - 0.6]]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.4, FLOOR2, 0.4), MAT.steel);
    col.position.set(cx, -FLOOR2 / 2 - 0.5, cz); g.add(col);
  }
  const walls = f.walls || [];
  if (walls.length) {                          // extrude the longer CAD segments as low walls; everything as floor lines
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x8b939c, roughness: 0.8 });
    let extruded = 0;
    const pts = [];
    walls.forEach(s => {
      const [x1, z1, x2, z2] = s, len = Math.hypot(x2 - x1, z2 - z1);
      pts.push(f.x + x1, 0.03, f.z + z1, f.x + x2, 0.03, f.z + z2);
      if (len >= 1.2 && extruded < 400) {
        extruded++;
        const wallH = 1.1;
        const m = new THREE.Mesh(new THREE.BoxGeometry(len, wallH, 0.1), wallMat);
        m.position.set(f.x + (x1 + x2) / 2, wallH / 2, f.z + (z1 + z2) / 2);
        m.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
        g.add(m);
      }
    });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x4b5560 })));
  }
  const lbl = makeMiniLabel(f.name, '#3f6f8f');
  lbl.position.set(f.x + f.w / 2, 3.2, f.z + f.d / 2); g.add(lbl);
  level2.add(g);
  floorGroups[f.id] = g;
}
function clearFloors() {
  Object.values(floorGroups).forEach(g => level2.remove(g));
  for (const k of Object.keys(floorGroups)) delete floorGroups[k];
  customFloors = [];
}
function restoreFloors(list) {
  clearFloors();
  (Array.isArray(list) ? list : []).forEach(f => {
    if (!f || !f.id || !(f.w > 0)) return;
    const num = parseInt(String(f.id).replace(/\D/g, '')) || 0; if (num > floorSeq) floorSeq = num;
    customFloors.push(f); buildFloorGroup(f);
  });
}
function addFloor(name, w, d, walls) {
  const { x, z } = floorNextOrigin(w, d);
  const f = { id: 'fl' + (++floorSeq), name: name || ('Floor ' + floorSeq), x, z, w: +w.toFixed(2), d: +d.toFixed(2), walls: walls || [] };
  customFloors.push(f); buildFloorGroup(f);
  saveLayout(); renderFloorsPanel();
  flyToFloor(f);
  return f;
}
function removeFloor(id) {
  const f = customFloors.find(x => x.id === id); if (!f) return;
  [...extraStations].forEach(sid => { const nd = nodes[sid]; if (nd && floorAt(nd.x, nd.z) === f) deleteStation(sid); });
  if (floorGroups[id]) { level2.remove(floorGroups[id]); delete floorGroups[id]; }
  customFloors = customFloors.filter(x => x.id !== id);
  saveLayout(); renderFloorsPanel();
}
function flyToFloor(f) {
  const c = new THREE.Vector3(f.x + f.w / 2, 0, f.z + f.d / 2).applyMatrix4(level2.matrixWorld);
  controls.target.copy(c);
  camera.position.set(c.x + f.w * 0.35, c.y + Math.max(f.w, f.d) * 0.9 + 8, c.z + f.d * 1.1);
  camera.lookAt(c);
}
// next free spot for an imported station on a floor: simple grid inside the slab
function floorSlot(f) {
  const n = extraStations.filter(id => nodes[id] && floorAt(nodes[id].x, nodes[id].z) === f).length;
  const pitch = 3.2, margin = 2.0;
  const cols = Math.max(1, Math.floor((f.w - margin * 2) / pitch));
  const cx = f.x + margin + (n % cols) * pitch + pitch / 2;
  const cz = f.z + margin + Math.floor(n / cols) * pitch;
  return { x: Math.min(cx, f.x + f.w - margin), z: Math.min(cz, f.z + f.d - margin) };
}
// ---- DXF (DraftSight export) → floor geometry ----
function parseDXF(text) {
  const raw = text.split(/\r\n|\r|\n/);
  const pairs = [];
  for (let i = 0; i + 1 < raw.length; i += 2) { const c = parseInt(raw[i], 10); if (!isNaN(c)) pairs.push([c, raw[i + 1]]); }
  let units = null, pendingVar = null;
  const segs = [], polys = [];
  let ent = null;   // {type:'LINE', x1..} | {type:'POLY', pts:[], closed}
  const flush = () => {
    if (!ent) return;
    if (ent.type === 'LINE' && [ent.x1, ent.y1, ent.x2, ent.y2].every(v => typeof v === 'number')) segs.push([ent.x1, ent.y1, ent.x2, ent.y2]);
    if (ent.type === 'POLY' && ent.pts.length >= 2) polys.push(ent);
    ent = null;
  };
  for (const [c, vRaw] of pairs) {
    const v = vRaw.trim();
    if (c === 9) { pendingVar = v; continue; }
    if (c === 70 && pendingVar === '$INSUNITS') { units = parseInt(v, 10); pendingVar = null; continue; }
    if (c === 0) { flush(); pendingVar = null; if (v === 'LINE') ent = { type: 'LINE' }; else if (v === 'LWPOLYLINE' || v === 'POLYLINE') ent = { type: 'POLY', pts: [], closed: false }; continue; }
    if (!ent) continue;
    const n = parseFloat(v);
    if (ent.type === 'LINE') {
      if (c === 10) ent.x1 = n; else if (c === 20) ent.y1 = n; else if (c === 11) ent.x2 = n; else if (c === 21) ent.y2 = n;
    } else {
      if (c === 70) ent.closed = (parseInt(v, 10) & 1) === 1;
      else if (c === 10) ent.pts.push([n, 0]);
      else if (c === 20 && ent.pts.length) ent.pts[ent.pts.length - 1][1] = n;
    }
  }
  flush();
  polys.forEach(p => { for (let i = 0; i + 1 < p.pts.length; i++) segs.push([p.pts[i][0], p.pts[i][1], p.pts[i + 1][0], p.pts[i + 1][1]]); if (p.closed && p.pts.length > 2) { const a = p.pts[p.pts.length - 1], b = p.pts[0]; segs.push([a[0], a[1], b[0], b[1]]); } });
  if (!segs.length) return null;
  let minX = 1e12, minY = 1e12, maxX = -1e12, maxY = -1e12;
  segs.forEach(s => { minX = Math.min(minX, s[0], s[2]); maxX = Math.max(maxX, s[0], s[2]); minY = Math.min(minY, s[1], s[3]); maxY = Math.max(maxY, s[1], s[3]); });
  const UNIT = { 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1 };
  let k = UNIT[units];
  if (!k) { const span = Math.max(maxX - minX, maxY - minY); k = [1, 0.3048, 0.0254, 0.001].find(f2 => span * f2 <= 90) || 0.001; }   // no unit header: pick the scale that lands under ~90 m
  const W = (maxX - minX) * k, D = (maxY - minY) * k;
  if (!(W > 0.5) || !(D > 0.5)) return null;
  const tx = (x) => (x - minX) * k, tz = (y) => (maxY - y) * k;   // CAD north stays "up" in top view (no mirroring)
  const tables = [], tableSegKeys = new Set();
  const segKey = (x1, y1, x2, y2) => [x1, y1, x2, y2].map(v => v.toFixed(3)).join('|');
  polys.forEach(p => {   // closed table-sized rectangles → station candidates (their edges are furniture, not walls)
    if (!p.closed || p.pts.length < 4 || p.pts.length > 5) return;
    let a = 1e12, b2 = -1e12, c2 = 1e12, d2 = -1e12;
    p.pts.forEach(([px, py]) => { a = Math.min(a, px); b2 = Math.max(b2, px); c2 = Math.min(c2, py); d2 = Math.max(d2, py); });
    const tw = (b2 - a) * k, td = (d2 - c2) * k;
    if (tw >= 0.5 && tw <= 4 && td >= 0.5 && td <= 4) {
      tables.push({ x: tx((a + b2) / 2), z: tz((c2 + d2) / 2) });
      for (let i = 0; i < p.pts.length; i++) { const u = p.pts[i], v2 = p.pts[(i + 1) % p.pts.length]; tableSegKeys.add(segKey(u[0], u[1], v2[0], v2[1])); tableSegKeys.add(segKey(v2[0], v2[1], u[0], u[1])); }
    }
  });
  const walls = segs.filter(s => !tableSegKeys.has(segKey(s[0], s[1], s[2], s[3]))).map(s => [tx(s[0]), tz(s[1]), tx(s[2]), tz(s[3])]).filter(s => Math.hypot(s[2] - s[0], s[3] - s[1]) > 0.05).slice(0, 3000);
  return { w: +W.toFixed(2), d: +D.toFixed(2), walls, tables, unitFactor: k, segCount: segs.length };
}
// ---- standard-work CSV → a station carrying every parsed step ----
function parseCSVText(text) {
  const rows = []; let cur = [], val = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { val += '"'; i++; } else q = false; } else val += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { cur.push(val); val = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; cur.push(val); rows.push(cur); cur = []; val = ''; }
    else val += ch;
  }
  if (val !== '' || cur.length) { cur.push(val); rows.push(cur); }
  return rows;
}
function parseSWITime(s) {
  if (!s) return null;
  const t = String(s).trim(); if (!t) return null;
  let m = t.match(/(\d+)\s*minutes?\s*(?:and\s*)?(\d+)\s*seconds?/i); if (m) return +m[1] + (+m[2]) / 60;
  m = t.match(/(\d+(?:\.\d+)?)\s*min/i); if (m) return +m[1];
  m = t.match(/(\d{1,3})\s*:\s*([0-5]\d)\b/); if (m) return +m[1] + (+m[2]) / 60;
  m = t.match(/^(\d{1,3}(?:\.\d+)?)$/); if (m && +m[1] > 0 && +m[1] < 500) return +m[1];
  return null;
}
function parseSWICSV(text) {
  const rows = parseCSVText(text);
  const steps = [];
  rows.forEach(r => {
    let time = null, desc = '';
    r.forEach(cell => {
      if (time == null) { const tv = parseSWITime(cell); if (tv != null && !(String(cell).trim().match(/^\d+$/) && +cell <= 40 && desc === '' )) time = tv; }
      if (String(cell || '').trim().length > Math.max(15, desc.length)) desc = String(cell).trim();
    });
    if (time == null || !desc || desc.length < 10) return;
    if (/standard work instruction|total process time|process ppe|tool list|^version/i.test(desc)) return;   // header rows, not steps
    if (time > 150) return;                                    // a single step over 2.5 hours is a sheet total, not a step
    let name = desc.split('\n')[0];
    const ci = name.indexOf(':'); if (ci > 3 && ci < 60) name = name.slice(0, ci);
    if (name.length > 58) name = name.slice(0, 55) + '…';
    steps.push({ name: name.trim(), t: +time.toFixed(2) });
  });
  return steps;
}
function importSWIFiles(files) {
  const f = customFloors[customFloors.length - 1] || null;
  let made = 0, report = [];
  const doOne = (file) => new Promise(res => {
    const rd = new FileReader();
    rd.onload = () => {
      const steps = parseSWICSV(String(rd.result || ''));
      if (!steps.length) { report.push(file.name + ': no steps found'); return res(); }
      const nm = file.name.replace(/\.(csv|txt)$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 40) || 'Imported SWI';
      const spot = f ? floorSlot(f) : { x: 27 + (made % 3) * 3.2, z: -6 + Math.floor(made / 3) * 3.2 };
      addStation(nm, spot.x, spot.z);
      const id = extraStations[extraStations.length - 1], nd = nodes[id];
      nd.s.steps = steps.map(s2 => ({ name: s2.name, t: s2.t }));
      recalcAny(id);
      made++;
      report.push(file.name + ': ' + steps.length + ' steps, ' + nd.s.steps.reduce((a2, s2) => a2 + s2.t, 0).toFixed(1) + ' min');
      res();
    };
    rd.onerror = () => { report.push(file.name + ': could not read'); res(); };
    rd.readAsText(file);
  });
  (async () => {
    for (const file of files) await doOne(file);
    renderTimes(); saveLayout(); renderFloorsPanel();
    if (typeof buildSolaSched === 'function') buildSolaSched();
    alert('Standard-work import:\n' + report.join('\n') + (f ? '\n\nStations placed on "' + f.name + '".' : '\n\nStations placed near the staging area (no imported floor yet).') + '\nOpen Edit times to review the steps.');
  })();
}
// ---- Floors panel ----
function renderFloorsPanel() {
  const p = document.getElementById('floorsPanel'); if (!p || p.style.display === 'none') return;
  let html = `<b style="font-size:13px">🏗 Floor plans</b>
    <div style="color:#5a6672;margin:2px 0 8px">Import a CAD drawing (DXF from DraftSight) as a new floor, then import standard-work CSVs as stations with their steps.</div>`;
  if (!customFloors.length) html += `<div style="color:#8a8f98;margin:6px 0">No imported floors yet, just the mezzanine.</div>`;
  customFloors.forEach(f => {
    const n = extraStations.filter(id => nodes[id] && floorAt(nodes[id].x, nodes[id].z) === f).length;
    html += `<div style="display:flex;align-items:center;gap:6px;border-top:1px solid #eef1f5;padding:6px 0">
      <b style="flex:1">${(f.name || f.id).replace(/</g, '&lt;')}</b>
      <span style="color:#5a6672">${f.w.toFixed(0)}×${f.d.toFixed(0)} m · ${n} station${n === 1 ? '' : 's'}</span>
      <button class="flGo" data-id="${f.id}" style="padding:2px 8px">✈ Go</button>
      <button class="flDel" data-id="${f.id}" style="padding:2px 8px;color:#c0552c">✕</button>
    </div>`;
  });
  html += `<div style="display:flex;flex-direction:column;gap:6px;margin-top:10px">
    <button id="flAddDxf" style="padding:6px">⬆ Import CAD floor (.dxf)</button>
    <button id="flAddBlank" style="padding:6px">＋ Blank floor</button>
    <button id="flAddSwi" style="padding:6px">⬆ Import standard work (.csv) → stations</button>
    <button id="flClose" style="padding:6px;background:#f2f6fb;color:#1d3a66;border:1px solid #c9d2dd;font-weight:700">Done</button>
  </div>`;
  p.innerHTML = html;
  p.querySelectorAll('.flGo').forEach(b => b.onclick = e => { const f = customFloors.find(x => x.id === e.target.dataset.id); if (f) flyToFloor(f); });
  p.querySelectorAll('.flDel').forEach(b => b.onclick = e => {
    const f = customFloors.find(x => x.id === e.target.dataset.id);
    if (f && confirm('Remove floor "' + f.name + '" and its stations?')) removeFloor(f.id);
  });
  const dxfI = document.getElementById('dxfFile'), swiI = document.getElementById('swiFile');
  const g1 = document.getElementById('flAddDxf'); if (g1 && dxfI) g1.onclick = () => dxfI.click();
  const g3 = document.getElementById('flAddSwi'); if (g3 && swiI) g3.onclick = () => swiI.click();
  const g2 = document.getElementById('flAddBlank'); if (g2) g2.onclick = () => {
    const nm = (prompt('Name for the new floor:', 'New floor') || '').trim(); if (!nm) return;
    const sz = (prompt('Size in meters, width x depth:', '20 x 14') || '').match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
    addFloor(nm, sz ? +sz[1] : 20, sz ? +sz[2] : 14, []);
  };
  const cl = document.getElementById('flClose'); if (cl) cl.onclick = () => { p.style.display = 'none'; };
}
(() => {   // Floors button + hidden file inputs
  const br = document.getElementById('buildRow'); if (!br) return;
  const b = document.createElement('button'); b.id = 'floorsBtn'; b.textContent = '🏗 Floors';
  br.appendChild(b);
  const p = document.createElement('div'); p.id = 'floorsPanel';
  p.style.cssText = 'position:fixed;display:none;z-index:61;left:50%;top:110px;transform:translateX(-50%);background:#fff;border:1px solid #d8dee6;border-radius:12px;box-shadow:0 12px 30px rgba(20,30,45,.2);padding:12px 14px;font:12px/1.5 Arial,sans-serif;color:#15263a;min-width:360px;max-width:440px;max-height:70vh;overflow:auto';
  document.body.appendChild(p);
  const dxfI = document.createElement('input'); dxfI.type = 'file'; dxfI.id = 'dxfFile'; dxfI.accept = '.dxf'; dxfI.style.display = 'none'; document.body.appendChild(dxfI);
  const swiI = document.createElement('input'); swiI.type = 'file'; swiI.id = 'swiFile'; swiI.accept = '.csv,.txt'; swiI.multiple = true; swiI.style.display = 'none'; document.body.appendChild(swiI);
  b.onclick = () => { p.style.display = p.style.display === 'none' ? 'block' : 'none'; renderFloorsPanel(); };
  dxfI.onchange = () => {
    const file = dxfI.files && dxfI.files[0]; dxfI.value = ''; if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      const geo = parseDXF(String(rd.result || ''));
      if (!geo) { alert('Could not read usable geometry from that DXF. Export from DraftSight as ASCII DXF (R12 or newer) and try again.'); return; }
      const nm = (prompt('Name for this floor:', file.name.replace(/\.dxf$/i, '')) || '').trim() || file.name;
      const f = addFloor(nm, geo.w, geo.d, geo.walls);
      let msg = 'Imported "' + nm + '": ' + geo.w.toFixed(1) + ' × ' + geo.d.toFixed(1) + ' m, ' + geo.walls.length + ' wall segments (scale ' + geo.unitFactor + ' m/unit).';
      if (geo.tables.length && confirm(msg + '\n\nDetected ' + geo.tables.length + ' table-sized rectangles. Create a station at each one?')) {
        geo.tables.slice(0, 40).forEach((t2, i) => addStation('Table ' + (i + 1), f.x + t2.x, f.z + t2.z));
        renderTimes(); saveLayout(); renderFloorsPanel();
      } else if (!geo.tables.length) alert(msg + '\nNo table-sized rectangles detected; add stations with ＋ Add station or import standard-work CSVs.');
    };
    rd.readAsText(file);
  };
  swiI.onchange = () => { const files = [...(swiI.files || [])]; swiI.value = ''; if (files.length) importSWIFiles(files); };
})();
