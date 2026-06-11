import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { api, formatTime, formatLong } from '@backend';
import { scheduleSteps } from '../../../shared/schedule.js';
import { sizeLabel } from '../sizeLabel.js';

// Status colors for the floor ring under each bench
const RING = { idle: 0x8e98a6, active: 0x1fa84f, done: 0x1a56b0 };

function shortName(s) {
  const n = (s.tag_id ? s.tag_name : s.name) || '';
  return n.length > 22 ? n.slice(0, 21) + '…' : n;
}

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
}

function makeLabel(seq, name, timeStr) {
  const c = document.createElement('canvas'); c.width = 330; c.height = 140;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(255,255,255,0.95)';
  x.beginPath(); x.roundRect(0, 0, 330, 140, 14); x.fill();
  x.fillStyle = '#1a56b0'; x.fillRect(0, 0, 10, 140);
  x.fillStyle = '#16202e'; x.font = 'bold 28px sans-serif'; x.textAlign = 'center';
  x.fillText(`${seq}. ${name}`.slice(0, 24), 170, 54);
  x.fillStyle = '#5c6470'; x.font = '26px monospace';
  x.fillText(timeStr, 170, 102);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(2.6, 1.1, 1);
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

/* The product being assembled: cherry frame + chrome bar + slats, like the
   Sola frames on the benches in the photos. Reveals progressively. */
function makeProduct() {
  const g = new THREE.Group();
  const rails = new THREE.Group();
  const L = 1.7, W = 1.05, railR = 0.055;
  const mkRail = (len, x, z, rotY) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.11, 0.11), MAT.cherry);
    m.position.set(x, 0, z); m.rotation.y = rotY; m.castShadow = true;
    return m;
  };
  rails.add(mkRail(L, 0, -W / 2, 0), mkRail(L, 0, W / 2, 0), mkRail(W, -L / 2, 0, Math.PI / 2), mkRail(W, L / 2, 0, Math.PI / 2));
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, L - 0.15, 10), MAT.chrome);
  bar.rotation.z = Math.PI / 2; bar.castShadow = true;
  const slats = new THREE.Group();
  const slatCount = 6;
  for (let i = 0; i < slatCount; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, W - 0.12), MAT.cherry);
    s.position.x = -L / 2 + 0.25 + i * ((L - 0.5) / (slatCount - 1));
    s.castShadow = true; s.visible = false;
    slats.add(s);
  }
  g.add(rails, bar, slats);
  g.userData = { rails, bar, slats, slatCount };
  return g;
}

function setProductProgress(p, prog) {
  const { rails, bar, slats, slatCount } = p.userData;
  const railP = Math.min(1, prog / 0.3);
  rails.scale.set(Math.max(0.001, railP), Math.max(0.001, railP), Math.max(0.001, railP));
  rails.visible = prog > 0.001;
  bar.visible = prog >= 0.35;
  const shown = prog >= 1 ? slatCount : Math.floor(Math.max(0, prog - 0.45) / 0.55 * (slatCount + 0.99));
  slats.children.forEach((s, i) => { s.visible = i < shown; });
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

export default function Floor() {
  const mountRef = useRef();
  const three = useRef({});
  const tRef = useRef(0);
  const playingRef = useRef(false);
  const speedRef = useRef(120);
  const clockRef = useRef();
  const sliderRef = useRef();
  const activeRef = useRef();

  const [skus, setSkus] = useState([]);
  const [skuId, setSkuId] = useState(null);
  const [size, setSize] = useState(null);
  const [detail, setDetail] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(120);
  const [total, setTotal] = useState(0);

  useEffect(() => { api.get('/api/skus').then(list => { setSkus(list); if (list.length) setSkuId(p => p ?? list[0].id); }); }, []);
  useEffect(() => { if (skuId == null) return; setSize(null); api.get(`/api/skus/${skuId}`).then(setDetail); }, [skuId]);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  // ---- Scene setup (once) ----
  useEffect(() => {
    initMats();
    const mount = mountRef.current;
    const w = mount.clientWidth, h = mount.clientHeight || 520;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xd9dee3);
    scene.fog = new THREE.Fog(0xd9dee3, 38, 95);

    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 220);
    camera.position.set(11, 8.5, 15);

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

    // worn concrete floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    scene.add(floor);

    // yellow aisle tape down the center walkway
    for (const z of [-1.7, 1.7]) {
      const tape = new THREE.Mesh(new THREE.BoxGeometry(34, 0.012, 0.12), MAT.tape);
      tape.position.set(0, 0.006, z);
      scene.add(tape);
    }

    // white columns
    for (const [cx, cz] of [[-12, -8], [12, -8], [-12, 8], [12, 8]]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.7, 7.5, 0.7), MAT.column);
      col.position.set(cx, 3.75, cz); col.castShadow = true;
      scene.add(col);
    }

    // perimeter pallet racking
    for (const [rx, rz, ry] of [[-18, -4, Math.PI / 2], [-18, 4, Math.PI / 2], [18, -4, -Math.PI / 2], [18, 4, -Math.PI / 2], [-7, -14, 0], [0, -14, 0], [7, -14, 0]]) {
      const rack = makeRack(); rack.position.set(rx, 0, rz); rack.rotation.y = ry;
      scene.add(rack);
    }

    // hanging light strips
    for (let lx = -12; lx <= 12; lx += 6) {
      for (const lz of [-6, 0, 6]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 0.18),
          new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf5f2e8, emissiveIntensity: 1.4 }));
        strip.position.set(lx, 6.4, lz);
        scene.add(strip);
      }
    }

    // HVLS ceiling fans
    const fans = [];
    for (const fx of [-8, 8]) {
      const fan = makeFan(); fan.position.set(fx, 7, 0); scene.add(fan); fans.push(fan);
    }

    three.current = { scene, camera, renderer, controls, stationGroup: null, fans };

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

    const durOf = s => (size && s.size_times && s.size_times[size] != null) ? s.size_times[size] : (s.effective_seconds || 0);
    const { schedule, total: tot } = scheduleSteps(detail.steps, durOf);
    setTotal(tot); three.current.total = tot;
    tRef.current = 0; if (sliderRef.current) { sliderRef.current.max = tot; sliderRef.current.value = 0; }

    // Two rows of benches facing a central aisle, like the real cell.
    const steps = detail.steps;
    const pairs = Math.ceil(steps.length / 2);
    const spacing = 4.4;
    const offset = ((pairs - 1) * spacing) / 2;
    const stations = [];
    steps.forEach((s, i) => {
      const col = Math.floor(i / 2), row = i % 2;
      const px = col * spacing - offset;
      const pz = row === 0 ? -3.1 : 3.1;
      const { st, ring } = makeBench(i);
      st.position.set(px, 0, pz);
      if (row === 1) st.rotation.y = Math.PI; // face the aisle

      const product = makeProduct();
      product.position.y = 1.1;
      setProductProgress(product, 0);
      st.add(product);

      const label = makeLabel(s.sequence, shortName(s), formatTime(durOf(s)));
      label.position.set(0, 2.7, 0); st.add(label);

      const op = makeOperator(); op.position.set(0, 0, 1.55);
      st.add(op);

      // hose over every other bench
      if (i % 2 === 0) { const hose = makeHose(); hose.position.set(0.8, 0, -0.4); st.add(hose); }

      group.add(st);
      stations.push({ stepId: s.id, name: shortName(s), ring: ring.material, product, op, sched: schedule.get(s.id) });
    });

    ctx.controls.target.set(0, 0.8, 0);
    ctx.stationGroup = group;
    ctx.stations = stations;
  }, [detail, size]);

  function updateStations() {
    const ctx = three.current;
    if (!ctx.stations) return;
    const t = tRef.current;
    const activeNames = [];
    for (const s of ctx.stations) {
      const { start, finish, duration } = s.sched || { start: 0, finish: 0, duration: 0 };
      let state, prog;
      if (t < start) { state = 'idle'; prog = 0; }
      else if (t >= finish) { state = 'done'; prog = 1; }
      else {
        state = 'active'; prog = duration > 0 ? (t - start) / duration : 1;
        activeNames.push(s.name);
        s.op.position.y = Math.abs(Math.sin(t * 3 + s.stepId)) * 0.05;
      }
      if (state !== 'active') s.op.position.y = 0;
      s.ring.color.setHex(RING[state]);
      s.ring.emissive.setHex(state === 'active' ? 0x0c4a22 : 0x000000);
      setProductProgress(s.product, prog);
    }
    if (clockRef.current) clockRef.current.textContent = `${formatTime(t)} / ${formatTime(ctx.total || 0)}`;
    if (sliderRef.current && playingRef.current) sliderRef.current.value = t;
    if (activeRef.current) activeRef.current.textContent = activeNames.length ? activeNames.join(' · ') : (t >= (ctx.total || 0) && ctx.total ? 'build complete' : 'not started');
  }

  const sizes = detail ? [...new Set(detail.steps.flatMap(s => s.size_times ? Object.keys(s.size_times) : []))] : [];
  const activeSize = size ?? (sizes.length ? sizes[Math.floor((sizes.length - 1) / 2)] : null);

  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0 }}>3D Floor</h1>
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
      <p className="subtitle">Modeled on your floor: benches face the center aisle; the ring under each bench is grey while waiting, green while worked, blue when done, and the frame on the bench builds up as the step progresses. Drag to orbit, scroll to zoom.</p>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div ref={mountRef} style={{ width: '100%', height: 520, position: 'relative' }} />
      </div>

      <div className="card">
        <div className="toolbar" style={{ marginBottom: 8 }}>
          <button className="primary" onClick={() => {
            if (tRef.current >= (three.current.total || 0)) { tRef.current = 0; }
            setPlaying(p => !p);
          }}>{playing ? '⏸ Pause' : '▶ Play'}</button>
          <button className="small" onClick={() => { tRef.current = 0; if (sliderRef.current) sliderRef.current.value = 0; setPlaying(false); }}>⟲ Reset</button>
          <span ref={clockRef} className="time" style={{ fontSize: 16, minWidth: 150 }}>0:00 / {formatTime(total)}</span>
          <div className="spacer" />
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', textTransform: 'none', fontWeight: 400 }}>
            Speed
            <select value={speed} onChange={e => setSpeed(Number(e.target.value))}>
              <option value={30}>30×</option><option value={120}>120×</option>
              <option value={300}>300×</option><option value={900}>900×</option>
            </select>
          </label>
        </div>
        <input ref={sliderRef} type="range" min="0" max={total || 1} defaultValue="0" style={{ width: '100%' }}
          onInput={e => { tRef.current = Number(e.target.value); setPlaying(false); }} />
        <div className="muted" style={{ marginTop: 6 }}>Working now: <strong ref={activeRef}>not started</strong></div>
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          <span style={{ color: '#1fa84f' }}>● working</span> &nbsp; <span style={{ color: '#1a56b0' }}>● done</span> &nbsp; <span style={{ color: '#8e98a6' }}>● waiting</span>
          &nbsp;— total build time with unlimited operators: <strong>{formatLong(total)}</strong>
        </div>
      </div>
    </>
  );
}
