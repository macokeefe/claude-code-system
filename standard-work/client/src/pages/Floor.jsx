import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { api, formatTime, formatLong } from '@backend';
import { scheduleSteps } from '../../../shared/schedule.js';
import { sizeLabel } from '../sizeLabel.js';

const COL = { idle: 0x9aa4b2, active: 0x1c7c3c, done: 0x1a56b0, table: 0x6b7280 };

function shortName(s) {
  const n = (s.tag_id ? s.tag_name : s.name) || '';
  return n.length > 22 ? n.slice(0, 21) + '…' : n;
}

// Step label as a canvas-textured sprite.
function makeLabel(seq, name, timeStr) {
  const c = document.createElement('canvas'); c.width = 320; c.height = 150;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(22,32,46,0.92)';
  x.beginPath(); x.roundRect(0, 0, 320, 150, 16); x.fill();
  x.fillStyle = '#ffffff'; x.font = 'bold 30px sans-serif'; x.textAlign = 'center';
  x.fillText(`${seq}. ${name}`.slice(0, 24), 160, 56);
  x.fillStyle = '#9fb3d1'; x.font = '26px monospace';
  x.fillText(timeStr, 160, 104);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(2.8, 1.3, 1);
  return sp;
}

function makeOperator(color) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.55, 4, 10), skin);
  body.position.y = 0.72; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), new THREE.MeshStandardMaterial({ color: 0xf0c9a0 }));
  head.position.y = 1.2; head.castShadow = true;
  g.add(body, head);
  return g;
}

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
    const mount = mountRef.current;
    const w = mount.clientWidth, h = mount.clientHeight || 520;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f1622);
    scene.fog = new THREE.Fog(0x0f1622, 30, 70);

    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 200);
    camera.position.set(14, 14, 18);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.target.set(0, 0.5, 0); controls.maxPolarAngle = Math.PI / 2.1;

    scene.add(new THREE.HemisphereLight(0xbcd3ff, 0x202830, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(12, 20, 8); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -25; sun.shadow.camera.right = 25;
    sun.shadow.camera.top = 25; sun.shadow.camera.bottom = -25;
    scene.add(sun);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ color: 0x202a3a }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(80, 40, 0x33415a, 0x2a3447);
    grid.position.y = 0.01; scene.add(grid);

    three.current = { scene, camera, renderer, controls, sun, stationGroup: null };

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
    if (ctx.stationGroup) { ctx.scene.remove(ctx.stationGroup); }
    const group = new THREE.Group();
    ctx.scene.add(group);

    const durOf = s => (size && s.size_times && s.size_times[size] != null) ? s.size_times[size] : (s.effective_seconds || 0);
    const { schedule, total: tot } = scheduleSteps(detail.steps, durOf);
    setTotal(tot); three.current.total = tot;
    tRef.current = 0; if (sliderRef.current) { sliderRef.current.max = tot; sliderRef.current.value = 0; }

    const steps = detail.steps;
    const cols = Math.ceil(Math.sqrt(steps.length));
    const spacing = 5;
    const offset = ((cols - 1) * spacing) / 2;
    const stations = [];
    steps.forEach((s, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const px = col * spacing - offset;
      const pz = row * spacing - offset;
      const st = new THREE.Group(); st.position.set(px, 0, pz);

      const tableMat = new THREE.MeshStandardMaterial({ color: COL.idle });
      const legMat = new THREE.MeshStandardMaterial({ color: 0x3a4456 });
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 1.7), tableMat);
      top.position.y = 0.95; top.castShadow = true; top.receiveShadow = true;
      st.add(top);
      for (const [lx, lz] of [[-1.1, -0.6], [1.1, -0.6], [-1.1, 0.6], [1.1, 0.6]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.95, 0.16), legMat);
        leg.position.set(lx, 0.47, lz); leg.castShadow = true; st.add(leg);
      }
      // assembly block on the table (grows as the step is worked)
      const partMat = new THREE.MeshStandardMaterial({ color: 0xc98a3a });
      const part = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 1.0), partMat);
      part.position.y = 1.34; part.scale.set(0.01, 0.01, 0.01); part.castShadow = true;
      st.add(part);

      const label = makeLabel(s.sequence, shortName(s), formatTime(durOf(s)));
      label.position.set(0, 2.5, 0); st.add(label);

      const op = makeOperator(0x2d6cdf); op.position.set(0, 0, 1.45);
      st.add(op);

      group.add(st);
      stations.push({ stepId: s.id, name: shortName(s), table: top.material, part, op, sched: schedule.get(s.id) });
    });

    // recenter camera target
    ctx.controls.target.set(0, 0.6, 0);
    ctx.stationGroup = group;
    ctx.stations = stations;
  }, [detail, size]);

  function updateStations() {
    const ctx = three.current;
    if (!ctx.stations) return;
    const t = tRef.current;
    let activeNames = [];
    for (const s of ctx.stations) {
      const { start, finish, duration } = s.sched || { start: 0, finish: 0, duration: 0 };
      let col, prog;
      if (t < start) { col = COL.idle; prog = 0; }
      else if (t >= finish) { col = COL.done; prog = 1; }
      else {
        col = COL.active; prog = duration > 0 ? (t - start) / duration : 1;
        activeNames.push(s.name);
        s.op.position.y = Math.sin(t * 4 + s.stepId) * 0.06; // little bob while working
      }
      if (t < start || t >= finish) s.op.position.y = 0;
      s.table.color.setHex(col);
      s.table.emissive && s.table.emissive.setHex(col === COL.active ? 0x0c3a1c : 0x000000);
      const sc = Math.max(0.01, prog);
      s.part.scale.set(sc, sc, sc);
    }
    if (clockRef.current) clockRef.current.textContent = `${formatTime(t)} / ${formatTime(ctx.total || 0)}`;
    if (sliderRef.current && playingRef.current) sliderRef.current.value = t;
    if (activeRef.current) activeRef.current.textContent = activeNames.length ? activeNames.join(' · ') : (t >= (ctx.total || 0) ? 'build complete' : 'not started');
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
          <select value={activeSize || ''} onChange={e => setSize(e.target.value)} style={{ width: 150 }}>
            {sizes.map(sz => <option key={sz} value={sz}>{sizeLabel(sz)}</option>)}
          </select>
        )}
      </div>
      <p className="subtitle">Each station is a step. Press play to run the build over time — stations light up green while worked, blue when done; parallel branches run together. Drag to orbit, scroll to zoom.</p>

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
          <span style={{ color: '#1c7c3c' }}>● working</span> &nbsp; <span style={{ color: '#1a56b0' }}>● done</span> &nbsp; <span style={{ color: '#9aa4b2' }}>● waiting</span>
          &nbsp;— total build time with unlimited operators: <strong>{formatLong(total)}</strong>
        </div>
      </div>
    </>
  );
}
