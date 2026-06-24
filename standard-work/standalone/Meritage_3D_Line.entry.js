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
  sp.scale.set(4.4, 1.22, 1); sp.renderOrder = 999;
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

function makeBench(wide = false) {
  const W = wide ? 3.4 : 2.7;
  const st = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(W, 0.14, 1.7), MAT.benchTop);
  top.position.y = 0.96; top.castShadow = true; top.receiveShadow = true; st.add(top);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.05, 1.72), MAT.trimBlue);
  trim.position.y = 0.875; st.add(trim);
  for (const [lx, lz] of [[-W/2+0.15, -0.7], [W/2-0.15, -0.7], [-W/2+0.15, 0.7], [W/2-0.15, 0.7]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.95, 0.14), MAT.pine);
    leg.position.set(lx, 0.47, lz); leg.castShadow = true; st.add(leg);
  }
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.07, 1.4), MAT.pine);
  shelf.position.y = 0.42; shelf.castShadow = true; st.add(shelf);
  for (let b = 0; b < 6; b++) {
    const bin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.34), b % 3 === 2 ? MAT.binBlue : MAT.binYellow);
    bin.position.set(-W/2 + 0.35 + b * 0.42, 0.57, 0.35); bin.castShadow = true; st.add(bin);
  }
  const mat = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.025, 1.15), MAT.mat);
  mat.position.set(0, 0.013, 1.55); mat.receiveShadow = true; st.add(mat);
  for (const dz of [-0.62, 0.62]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.027, 0.09), MAT.matEdge);
    edge.position.set(0, 0.014, 1.55 + dz); st.add(edge);
  }
  const led = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.055, 0.05),
    new THREE.MeshStandardMaterial({ color: RING.idle, emissive: 0x000000, emissiveIntensity: 1.6, roughness: 0.4 }));
  led.position.set(0, 1.045, 0.875); st.add(led);
  const hose = makeHose(); hose.position.set(W/2 - 0.5, 0, -0.45); st.add(hose);
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
  { id:'con', title:'CONNECTORS',   sub:'Connectors',   ppl:1, t:19.25, role:'feeder', kind:'connectors', accent:'#1d3a66' },
  { id:'arm', title:'ARMS',         sub:'Arm assembly', ppl:2, t:32,    role:'feeder', kind:'arm',        accent:'#1d3a66' },
  { id:'bak', title:'BACK FRAME',   sub:'Back frame',   ppl:1, t:43.5,  role:'feeder', kind:'back',       accent:'#1d3a66' },
  { id:'tre', title:'TRELLIS',      sub:'Trellis',      ppl:1, t:22.5,  role:'feeder', kind:'trellis',    accent:'#1d3a66' },
  { id:'sea', title:'SEAT FRAME',   sub:'Seat frame',   ppl:1, t:47,    role:'feeder', kind:'seat',       accent:'#9a3b1f', bot:true },
  { id:'fa',  title:'FULL ASSEMBLY',sub:'Assemble sofa',ppl:2, t:29,    role:'fa',     accent:'#1d3a66' },
  { id:'pak', title:'PACKING',      sub:'Box & ship',   ppl:0, t:18,    role:'pack',   accent:'#236043' },
];
const get = id => ST.find(s => s.id === id);

let N = 8;
let sch = null, horizon = 0;
function schedule() {
  const seaT=get('sea').t, armT=get('arm').t, bakT=get('bak').t, treT=get('tre').t, conT=get('con').t;
  const ASM=get('fa').t, PACK=get('pak').t;
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
}

/* =========================== SCENE =========================== */
initMats();
const mount = document.getElementById('view');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9edf1);
scene.fog = new THREE.Fog(0xe9edf1, 60, 140);
const camera = new THREE.PerspectiveCamera(44, mount.clientWidth / mount.clientHeight, 0.1, 300);
camera.position.set(2, 17, 34);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(mount.clientWidth, mount.clientHeight);
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.06;
mount.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.target.set(0, 0.8, 0); controls.maxPolarAngle = Math.PI / 2.05; controls.maxDistance = 70;

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
const fans = [];
for (const fx of [-10, 10]) { const f = makeFan(); f.position.set(fx, 7.4, 0); scene.add(f); fans.push(f); }
const cart = makePartsCart(); cart.position.set(-13.5, 0, 6.0); cart.rotation.y = 0.2; scene.add(cart);

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
  const wide = (s.role === 'fa');
  const { st, led } = makeBench(wide);
  st.position.set(x, 0, z);
  if (s.role === 'fa') st.rotation.y = 0; // faces aisle
  scene.add(st);
  const label = makeStationLabel(s.title, s.sub, s.t ? s.t + ' min' : '—', s.accent);
  label.position.set(x, 3.4, z); scene.add(label);

  let visual = null;
  if (s.role === 'feeder') { visual = makeFeederWIP(s.kind); visual.g.position.set(x, 1.04, z); scene.add(visual.g); }
  if (s.role === 'fa') { visual = makeSofaProduct(); visual.g.position.set(x, 1.04, z); visual.update(0); scene.add(visual.g); }

  nodes[s.id] = { s, st, led, visual, label, x, z };

  // crew figures
  const np = s.role === 'pack' ? 0 : s.ppl;
  for (let i = 0; i < np; i++) {
    const color = OP_COLORS[opColorIdx % OP_COLORS.length]; opColorIdx++;
    const fig = makeCrewFigure(color, s.title.split(' ')[0] + (np>1?(' '+(i+1)):''));
    const ox = x + (np > 1 ? (i - (np-1)/2) * 1.1 : 0);
    const oz = z + 1.7;
    fig.position.set(ox, 0, oz);
    scene.add(fig);
    crew.push({ fig, station: s.id, homeX: ox, homeZ: oz, idx: i });
  }
});
// shipped boxes pool near packing/ship dock
const shipBoxes = [];
for (let i = 0; i < 40; i++) { const b = makeShipBox(); b.visible = false; b.position.set(16 + (i%4)*2.0, 0, 4.2 + Math.floor(i/4)*1.2); scene.add(b); shipBoxes.push(b); }
// a sofa that travels from FA to packing during pack phase
const movingSofa = makeSofaProduct(); movingSofa.update(1); movingSofa.g.visible = false; scene.add(movingSofa.g);

/* ---- traveling feeder parts: each feeder ships its finished sub-part to the
   full-assembly bench, where it stages until full assembly starts that unit.
   Per-feeder staging slot around the FA bench so all 5 converge visibly. ---- */
const MAX_UNITS = 40;
const TRAVEL = 4.5;            // sim-minutes a part spends in transit to FA
const FEEDERS = ['con','arm','bak','tre','sea'];
const SLOT = { // offset from FA bench centre where each feeder's part waits
  con:[-1.5,-0.55], arm:[-1.5,0.45], bak:[1.5,-0.55], tre:[1.5,0.45], sea:[0,1.0],
};
const travelParts = {};        // id -> array(MAX_UNITS) of part groups
FEEDERS.forEach(id => {
  const kind = get(id).kind;
  const arr = [];
  for (let u = 0; u < MAX_UNITS; u++) {
    const p = buildSub(kind); p.scale.set(0.5, 0.5, 0.5); p.visible = false;
    scene.add(p); arr.push(p);
  }
  travelParts[id] = arr;
});

controls.target.set(0, 0.8, 0.5);

/* =========================== UI =========================== */
const ui = {
  clock: document.getElementById('clock'),
  ship: document.getElementById('ship'),
  nOut: document.getElementById('nOut'),
  cyc: document.getElementById('cyc'),
  cap: document.getElementById('cap'),
  bot: document.getElementById('bot'),
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
document.getElementById('cam').onclick = () => { camera.position.set(2,17,34); controls.target.set(0,0.8,0.5); };
document.getElementById('top').onclick = () => { camera.position.set(0,40,0.1); controls.target.set(0,0,0); };

// build editable time rows
const timeBox = document.getElementById('times');
ST.forEach(s => {
  if (s.role === 'pack') { /* still editable */ }
  const row = document.createElement('div'); row.className = 'trow';
  const lbl = s.role==='fa' ? 'ASM' : (s.role==='pack'?'PACK':'min');
  row.innerHTML = `<span class="tn">${s.title}${s.bot?' <b style="color:#c0552c">◄</b>':''}</span>
    <span class="tp">${s.role==='pack'?'0 ppl':(s.ppl+(s.ppl>1?' ppl':' p'))}</span>
    <input type="number" step="0.25" min="0" value="${s.t}" data-id="${s.id}"/> <span class="tu">${lbl}</span>`;
  timeBox.appendChild(row);
});
timeBox.querySelectorAll('input').forEach(inp => inp.onchange = e => {
  const s = get(e.target.dataset.id); s.t = parseFloat(e.target.value) || 0;
  if (nodes[s.id]?.label?.userData?.redraw) nodes[s.id].label.userData.redraw(s.t + ' min', s.accent);
  schedule(); T = 0; setPlay(false);
});

/* =========================== UPDATE =========================== */
function setLed(mat, state, active){ mat.color.setHex(RING[state]); mat.emissive.setHex(state==='idle'?0x000000:RING[state]); mat.emissiveIntensity = active?1.1:0.5; }

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
      fa.visual.g.visible = true; fa.visual.update(fr);
      movingSofa.g.visible = false;
      setLed(fa.led, 'active', true);
    } else {
      fa.visual.g.visible = false;
      // sofa slides from FA toward packing
      const fr = (T - (sch.faStart[cur] + sch.ASM)) / sch.PACK;
      const sx = fa.x + (POS.pak[0] - fa.x) * fr;
      const sz = fa.z + (POS.pak[1] - fa.z) * fr;
      movingSofa.g.visible = true; movingSofa.g.position.set(sx, 1.04, sz);
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

  // FA crew walk to packing during pack phase
  const packing = (cur>=0 && phase==='pack');
  crew.forEach(c => {
    let tx = c.homeX, tz = c.homeZ;
    if (c.station === 'fa' && packing) { tx = POS.pak[0] + (c.idx - 0.5) * 1.1; tz = POS.pak[1] + 1.7; }
    c.fig.position.x += (tx - c.fig.position.x) * 0.08;
    c.fig.position.z += (tz - c.fig.position.z) * 0.08;
  });
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
  for (const f of fans) f.userData.blades.rotation.y += dt * 0.8;
  update();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
schedule();
update();
requestAnimationFrame(loop);
