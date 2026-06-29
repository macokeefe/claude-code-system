import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

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

function makeStationLabel(title, sub, timeStr, accent = '#1d3a66') {
  const W = 900, H = 250;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(10,16,26,0.18)'; x.beginPath(); x.roundRect(14, 18, W - 22, H - 24, 22); x.fill();
  x.fillStyle = '#ffffff'; x.beginPath(); x.roundRect(8, 8, W - 26, H - 28, 22); x.fill();
  x.fillStyle = accent; x.beginPath(); x.roundRect(8, 8, W - 26, 92, 22); x.fill();
  x.fillStyle = accent; x.fillRect(8, 62, W - 26, 38);
  x.fillStyle = '#ffffff'; x.font = '900 56px Arial, sans-serif'; x.textAlign = 'left';
  x.fillText(title, 34, 74);
  x.textAlign = 'right'; x.font = '800 50px Arial, sans-serif';
  x.fillText(timeStr, W - 40, 72);
  x.textAlign = 'left'; x.fillStyle = '#10151d'; x.font = '700 52px Arial, sans-serif';
  x.fillText(sub, 36, 178);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 8;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(3.5, 0.95, 1); sp.renderOrder = 999;
  sp.userData.redraw = (timeStr2, accent2) => {
    x.clearRect(0,0,W,H);
    x.fillStyle = 'rgba(10,16,26,0.18)'; x.beginPath(); x.roundRect(14, 18, W - 22, H - 24, 22); x.fill();
    x.fillStyle = '#ffffff'; x.beginPath(); x.roundRect(8, 8, W - 26, H - 28, 22); x.fill();
    x.fillStyle = accent2||accent; x.beginPath(); x.roundRect(8, 8, W - 26, 92, 22); x.fill();
    x.fillStyle = accent2||accent; x.fillRect(8, 62, W - 26, 38);
    x.fillStyle = '#ffffff'; x.font = '900 56px Arial, sans-serif'; x.textAlign = 'left';
    x.fillText(title, 34, 74);
    x.textAlign = 'right'; x.font = '800 50px Arial, sans-serif'; x.fillText(timeStr2, W - 40, 72);
    x.textAlign = 'left'; x.fillStyle = '#10151d'; x.font = '700 52px Arial, sans-serif'; x.fillText(sub, 36, 178);
    tex.needsUpdate = true;
  };
  return sp;
}

function makeMiniLabel(title, accent) {
  const c = document.createElement('canvas'); c.width = 480; c.height = 96; const x = c.getContext('2d');
  x.fillStyle = accent || '#1d3a66'; x.beginPath(); x.roundRect(8, 22, 464, 52, 16); x.fill();
  x.fillStyle = '#ffffff'; x.font = '700 38px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(title, 240, 49);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 8;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(2.4, 0.48, 1); sp.renderOrder = 999;
  return sp;
}
function makeNameTag(name, colorHex) {
  const c = document.createElement('canvas'); c.width = 320; c.height = 92;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.beginPath(); x.roundRect(0, 0, 320, 92, 28); x.fill();
  x.fillStyle = '#' + colorHex.toString(16).padStart(6, '0');
  x.beginPath(); x.roundRect(0, 0, 18, 92, { tl: 28, bl: 28, tr: 0, br: 0 }); x.fill();
  x.fillStyle = '#1a2230'; x.font = '800 40px Arial, sans-serif'; x.textAlign = 'center';
  x.fillText(String(name).slice(0, 14), 168, 58);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, opacity: 0.96 }));
  sp.scale.set(1.25, 0.36, 1); sp.renderOrder = 998;
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
  // anti-fatigue mat on the operator side (front, +z)
  const mat = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.025, 0.9), MAT.mat);
  mat.position.set(0, 0.013, D/2 + 0.6); mat.receiveShadow = true; st.add(mat);
  for (const dz of [-0.45, 0.45]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.027, 0.08), MAT.matEdge);
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
    const bin = bx(0.28, 0.16, 0.52, i % 2 ? MAT.binBlue : MAT.binYellow); bin.position.set(-0.32 + i * 0.32, y + 0.1, 0); g.add(bin);
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
  else if (kind === 'trellis') { for(let i=0;i<4;i++){const s=bx(0.9,0.05,0.08,MAT.cherry); s.position.z=-0.3+i*0.2; sub.add(s);} }
  else if (kind === 'seat') { const a=rail(1.4); a.position.z=-0.4; sub.add(a); const b=rail(1.4); b.position.z=0.4; sub.add(b); for(let i=0;i<5;i++){const s=cyl(0.02,0.85,MAT.chrome); s.rotation.x=Math.PI/2; s.position.x=-0.5+i*0.25; sub.add(s);} }
  else { for(let i=0;i<3;i++){const c=bx(0.16,0.1,0.1,MAT.cherry); c.position.x=-0.25+i*0.25; sub.add(c);} } // connectors
  return sub;
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
  { id:'arm', title:'ARMS',         sub:'Arm assembly', ppl:2, t:64,    role:'feeder', kind:'arm',        accent:'#1d3a66', double:true, steps:[{name:'Arm assembly', t:64}] },
  { id:'bak', title:'BACK FRAME',   sub:'Back frame',   ppl:1, t:43.5,  role:'feeder', kind:'back',       accent:'#1d3a66', steps:[{name:'Back frame', t:43.5}] },
  { id:'tre', title:'TRELLIS',      sub:'Trellis',      ppl:1, t:22.5,  role:'feeder', kind:'trellis',    accent:'#1d3a66', steps:[{name:'Trellis', t:22.5}] },
  { id:'sea', title:'SEAT FRAME',   sub:'Seat frame',   ppl:1, t:47,    role:'feeder', kind:'seat',       accent:'#9a3b1f', bot:true, steps:[{name:'Seat frame', t:47}] },
  { id:'fa',  title:'FULL ASSEMBLY',sub:'Assemble frame',ppl:2, t:58,   role:'fa',     accent:'#1d3a66', steps:[{name:'Assemble frame', t:58}] },
  { id:'pak', title:'CUSHIONS & PACK',sub:'Cushions + ship',ppl:0, t:18, role:'pack',   accent:'#236043', steps:[{name:'Cushions + pack', t:18}] },
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
function eff(id) { const s = get(id); return (s.t || 0) / Math.max(1, s.ppl || 1) + walkOf(id); }   // step times are TOTAL; cycle = total / people
function helpInto(id) { return (typeof helpArrows === 'undefined') ? 0 : helpArrows.reduce((s, a) => s + (a.to === id ? (a.helpMin || 0) : 0), 0); }
function helpFromOp(id, idx) { return (typeof helpArrows === 'undefined') ? 0 : helpArrows.reduce((s, a) => s + ((a.from === id && (a.fromIdx || 0) === idx) ? (a.helpMin || 0) : 0), 0); }
function effNet(id) { return Math.max(0.1, eff(id) - helpInto(id)); }   // a helped station's time drops by the help minutes
function lineCyc() { return sch ? Math.max(sch.conT, sch.armT, sch.bakT, sch.treT, sch.seaT, sch.ASM + sch.PACK) : 1; }
function availIdleOp(id, idx) { return Math.max(0, lineCyc() - effNet(id) - helpFromOp(id, idx)); }   // spare min/chair a specific operator can give
function schedule() {
  const seaT=effNet('sea'), armT=effNet('arm'), bakT=effNet('bak'), treT=effNet('tre'), conT=effNet('con');
  const ASM=effNet('fa'), PACK=effNet('pak');
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
  const cyc=Math.max(conT,armT,bakT,treT,seaT,ASM+PACK);
  const cap=420/cyc;
  let bot='Seat frame', bv=seaT;
  [['Connectors',conT],['Arms',armT],['Back frame',bakT],['Trellis',treT],['Seat frame',seaT],['Full assy + pack',ASM+PACK]]
    .forEach(([nm,v])=>{ if(v>bv){bv=v;bot=nm;} });
  ui.cyc.textContent=cyc.toFixed(1).replace(/\.0$/,'');
  ui.cap.textContent=cap.toFixed(1);
  ui.bot.textContent=`${bot} (${bv.toFixed(1).replace(/\.0$/,'')})`;
  ui.nOut.textContent=N;
  if (ui.labor) ui.labor.textContent = ST.reduce((a,s)=>a+(s.t||0),0).toFixed(0);   // total one-person labor content/unit
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

const DECK = { x0:-5.1, x1:-5.1 + 40*FT, z0:-10.4, z1:-10.4 + 68*FT };   // real Meritage area: 40' wide x 68' deep (3/8"=1' scale)
const deckW = DECK.x1 - DECK.x0, deckD = DECK.z1 - DECK.z0;
const deckCx = (DECK.x0 + DECK.x1)/2, deckCz = (DECK.z0 + DECK.z1)/2;
const deckMat = new THREE.MeshStandardMaterial({ color:0xb7bcc2, roughness:0.7, metalness:0.3 });
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
level2.add(railing(DECK.x0,DECK.z0,DECK.x1,DECK.z0));   // back
level2.add(railing(DECK.x0,DECK.z1,DECK.x1,DECK.z1));   // front
level2.add(railing(DECK.x0,DECK.z0,DECK.x0,4));         // left (lower)
level2.add(railing(DECK.x0,8,DECK.x0,DECK.z1));         // left (upper) — gap 4..8 = elevator opening
// (no railing on the right/shared edge — the two floors butt together, divided only by the painted line)

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
level2.add(railing(MX0,DECK.z0,MX1,DECK.z0));       // mirror back
level2.add(railing(MX0,DECK.z1,MX1,DECK.z1));       // mirror front
level2.add(railing(MX1,DECK.z0,MX1,DECK.z1));       // mirror right (outer)
// crossable divider line (painted, not a wall) with an open crossing at the connector station
const dividerGroup = new THREE.Group(); level2.add(dividerGroup);
function rebuildDivider(){
  while (dividerGroup.children.length) dividerGroup.remove(dividerGroup.children[0]);
  const dx = DECK.x1 + AISLE/2;
  const gapC = (typeof nodes !== 'undefined' && nodes.con) ? nodes.con.z : -8.5;   // crossing follows the connector station
  for (let z = DECK.z0; z < DECK.z1; z += 1.2) {
    if (Math.abs((z + 0.35) - gapC) < 2.2) continue;                                 // skip dashes = crossing opening
    const seg = bx(0.12, 0.02, 0.7, MAT.tape); seg.position.set(dx, 0.06, z + 0.35); dividerGroup.add(seg);
  }
  const cross = bx(0.6, 0.02, 4.0, new THREE.MeshStandardMaterial({ color:0x2f7d52, transparent:true, opacity:0.45 }));
  cross.position.set(dx, 0.05, gapC); dividerGroup.add(cross);                       // green crossing marker
}
rebuildDivider();

// proper enclosed freight elevator that docks the floor edge
function makeElevator(x,z){
  const shaft = new THREE.Group();
  const S = 1.4, H = FLOOR2 + 1.7, CH = 2.2;          // half-width, shaft height, cab height
  const wallMat = new THREE.MeshStandardMaterial({ color:0xc7ccd2, roughness:0.5, metalness:0.5 });
  // shaft guide posts + header + motor + cable
  for (const [px,pz] of [[-S,-S],[S,-S],[-S,S],[S,S]]) { const p=bx(0.16,H,0.16,MAT.rackPost); p.position.set(x+px,H/2,z+pz); shaft.add(p); }
  const header = bx(2*S+0.3,0.26,2*S+0.3,MAT.rackBeam); header.position.set(x,H,z); shaft.add(header);
  const motor = bx(1.0,0.6,1.0,MAT.steel); motor.position.set(x,H+0.4,z); shaft.add(motor);
  const cable = bx(0.05,H,0.05,MAT.pants); cable.position.set(x,H/2,z); shaft.add(cable);
  // enclosed cab (floor, roof, back + 2 side walls, open front doorway)
  const car = new THREE.Group();
  car.add(bx(2*S,0.14,2*S,MAT.steel));                                   // floor
  const roof=bx(2*S,0.1,2*S,MAT.steel); roof.position.y=CH; car.add(roof);
  const back=bx(2*S,CH,0.08,wallMat); back.position.set(0,CH/2,-S); car.add(back);
  const lw=bx(0.08,CH,2*S,wallMat); lw.position.set(-S,CH/2,0); car.add(lw);
  const rw=bx(0.08,CH,2*S,wallMat); rw.position.set(S,CH/2,0); car.add(rw);
  for (const px of [-S+0.1,S-0.1]) { const j=bx(0.12,CH,0.12,MAT.steel); j.position.set(px,CH/2,S); car.add(j); }   // front jambs
  const headr=bx(2*S,0.2,0.12,MAT.steel); headr.position.set(0,CH-0.1,S); car.add(headr);
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

// ---- forklift ACCESS POINTS (@) on the platform edge + editable elevator ----
const elBX = DECK.x0 - 1.6, elBZ = 2;     // elevator built position (for dragging)
function moveElevator(x,z){ elevator.shaft.position.set(x - elBX, 0, z - elBZ); EL[0]=x; EL[1]=z; if (typeof refreshPath==='function') refreshPath(); }
// finished-goods package (boxed sofa)
function makePackage(){ const g=new THREE.Group(); const b=bx(1.5,0.55,0.75,MAT.box); b.position.y=0.3; g.add(b); const t=bx(1.52,0.05,0.26,MAT.boxWhite); t.position.set(0,0.58,0); g.add(t); return g; }
// forklift openings: gaps in the platform; a forklift carries a package DOWN when triggered
const forkLifts = [];
function makeForkGap(){
  const g = new THREE.Group();
  const W = 2.6, D = 2.0;                                   // ~8.5' x 6.5' opening (fits a sofa)
  const hole = new THREE.Mesh(new THREE.BoxGeometry(W, 0.5, D), new THREE.MeshStandardMaterial({ color:0x10141a, roughness:0.96 }));
  hole.position.y = -0.24; g.add(hole);                     // dark recess = the opening
  for (const [w,d,x,z] of [[W+0.3,0.22,0,-D/2-0.1],[W+0.3,0.22,0,D/2+0.1],[0.22,D+0.5,-W/2-0.1,0],[0.22,D+0.5,W/2+0.1,0]]) {
    const b = bx(w,0.04,d,MAT.matEdge); b.position.set(x,0.045,z); g.add(b);          // yellow hazard border
  }
  for (const [x0,z0,x1,z1] of [[-W/2,-D/2,W/2,-D/2],[-W/2,-D/2,-W/2,D/2],[W/2,-D/2,W/2,D/2]]) {
    const dx=x1-x0,dz=z1-z0,len=Math.hypot(dx,dz),ang=Math.atan2(dz,dx);
    const r=bx(len,0.05,0.05,MAT.steel); r.position.set((x0+x1)/2,1.0,(z0+z1)/2); r.rotation.y=-ang; g.add(r);   // 3-sided guard rail
  }
  // forklift truck on the GROUND below the opening, doing the lifting
  const yel = new THREE.MeshStandardMaterial({ color:0xd9a300, roughness:0.55, metalness:0.3 });
  const groundY = -FLOOR2;
  const truck = new THREE.Group(); truck.position.set(0, groundY, D/2 + 1.1);          // parked in front of the opening
  const body = bx(1.8,0.9,1.1,yel); body.position.y=0.6; truck.add(body);
  const cwt = bx(0.5,0.8,1.1,yel); cwt.position.set(0,0.55,0.85); truck.add(cwt);
  for (const [px,pz] of [[-0.7,-0.45],[-0.7,0.45],[0.7,-0.45],[0.7,0.45]]) { const w=cyl(0.3,0.24,MAT.pants); w.rotation.x=Math.PI/2; w.position.set(px,0.3,pz); truck.add(w); }
  for (const px of [-0.45,0.45]) { const p=bx(0.08,1.3,0.08,MAT.steel); p.position.set(px,1.6,0.3); truck.add(p); }   // overhead guard
  const guard = bx(1.1,0.08,1.0,MAT.steel); guard.position.set(0,2.25,0.2); truck.add(guard);
  const drv = makeCrewFigure(0x767d88,'Forklift'); drv.scale.set(0.8,0.65,0.8); drv.position.set(0,0.8,0.4); truck.add(drv);
  g.add(truck);
  // tall mast rails from the ground up to the deck at the opening (the lift travels these)
  for (const px of [-0.55,0.55]) { const m=bx(0.12, FLOOR2+0.2, 0.12, MAT.steel); m.position.set(px, groundY + (FLOOR2+0.2)/2, -D/2 + 0.5); g.add(m); }
  // fork carriage + furniture that rides up/down through the gap
  const lift = new THREE.Group();
  for (const pz of [-0.35,0.35]) { const fk = bx(1.3,0.08,0.16,MAT.steel); fk.position.set(0,0,pz); lift.add(fk); }   // forks
  const pkg = makePackage(); pkg.scale.set(0.7,0.7,0.7); pkg.position.y=0.12; pkg.visible=false; lift.add(pkg);
  g.add(lift);
  const rec = { lift, busy:false, t:0, pkg }; forkLifts.push(rec);
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
function triggerTakedown(){ const fl=forkLifts.find(f=>!f.busy); if(fl){ fl.busy=true; fl.t=0; fl.pkg.visible=true; } }
function fillRacks(){ let n=onRacks; for(const r of racks) for(const s of r.slots){ s.visible = n>0; if(n>0) n--; } }

// the single materials cart (holds all parts) — draggable; feeders pull from this one spot
// draggable cart SPOT (front of the queue) — feeders pull parts from here
const cartPad = new THREE.Group();
const pad = bx(2.7, 0.04, 2.7, new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.9, transparent: true, opacity: 0.45 }));
pad.position.y = 0.025; cartPad.add(pad);
for (const dx of [-1.35, 1.35]) { const e = bx(0.1, 0.03, 2.7, MAT.tape); e.position.set(dx, 0.03, 0); cartPad.add(e); }
for (const dz of [-1.35, 1.35]) { const e = bx(2.7, 0.03, 0.1, MAT.tape); e.position.set(0, 0.03, dz); cartPad.add(e); }
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
for (let i = 0; i < 3; i++) { const c = makePartsCart(); c.scale.set(1.4, 1.3, 1.4); c.visible = false; level2.add(c); cartPool.push({ mesh: c, state: 'down', slot: -1, remaining: 0 }); }
let elevBusy = false, carY = 0.4, lastConsumed = 0, lastSimT = 0;

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
function refreshPath() {
  const p = pathPts(); const arr = [];
  for (const pt of p) arr.push(pt[0], 0.12, pt[1]);
  pathLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  pathLine.geometry.setDrawRange(0, p.length);
  pathLine.geometry.computeBoundingSphere();
  if (pathLine.computeLineDistances) pathLine.computeLineDistances();
  while (wpGroup.children.length) wpGroup.remove(wpGroup.children[0]);
  cartWaypoints.forEach((w, i) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.7, 16), WP_MAT); m.position.set(w.x, 0.35, w.z); m.userData.wp = i; wpGroup.add(m); });
}

// ---- help-movement arrows: where an operator goes to help after finishing ----
let helpArrows = [                    // [{from, fromIdx, to, helpMin}] — per-operator starter paths
  { from:'tre', fromIdx:0, to:'sea', helpMin:5 },
  { from:'con', fromIdx:0, to:'sea', helpMin:5 },
];
const helpGroup = new THREE.Group(); level2.add(helpGroup);
const HELP_COL = 0x8f3fbf;
function assignHelpers() {
  if (typeof crew === 'undefined') return;
  crew.forEach(c => { c.helpTo = null; c.helpMin = 0; });
  helpArrows.forEach(a => {
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
  con:[-12, -3.2], arm:[-6, -3.2], bak:[0, -3.2], tre:[6, -3.2], sea:[12, -3.2],
  fa:[-2, 4.2], pak:[10, 4.2],
};
const nodes = {};
let opColorIdx = 0;
const crew = []; // {fig, station, homeX, homeZ}

ST.forEach(s => {
  const [x, z] = POS[s.id];
  let st, led;
  if (s.double) {                                  // Arms = two 8'x3' benches joined end-to-end (16' x 3')
    const g = new THREE.Group();
    const b1 = makeBench(8, 3), b2 = makeBench(8, 3);
    b1.st.position.x = -4 * FT; b2.st.position.x = 4 * FT;   // share the inner edge
    g.add(b1.st, b2.st);
    st = g; led = [b1.led, b2.led];
  } else if (s.role === 'fa') {
    const r = makeBench(10, 4); st = r.st; led = r.led;      // full assembly: larger table
  } else {
    const r = makeBench(8, 3); st = r.st; led = r.led;       // 8' x 3' workbench
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
    const bdx = (np > 1 ? (i - (np-1)/2) * 2 * spread : 0), bdz = 1.7;   // base offset from station (rotates with the table)
    fig.position.set(x + bdx, 0, z + bdz);
    level2.add(fig);
    crew.push({ fig, station: s.id, bdx, bdz, homeX: x + bdx, homeZ: z + bdz, idx: i });
  }
});
// register the materials cart as a draggable source node (nodes/POS now exist)
nodes.cart = { id:'cart', x:CART_DEF[0], z:CART_DEF[1], st:cartPad, s:{ id:'cart', title:'Materials cart' } };
POS.cart = [CART_DEF[0], CART_DEF[1]];
// shipped boxes pool near packing/ship dock
const shipBoxes = [];
for (let i = 0; i < 40; i++) { const b = makeShipBox(); b.visible = false; b.position.set(16 + (i%4)*2.0, 0, 4.2 + Math.floor(i/4)*1.2); level2.add(b); shipBoxes.push(b); }
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
const playBtn = document.getElementById('play');
function setPlay(v){ playing=v; playBtn.textContent = v ? '❚❚ Pause' : '▶ Play'; }
playBtn.onclick = () => { if (T >= horizon) T = 0; setPlay(!playing); };
document.getElementById('reset').onclick = () => { T = 0; setPlay(false); };
const nInput = document.getElementById('n');
nInput.value = N;
nInput.onchange = e => { N = Math.max(1, Math.min(40, parseInt(e.target.value)||8)); schedule(); T=0; setPlay(false); };
const speed = document.getElementById('speed');
document.getElementById('cam').onclick = () => { camera.position.set(7,30,52); controls.target.set(7,FLOOR2+0.8,0); };
document.getElementById('top').onclick = () => { camera.position.set(4,FLOOR2+38,1); controls.target.set(4,FLOOR2,1); };
// label visibility: 0 = off, 1 = names only (compact), 2 = full cards
let labelMode = 1;
function applyLabels() {
  ST.forEach(s => { const nd = nodes[s.id]; if (!nd) return; if (nd.label) nd.label.visible = labelMode === 2; if (nd.mini) nd.mini.visible = labelMode === 1; });
  if (typeof cartSign !== 'undefined' && cartSign) cartSign.visible = labelMode !== 0;
  const b = document.getElementById('labels'); if (b) b.textContent = 'Labels: ' + (labelMode === 0 ? 'Off' : labelMode === 1 ? 'Names' : 'Full');
}
document.getElementById('labels').onclick = () => { labelMode = (labelMode + 1) % 3; applyLabels(); };
applyLabels();

// build editable time rows
const timeBox = document.getElementById('times');
// walk-time controls
const moveCtl = document.createElement('div'); moveCtl.className = 'movectl';
moveCtl.innerHTML = `<label class="mck"><input type="checkbox" id="walkOn" checked/> add walk time (by distance)</label>
  <div class="mrow">Walk speed <input type="number" id="walkSpeed" value="60" min="10" step="5"/> yd/min</div>
  <div class="mrow">Trips / unit <input type="number" id="trips" value="1" min="0" step="0.5"/></div>
  <div class="mrow" style="color:#6b7785">Each cart = 1 sofa's materials</div>`;
timeBox.appendChild(moveCtl);
const stepsHost = document.createElement('div'); stepsHost.id = 'stepsHost'; timeBox.appendChild(stepsHost);
function renderTimes() {
  let html = '';
  ST.forEach(s => {
    const ppl = Math.max(1, s.ppl || 1), cyc = (s.t / ppl);
    html += `<div class="stblock">
      <div class="sttitle">${s.title}${s.bot?' <b style="color:#c0552c">◄</b>':''}<span class="sttot">${cyc.toFixed(1).replace(/\.0$/,'')} min/unit</span><span class="tw" id="walk_${s.id}"></span></div>`;
    (s.steps||[]).forEach((st, si) => {
      html += `<div class="strow">
        <input class="sname" data-id="${s.id}" data-si="${si}" value="${(st.name||'').replace(/"/g,'&quot;')}"/>
        <input class="stime" type="number" step="0.25" min="0" data-id="${s.id}" data-si="${si}" value="${st.t}"/>
        <span class="su">min (total)</span>
        <button class="sdel" data-id="${s.id}" data-si="${si}">✕</button></div>`;
    });
    html += `<div class="strow"><span class="su" style="flex:1">People at station</span>
        <input class="sppl" type="number" min="1" max="6" step="1" data-id="${s.id}" value="${ppl}"/>
        <span class="su">→ ${s.t.toFixed(0)}÷${ppl} = ${cyc.toFixed(1)}m</span></div>`;
    html += `<button class="sadd" data-id="${s.id}">+ add step</button></div>`;
  });
  stepsHost.innerHTML = html;
  stepsHost.querySelectorAll('input.sppl').forEach(inp => inp.onchange = e => {
    const s = get(e.target.dataset.id); s.ppl = Math.max(1, parseInt(e.target.value) || 1);
    rebuildCrew(s.id); placeStation(s.id); renderTimes(); schedule(); T = 0; setPlay(false); saveLayout();
  });
  stepsHost.querySelectorAll('input.sname').forEach(inp => inp.onchange = e => {
    get(e.target.dataset.id).steps[+e.target.dataset.si].name = e.target.value; saveLayout();
  });
  stepsHost.querySelectorAll('input.stime').forEach(inp => inp.onchange = e => {
    const s = get(e.target.dataset.id); s.steps[+e.target.dataset.si].t = parseFloat(e.target.value) || 0;
    recalc(s.id); renderTimes(); schedule(); T = 0; setPlay(false); saveLayout();
  });
  stepsHost.querySelectorAll('button.sadd').forEach(b => b.onclick = e => {
    const s = get(e.target.dataset.id); s.steps.push({ name: 'New step', t: 0 }); recalc(s.id); renderTimes(); saveLayout();
  });
  stepsHost.querySelectorAll('button.sdel').forEach(b => b.onclick = e => {
    const s = get(e.target.dataset.id); s.steps.splice(+e.target.dataset.si, 1); if (!s.steps.length) s.steps.push({ name: s.sub || 'Step', t: 0 });
    recalc(s.id); renderTimes(); schedule(); T = 0; setPlay(false); saveLayout();
  });
}
renderTimes();
document.getElementById('walkOn').onchange = e => { walkOn = e.target.checked; schedule(); T = 0; setPlay(false); };
document.getElementById('walkSpeed').onchange = e => { walkSpeed = Math.max(10, parseFloat(e.target.value) || 60); schedule(); T = 0; setPlay(false); };
document.getElementById('trips').onchange = e => { tripsPerUnit = Math.max(0, parseFloat(e.target.value) || 0); schedule(); T = 0; setPlay(false); };

// ---- idle-time-per-operator chart (full day) ----
let dayMin = 420;   // 7-hr working day
let taktDemand = 10;   // units/day target for the takt line
const idlePanel = document.getElementById('idlePanel');
const FEEDNAME = { con:'Connectors', arm:'Arms', bak:'Back frame', tre:'Trellis', sea:'Seat frame' };
function operatorsList() {
  const list = [];
  for (const id of ['con','arm','bak','tre','sea']) {
    const s = get(id), base = effNet(id);          // station's per-unit time (reduced if it receives help)
    for (let i = 0; i < s.ppl; i++) {
      const bpu = base + helpFromOp(id, i);         // each operator's own help time adds to their busy
      list.push({ name: FEEDNAME[id] + (s.ppl > 1 ? ' ' + (i+1) : ''), bpu });
    }
  }
  const faS = get('fa'), faBase = effNet('fa') + effNet('pak');   // FA pair also does the packing/cushions
  for (let i = 0; i < faS.ppl; i++) {
    list.push({ name: 'Full assembly ' + (i+1), bpu: faBase + helpFromOp('fa', i) });
  }
  return list;
}
function renderIdle() {
  if (!idlePanel || idlePanel.style.display === 'none') return;
  const ops = operatorsList();
  const cyc = Math.max(0.001, ...ops.map(o => o.bpu));     // line paces at the busiest operator
  const units = dayMin / cyc;
  let html = `<h3>Idle time per operator — ${(dayMin/60).toFixed(1)}-hr day</h3>`;
  html += `<div class="ihint">~${units.toFixed(1)} units/day · day length <input type="number" id="dayHrs" value="${(dayMin/60)}" min="1" max="16" step="0.5" style="width:46px"> hr · blue = working</div>`;
  ops.forEach(o => {
    const busy = Math.min(dayMin, o.bpu * units), idle = Math.max(0, dayMin - busy), util = busy / dayMin * 100;
    html += `<div class="irow"><span class="inm">${o.name}</span>`
         +  `<span class="ibar"><i style="width:${util.toFixed(1)}%"></i></span>`
         +  `<span class="iv"><b>${Math.round(idle)} min</b> idle (${Math.round(100-util)}%)</span></div>`;
  });
  idlePanel.innerHTML = html;
  const dh = document.getElementById('dayHrs');
  if (dh) dh.onchange = e => { dayMin = Math.max(60, (parseFloat(e.target.value) || 7) * 60); renderIdle(); };
}
document.getElementById('idlebtn').onclick = () => {
  idlePanel.style.display = (idlePanel.style.display === 'none') ? 'block' : 'none';
  renderIdle();
};

// ---- help-paths dashboard ----
const helpPanel = document.getElementById('helpPanel');
const stName = id => (get(id) ? get(id).title : id);
function bottleneckInfo() {
  const items = [['con', effNet('con')], ['arm', effNet('arm')], ['bak', effNet('bak')], ['tre', effNet('tre')], ['sea', effNet('sea')], ['fapak', effNet('fa') + effNet('pak')]];
  let bn = items[0]; items.forEach(it => { if (it[1] > bn[1]) bn = it; });
  return { key: bn[0], time: bn[1], cap: 420 / bn[1] };
}
function isBottleneckTarget(to, bnKey) { return bnKey === 'fapak' ? (to === 'fa' || to === 'pak') : (to === bnKey); }
function renderHelpPanel() {
  if (!helpPanel || helpPanel.style.display === 'none') return;
  const bn = bottleneckInfo();
  const bnName = bn.key === 'fapak' ? 'Full assy + pack' : FEEDNAME[bn.key];
  const head = `<h3>Help paths</h3><div class="ihint"><b>Line now: ${bn.cap.toFixed(1)} chairs/day</b> · bottleneck: ${bnName} (${bn.time.toFixed(1)} min). Output only rises when the bottleneck drops.</div>`;
  if (!helpArrows.length) { helpPanel.innerHTML = head + '<div class="ihint">No paths — click “➤ Help arrow”, then a FROM station and the TO station.</div>'; return; }
  let html = head;
  helpArrows.forEach((a, i) => {
    const spare = availIdleOp(a.from, a.fromIdx || 0) + (a.helpMin || 0);
    const before = eff(a.to), after = effNet(a.to);
    const onBn = isBottleneckTarget(a.to, bn.key);
    const fromPpl = (get(a.from) && get(a.from).ppl) || 1;
    const fromLabel = stName(a.from) + (fromPpl > 1 ? ' ' + ((a.fromIdx || 0) + 1) : '');
    html += `<div class="hrow">
      <div class="hnm">${fromLabel} → <b>${stName(a.to)}</b> ${onBn ? '<span style="color:#2f7d52">✓ bottleneck</span>' : '<span style="color:#c0552c">⚠ not bottleneck</span>'}</div>
      <div class="hctl">takes <input type="number" class="hmin" data-i="${i}" min="0" max="${spare.toFixed(1)}" step="0.5" value="${(a.helpMin||0)}"> min/chair off ${stName(a.to)}
        <button class="hdel" data-i="${i}">✕</button></div>
      <div class="hsub">${stName(a.to)} step: ${before.toFixed(1)} → <b>${after.toFixed(1)} min</b> · helper has ${spare.toFixed(1)} min/chair spare${onBn ? '' : ' · won\'t raise output until the bottleneck is relieved'}</div>
    </div>`;
  });
  helpPanel.innerHTML = html;
  helpPanel.querySelectorAll('.hmin').forEach(inp => inp.onchange = e => {
    const a = helpArrows[+e.target.dataset.i]; const spare = availIdleOp(a.from, a.fromIdx || 0) + (a.helpMin || 0);
    a.helpMin = Math.max(0, Math.min(spare, parseFloat(e.target.value) || 0));
    buildHelp(); schedule(); renderIdle(); saveLayout();
  });
  helpPanel.querySelectorAll('.hdel').forEach(b => b.onclick = e => {
    helpArrows.splice(+e.target.dataset.i, 1); buildHelp(); schedule(); renderIdle(); saveLayout();
  });
}
document.getElementById('helppaths').onclick = () => {
  helpPanel.style.display = (helpPanel.style.display === 'none') ? 'block' : 'none';
  renderHelpPanel();
};

// ---- task-distribution / operator-loading chart ----
const taskPanel = document.getElementById('taskPanel');
function renderTaskChart() {
  if (!taskPanel || taskPanel.style.display === 'none') return;
  const ids = ['con','arm','bak','tre','sea','fa','pak'];
  const cyc = Math.max(effNet('con'), effNet('arm'), effNet('bak'), effNet('tre'), effNet('sea'), effNet('fa') + effNet('pak'));
  // TOTAL LABOR = combined hands-on work of every person added up (raw work
  // content per unit, NOT divided by people). The per-station bars below are
  // still operator loading (work ÷ people); this headline is the full labor.
  const totalLabor = ids.reduce((a, id) => a + (get(id).t || 0), 0);
  const bn = bottleneckInfo();
  const takt = dayMin / Math.max(1, taktDemand);
  const scaleMax = Math.max(cyc, takt) * 1.04;            // fit both the bars and the takt line
  const taktPct = (takt / scaleMax) * 100;
  let html = `<h3>Task distribution — operator loading</h3>`;
  html += `<div class="ihint"><b>Total labor: ${totalLabor.toFixed(1)} min/unit</b> · cycle ${cyc.toFixed(1)} · <span style="color:#d11;font-weight:700">takt ${takt.toFixed(1)} min</span> (<input type="number" id="taktDemand" value="${taktDemand}" min="1" style="width:44px"> units / ${(dayMin/60).toFixed(1)}-hr day). Red line = takt.</div>`;
  ids.forEach(id => {
    const s = get(id), tt = effNet(id);
    const onBn = isBottleneckTarget(id, bn.key);
    const stepsArr = s.steps || [{ name: s.title, t: tt }];
    const baseSum = stepsArr.reduce((a, st) => a + (parseFloat(st.t) || 0), 0) || tt;
    const f = tt / baseSum;                                   // scale steps so the bar totals the NET station time (matches the label + takt line)
    let seg = '';
    stepsArr.forEach((st, i) => {
      const sw = ((parseFloat(st.t) || 0) * f / scaleMax) * 100;
      const col = onBn ? (i % 2 ? '#c0552c' : '#d98a6e') : (i % 2 ? '#2f6df6' : '#7ba6e0');
      seg += `<i style="width:${sw}%;background:${col}" title="${(st.name||'').replace(/"/g,'')} · ${st.t} min"></i>`;
    });
    html += `<div class="trow2"><span class="tn2">${s.title}${onBn?' ◄':''}</span><span class="bar2">${seg}<span class="takt2" style="left:${taktPct}%"></span></span><span class="v2">${tt.toFixed(1)}m</span></div>`;
  });
  taskPanel.innerHTML = html;
  const td = document.getElementById('taktDemand');
  if (td) td.onchange = e => { taktDemand = Math.max(1, parseInt(e.target.value) || 10); renderTaskChart(); };
}
document.getElementById('taskbtn').onclick = () => {
  taskPanel.style.display = (taskPanel.style.display === 'none') ? 'block' : 'none';
  renderTaskChart();
};

/* =========================== EDIT LAYOUT =========================== */
const YARD = 0.9144;                       // 1 unit = 1 metre; 1 yard = 0.9144 m
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
    const rx = c.bdx * cs - c.bdz * sn, rz = c.bdx * sn + c.bdz * cs;   // rotate the operator's offset with the table
    c.homeX = x + rx; c.homeZ = z + rz;
    if (!editing) { c.fig.position.x = c.homeX; c.fig.position.z = c.homeZ; }
  });
}
const STORDER = ['con','arm','bak','tre','sea','fa','pak'];
function rebuildCrew(id) {              // recreate a station's operator figures to match its people count
  for (let i = crew.length - 1; i >= 0; i--) { if (crew[i].station === id) { level2.remove(crew[i].fig); crew.splice(i, 1); } }
  const s = get(id), nd = nodes[id]; if (!nd) return;
  const np = s.role === 'pack' ? 0 : Math.max(0, s.ppl || 0);
  const base = Math.max(0, STORDER.indexOf(id)), spread = s.double ? 4 * FT : 1.1;
  for (let i = 0; i < np; i++) {
    const color = OP_COLORS[(base * 2 + i) % OP_COLORS.length];
    const fig = makeCrewFigure(color, s.title.split(' ')[0] + (np > 1 ? ' ' + (i + 1) : ''));
    const bdx = (np > 1 ? (i - (np - 1) / 2) * 2 * spread : 0), bdz = 1.7;
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
}
function setStationRot(id, rot) {
  const nd = nodes[id]; if (!nd) return;
  nd.rot = rot; placeStation(id);
}
function saveLayout() { try { const o = {}; Object.keys(POS).forEach(id => { if (POS[id]) o[id] = POS[id]; }); o.__wps = cartWaypoints.map(w => [w.x, w.z]); o.__help = helpArrows.map(a => [a.from, a.to, a.helpMin || 0, a.fromIdx || 0]); o.__rot = {}; Object.keys(nodes).forEach(id => { o.__rot[id] = nodes[id].rot || 0; }); o.__steps = Object.fromEntries(ST.map(s => [s.id, s.steps.map(st => [st.name, st.t])])); o.__ppl = Object.fromEntries(ST.map(s => [s.id, s.ppl || 1])); o.__access = accessPts.map(a => [a.x, a.z]); o.__elev = [EL[0], EL[1]]; o.__racks = racks.map(r => [r.x, r.z, r.g.rotation.y || 0]); localStorage.setItem(LAYOUT_KEY, JSON.stringify(o)); } catch (e) {} }
function loadLayout() { try { const o = JSON.parse(localStorage.getItem(LAYOUT_KEY)); if (!o) return; if (Array.isArray(o.__wps)) cartWaypoints = o.__wps.map(a => ({ x: a[0], z: a[1] })); if (Array.isArray(o.__help) && o.__help.length) { helpArrows = o.__help.map(a => ({ from: a[0], to: a[1], helpMin: a[2] || 0, fromIdx: a[3] || 0 })); buildHelp(); } Object.keys(o).forEach(id => { if (id !== '__wps' && id !== '__help' && id !== '__rot' && nodes[id]) setStationPos(id, o[id][0], o[id][1]); }); if (o.__rot) Object.keys(o.__rot).forEach(id => { if (nodes[id]) setStationRot(id, o.__rot[id]); }); if (o.__steps) { ST.forEach(s => { if (o.__steps[s.id]) { s.steps = o.__steps[s.id].map(a => ({ name: a[0], t: +a[1] || 0 })); recalc(s.id); } }); renderTimes(); } if (o.__ppl) { ST.forEach(s => { if (o.__ppl[s.id] != null) { s.ppl = o.__ppl[s.id]; rebuildCrew(s.id); placeStation(s.id); } }); renderTimes(); } if (Array.isArray(o.__access)) { clearAccess(); o.__access.forEach(p => addAccess(p[0], p[1])); } if (Array.isArray(o.__elev)) moveElevator(o.__elev[0], o.__elev[1]); if (Array.isArray(o.__racks)) { clearRacks(); o.__racks.forEach(p => addRack(p[0], p[1], p[2])); } } catch (e) {} }

// 1-yard grid on the deck
function buildGrid() {
  const g = new THREE.Group(); g.visible = false;
  const y = FLOOR2 + 0.04;
  const minor = new THREE.LineBasicMaterial({ color: 0x9aa6b2, transparent: true, opacity: 0.45 });
  const major = new THREE.LineBasicMaterial({ color: 0x33414f, transparent: true, opacity: 0.8 });
  const vp = [], vpM = [], hp = [], hpM = [];
  let i = 0;
  for (let x = DECK.x0; x <= DECK.x1 + 1e-6; x += YARD, i++) { (i % 5 === 0 ? vpM : vp).push(x, y, DECK.z0, x, y, DECK.z1); }
  i = 0;
  for (let z = DECK.z0; z <= DECK.z1 + 1e-6; z += YARD, i++) { (i % 5 === 0 ? hpM : hp).push(DECK.x0, y, z, DECK.x1, y, z); }
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
  for (let x = DECK.x0; x <= DECK.x1 + 1e-6; x += 5 * YARD, yd += 5) mkLbl(yd + 'yd', x, DECK.z1 + 0.9);
  yd = 0;
  for (let z = DECK.z0; z <= DECK.z1 + 1e-6; z += 5 * YARD, yd += 5) mkLbl(yd + 'yd', DECK.x0 - 0.9, z);
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
const stList = () => [...ST.map(s => nodes[s.id]), nodes.cart].filter(n => n && n.st);
const measurePanel = document.getElementById('measure');
const editBtn = document.getElementById('edit');

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
  pathLine.visible = on; wpGroup.visible = on; if (on) refreshPath();
  if (!on) { helpArming = false; armSource = null; const hb = document.getElementById('helparrow'); if (hb) hb.classList.remove('on'); }
  if (on) {
    // keep zoom + pan in edit mode, but disable rotate and free the left button for dragging stations
    controls.enabled = true; controls.enableRotate = false; controls.enableZoom = true; controls.enablePan = true;
    controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: null };
    controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_PAN };
  } else {
    controls.enabled = true; controls.enableRotate = true; controls.enableZoom = true; controls.enablePan = true;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  }
  measurePanel.style.display = on ? 'block' : 'none';
  document.getElementById('editHint').style.display = on ? 'block' : 'none';
  if (on) {
    setPlay(false);
    savedView = { p: camera.position.clone(), t: controls.target.clone() };
    camera.position.set((DECK.x0 + DECK.x1) / 2, FLOOR2 + 46, (DECK.z0 + DECK.z1) / 2 + 0.01);
    controls.target.set((DECK.x0 + DECK.x1) / 2, FLOOR2, (DECK.z0 + DECK.z1) / 2);
    camera.lookAt(controls.target);
  } else {
    dragId = null; measure.visible = false; measurePanel.innerHTML = '';
    if (savedView) { camera.position.copy(savedView.p); controls.target.copy(savedView.t); }
    // settle crew back home
    crew.forEach(c => { c.fig.position.x = c.homeX; c.fig.position.z = c.homeZ; });
    saveLayout();
  }
}
editBtn.onclick = () => setEditing(!editing);
let dragWp = null, helpArming = false, armSource = null, selectedStation = null, dragFix = null;
function pickWaypoint(e) {
  pointerNDC(e); raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(wpGroup.children, false);
  return hits.length ? hits[0].object.userData.wp : null;
}
function fixtureList() {   // draggable non-station objects: access points, racks, then the elevator
  const arr = [];
  accessPts.forEach(a => arr.push({ root: a.g, kind: 'access', ref: a, set: (x, z) => { a.x = x; a.z = z; a.g.position.set(x, 0, z); } }));
  racks.forEach(r => arr.push({ root: r.g, kind: 'rack', ref: r, set: (x, z) => { r.x = x; r.z = z; r.g.position.set(x, 0, z); } }));
  arr.push({ root: elevator.shaft, kind: 'elev', set: (x, z) => moveElevator(x, z) });
  return arr;
}
function pickFixture(e) {
  pointerNDC(e); raycaster.setFromCamera(ndc, camera);
  const list = fixtureList();
  const hits = raycaster.intersectObjects(list.map(f => f.root), true);
  if (!hits.length) return null;
  let o = hits[0].object;
  while (o) { const idx = list.findIndex(f => f.root === o); if (idx >= 0) return idx; o = o.parent; }
  return null;
}
const helpBtn = document.getElementById('helparrow');
helpBtn.onclick = () => {
  if (!editing) setEditing(true);
  helpArming = !helpArming; armSource = null;
  helpBtn.classList.toggle('on', helpArming);
  helpBtn.textContent = helpArming ? '➤ click FROM → TO' : '➤ Help arrow';
};
const snap = v => Math.round(v / (YARD / 2)) * (YARD / 2);   // snap to 0.5 yd
renderer.domElement.addEventListener('pointerdown', e => {
  if (!editing) return;
  if (helpArming) {                                   // drawing a help arrow: pick source, then target
    const sid = pickStation(e); if (!sid) return;
    if (!armSource) { armSource = sid; }
    else { if (sid !== armSource) {
        const ppl = (get(armSource) && get(armSource).ppl) || 1;
        const used = new Set(helpArrows.filter(a => a.from === armSource).map(a => a.fromIdx || 0));
        let fromIdx = ppl - 1; for (let i = 0; i < ppl; i++) { if (!used.has(i)) { fromIdx = i; break; } }   // next free operator at this station
        helpArrows.push({ from: armSource, fromIdx, to: sid, helpMin: Math.min(5, +availIdleOp(armSource, fromIdx).toFixed(1)) });
        buildHelp(); schedule(); saveLayout();
      } armSource = null; }
    return;
  }
  const fi = pickFixture(e);
  if (fi != null) { dragFix = fi; renderer.domElement.setPointerCapture(e.pointerId); return; }
  const wp = pickWaypoint(e);
  if (wp != null) { dragWp = wp; renderer.domElement.setPointerCapture(e.pointerId); return; }
  const id = pickStation(e);
  if (id) { dragId = id; selectedStation = id; renderer.domElement.setPointerCapture(e.pointerId); refreshMeasure(); }
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
  if (dragFix != null) {   // access points / elevator can sit anywhere across both floors + the elevator dock
    const f = fixtureList()[dragFix];
    if (f) f.set(Math.max(DECK.x0 - 3, Math.min(MX1 + 1, snap(p.x))), Math.max(DECK.z0, Math.min(DECK.z1, snap(p.z))));
    return;
  }
  const cx = Math.max(DECK.x0 + 0.6, Math.min(MX1 - 0.6, snap(p.x)));      // span both floors so stations can cross the divider
  const cz = Math.max(DECK.z0 + 0.6, Math.min(DECK.z1 - 0.6, snap(p.z)));
  if (dragWp != null) { cartWaypoints[dragWp] = { x: cx, z: cz }; refreshPath(); return; }
  if (!dragId) return;
  const x = Math.max(DECK.x0 + 1.4, Math.min(MX1 - 1.4, cx));              // connector (or any table) can sit in the middle / on the other floor
  const z = Math.max(DECK.z0 + 1.4, Math.min(DECK.z1 - 1.4, cz));
  setStationPos(dragId, x, z);
  refreshMeasure(); refreshPath();
  schedule();                 // walk times + cycle/capacity update live as you move
});
renderer.domElement.addEventListener('pointerup', () => {
  if (dragFix != null) { dragFix = null; saveLayout(); }
  if (dragWp != null) { dragWp = null; saveLayout(); }
  if (dragId) { dragId = null; measure.visible = false; measurePanel.innerHTML = ''; saveLayout(); }
});
// right-click a waypoint to delete it; right-click a station to delete its help arrows
renderer.domElement.addEventListener('contextmenu', e => {
  if (!editing) return;
  e.preventDefault();                                  // no browser menu while editing
  const fi = pickFixture(e);
  if (fi != null) {   // delete access point or rack on right-click
    const f = fixtureList()[fi];
    if (f.kind === 'access') { level2.remove(f.ref.g); const i=forkLifts.indexOf(f.ref.rec); if(i>=0) forkLifts.splice(i,1); accessPts.splice(accessPts.indexOf(f.ref), 1); saveLayout(); return; }
    if (f.kind === 'rack') { level2.remove(f.ref.g); racks.splice(racks.indexOf(f.ref), 1); saveLayout(); return; }
  }
  const wp = pickWaypoint(e);
  if (wp != null) { cartWaypoints.splice(wp, 1); refreshPath(); saveLayout(); return; }
  const id = pickStation(e);
  if (id && helpArrows.some(a => a.from === id || a.to === id)) {
    helpArrows = helpArrows.filter(a => a.from !== id && a.to !== id); buildHelp(); saveLayout();
  }
});
// add a waypoint at the midpoint of the current path
document.getElementById('addwp').onclick = () => {
  const a = cartWaypoints.length ? cartWaypoints[cartWaypoints.length - 1] : { x: EL[0], z: EL[1] };
  cartWaypoints.push({ x: (a.x + nodes.cart.x) / 2, z: (a.z + nodes.cart.z) / 2 });
  if (!editing) setEditing(true);
  refreshPath(); saveLayout();
};
// add a forklift access point on the front edge
document.getElementById('accesspt').onclick = () => {
  if (!editing) setEditing(true);
  addAccess(deckCx, DECK.z1);
  saveLayout();
};
// add a finished-goods rack along the back
document.getElementById('rackbtn').onclick = () => {
  if (!editing) setEditing(true);
  addRack(deckCx, DECK.z0 + 1);
  saveLayout();
};
loadLayout();
refreshPath();
buildHelp();   // render seeded/loaded help paths
rebuildDivider();   // align the crossing to the connector station

/* ---- named layouts: save / load / compare different floor plans ---- */
const LAYOUTS_KEY = 'm3d_layouts_v2';
const readLayouts = () => { try { return JSON.parse(localStorage.getItem(LAYOUTS_KEY)) || {}; } catch (e) { return {}; } };
const writeLayouts = o => { try { localStorage.setItem(LAYOUTS_KEY, JSON.stringify(o)); } catch (e) {} };
function snapshot() {
  const pos = {}, times = {};
  ST.forEach(s => { const n = nodes[s.id]; pos[s.id] = [n.x, n.z]; times[s.id] = get(s.id).t; });
  if (nodes.cart) pos.cart = [nodes.cart.x, nodes.cart.z];
  const cap = sch ? 420 / Math.max(sch.conT, sch.armT, sch.bakT, sch.treT, sch.seaT, sch.ASM + sch.PACK) : 0;
  return { pos, times, walkOn, walkSpeed, trips: tripsPerUnit, N, wps: cartWaypoints.map(w => [w.x, w.z]), help: helpArrows.map(a => [a.from, a.to, a.helpMin || 0, a.fromIdx || 0]), rot: Object.fromEntries(ST.map(s => [s.id, nodes[s.id] ? (nodes[s.id].rot || 0) : 0])), steps: Object.fromEntries(ST.map(s => [s.id, s.steps.map(st => [st.name, st.t])])), ppl: Object.fromEntries(ST.map(s => [s.id, s.ppl || 1])), access: accessPts.map(a => [a.x, a.z]), elev: [EL[0], EL[1]], racks: racks.map(r => [r.x, r.z, r.g.rotation.y || 0]), cap: +cap.toFixed(1) };
}
function applyLayout(L) {
  if (L.steps) { ST.forEach(s => { if (L.steps[s.id]) { s.steps = L.steps[s.id].map(a => ({ name: a[0], t: +a[1] || 0 })); recalc(s.id); } }); }
  if (L.ppl) { ST.forEach(s => { if (L.ppl[s.id] != null) { s.ppl = L.ppl[s.id]; rebuildCrew(s.id); placeStation(s.id); } }); }
  else if (L.times) ST.forEach(s => { if (L.times[s.id] != null) { get(s.id).t = L.times[s.id]; get(s.id).steps = [{ name: s.sub || 'Step', t: L.times[s.id] }]; } });
  if (L.pos) Object.keys(L.pos).forEach(id => { if (nodes[id]) setStationPos(id, L.pos[id][0], L.pos[id][1]); });
  if (typeof L.walkOn === 'boolean') { walkOn = L.walkOn; const c = document.getElementById('walkOn'); if (c) c.checked = walkOn; }
  if (L.walkSpeed) { walkSpeed = L.walkSpeed; const c = document.getElementById('walkSpeed'); if (c) c.value = walkSpeed; }
  if (L.trips != null) { tripsPerUnit = L.trips; const c = document.getElementById('trips'); if (c) c.value = tripsPerUnit; }
  if (L.N) { N = L.N; nInput.value = N; }
  if (Array.isArray(L.wps)) { cartWaypoints = L.wps.map(a => ({ x: a[0], z: a[1] })); refreshPath(); }
  if (Array.isArray(L.help)) { helpArrows = L.help.map(a => ({ from: a[0], to: a[1], helpMin: a[2] || 0, fromIdx: a[3] || 0 })); buildHelp(); }
  if (L.rot) Object.keys(L.rot).forEach(id => { if (nodes[id]) setStationRot(id, L.rot[id]); });
  if (Array.isArray(L.access)) { clearAccess(); L.access.forEach(p => addAccess(p[0], p[1])); }
  if (Array.isArray(L.elev)) moveElevator(L.elev[0], L.elev[1]);
  if (Array.isArray(L.racks)) { clearRacks(); L.racks.forEach(p => addRack(p[0], p[1], p[2])); }
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
    const tx = fa.x + off[0], tz = fa.z + off[1];
    for (let u = 0; u < N; u++) {
      const part = pool[u]; if (!part) continue;
      const depart = t2 * (u + 1);
      const cons = sch.faStart[u];
      if (depart >= cons || T < depart || T >= cons) { part.visible = false; continue; }
      const arrive = Math.min(depart + TRAVEL, cons);
      part.visible = true;
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
      movingSofa.g.visible = true; movingSofa.g.position.set(sx, 1.04, sz);
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
  // shipped boxes appear
  shipBoxes.forEach((b,i)=> b.visible = i < shipped);
  ui.ship.textContent = shipped;
  // finished sofas populate the racks; the forklift takes one down every 3rd
  if (shipped < lastShipped) { lastShipped = shipped; onRacks = 0; }   // clock reset/seek
  const rcap = racks.length * RACK_SLOTS;
  while (lastShipped < shipped) { lastShipped++; onRacks = Math.min(rcap, onRacks + 1); if (lastShipped % 3 === 0) { onRacks = Math.max(0, onRacks - 1); triggerTakedown(); } }
  fillRacks();

  // FA crew walk to packing during pack phase; help-arrow operators walk to help during their idle slack
  const packing = (cur>=0 && phase==='pack');
  const cyc = Math.max(0.001, sch.conT, sch.armT, sch.bakT, sch.treT, sch.seaT, sch.ASM + sch.PACK);
  crew.forEach(c => {
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
  if (playing) {
    T += dt * parseFloat(speed.value);
    if (T >= horizon) { T = horizon; setPlay(false); }
  }
  updateCarts();   // carts stay parked in a line along the path
  updateHelp();    // help-movement arrows follow the stations
  for (const fl of forkLifts) {                    // forklift carries a package DOWN when triggered, else idle at deck
    if (fl.busy) {
      fl.t += dt; const p = fl.t / 4;               // ~4s round trip
      if (p >= 1) { fl.busy = false; fl.lift.position.y = 0; fl.pkg.visible = false; }
      else { const down = p < 0.5 ? p / 0.5 : 1 - (p - 0.5) / 0.5; fl.lift.position.y = -down * (FLOOR2 - 0.3); fl.pkg.visible = p < 0.55; }
    } else { fl.lift.position.y = 0; }
  }
  update();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
schedule();
update();
requestAnimationFrame(loop);
