import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { api, formatTime } from '@backend';
import { sizeLabel } from '../sizeLabel.js';
import { getActiveSku, setActiveSku } from '../activeSku.js';

// Floor plan in metres. Stations are bench-sized; carts are small.
const FW = 30, FH = 17, SW = 2.7, SH = 1.7, CW = 1.1, CH = 0.7;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const load = (id, key) => { try { return JSON.parse(localStorage.getItem(`sw-layout-${id}`))?.[key]; } catch { return null; } };
const saveLayout = (id, obj) => { try { localStorage.setItem(`sw-layout-${id}`, JSON.stringify(obj)); } catch {} };

function computeGroups(steps, skuId, durOf) {
  const N = 8;
  let groups = null;
  try {
    const saved = JSON.parse(localStorage.getItem(`sw-line-${skuId}`));
    if (saved?.assign && Object.keys(saved.assign).length) {
      const n = Math.min(N, Math.max(1, saved.stationCount || N));
      const arr = Array.from({ length: n }, () => []);
      for (const s of steps) arr[Math.min(n - 1, saved.assign[s.id] ?? 0)].push(s);
      groups = arr.filter(g => g.length);
    }
  } catch { /* ignore */ }
  if (!groups || !groups.length) {
    const total = steps.reduce((a, s) => a + durOf(s), 0);
    const target = total / Math.min(N, steps.length || 1);
    groups = [[]]; let acc = 0;
    for (const s of steps) {
      const t = durOf(s);
      if (acc > 0 && acc + t > target * 1.2 && groups.length < N) { groups.push([]); acc = 0; }
      groups[groups.length - 1].push(s); acc += t;
    }
  }
  groups.forEach(g => g.sort((a, b) => a.sequence - b.sequence));
  return groups;
}

// preset arrangements for n stations (returns array of {x,y} centres)
function preset(name, n) {
  const out = [];
  const cx = FW / 2;
  if (name === 'row') {
    const gap = Math.min(3.4, (FW - 6) / n);
    const x0 = cx - (gap * (n - 1)) / 2;
    for (let i = 0; i < n; i++) out.push({ x: x0 + i * gap, y: 5 });
  } else if (name === 'serpentine') {
    const half = Math.ceil(n / 2);
    const gap = Math.min(3.4, (FW - 6) / half);
    const x0 = cx - (gap * (half - 1)) / 2;
    for (let i = 0; i < n; i++) {
      const top = i < half;
      const col = top ? i : (n - 1 - i);
      out.push({ x: x0 + col * gap, y: top ? 4.5 : 9.5 });
    }
  } else if (name === 'feeders') {
    // sketch style: a row of "feeder" stations up top, converging into the
    // back half (sub-assembly -> final assembly), with the last as final.
    const feed = Math.max(1, n - 2);
    const gap = Math.min(3.6, (FW - 8) / feed);
    const x0 = cx - (gap * (feed - 1)) / 2;
    for (let i = 0; i < n; i++) {
      if (i < feed) out.push({ x: x0 + i * gap, y: 4 });
      else if (i === feed) out.push({ x: cx - 1.5, y: 9 });      // final assembly
      else out.push({ x: cx - 1.5, y: 12.5 });                  // last
    }
  } else if (name === 'u') {
    const perLeg = Math.ceil(n / 3);
    const gap = 3.0;
    for (let i = 0; i < n; i++) {
      if (i < perLeg) out.push({ x: 5, y: 3.5 + i * gap });
      else if (i < 2 * perLeg) out.push({ x: 5 + (i - perLeg + 1) * 3.4, y: 3.5 + (perLeg - 1) * gap });
      else out.push({ x: 5 + (perLeg) * 3.4, y: 3.5 + (n - 1 - i) * gap });
    }
  } else { // cell
    const half = Math.ceil(n / 2);
    const gap = 3.2; const x0 = cx - (gap * (half - 1)) / 2;
    for (let i = 0; i < n; i++) {
      const top = i < half; const col = top ? i : (n - 1 - i);
      out.push({ x: x0 + col * gap, y: top ? 6 : 8.2 });
    }
  }
  return out;
}

// connection helpers (node keys: 's0'..'s{n-1}', 'fg')
function defaultConn(n, stations, carts) {
  const c = {};
  for (let i = 0; i < n; i++) c['s' + i] = [i < n - 1 ? 's' + (i + 1) : 'fg'];
  if (stations && carts && carts.length) {
    stations.forEach((s, i) => {
      let bj = 0, bd = Infinity;
      carts.forEach((ca, j) => { const d = Math.hypot(s.x - ca.x, s.y - ca.y); if (d < bd) { bd = d; bj = j; } });
      const k = 'c' + bj; (c[k] = c[k] || []).push('s' + i);
    });
  }
  return c;
}
function connToLabels(arr) {
  return (arr || []).map(k => k === 'fg' ? 'FG' : 'S' + (parseInt(k.slice(1), 10) + 1)).join(', ');
}
function labelsToConn(txt, n) {
  const out = [];
  (txt || '').split(/[,\s]+/).forEach(tok => {
    tok = tok.trim().toUpperCase(); if (!tok) return;
    if (tok === 'FG' || tok === 'OUT') { out.push('fg'); return; }
    const m = tok.match(/S?(\d+)/);
    if (m) { const i = parseInt(m[1], 10) - 1; if (i >= 0 && i < n) out.push('s' + i); }
  });
  return out;
}

export default function Layout() {
  const svgRef = useRef();
  const [skus, setSkus] = useState([]);
  const [skuId, setSkuId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [size, setSize] = useState(null);
  const [stations, setStations] = useState([]); // [{x,y}]
  const [carts, setCarts] = useState([]);        // [{x,y}]
  const [fg, setFg] = useState({ x: FW - 3, y: 5 }); // finished goods node
  const [conn, setConn] = useState({});          // {sKey:[targetKeys]}
  const [drag, setDrag] = useState(null);
  const [mode, setMode] = useState('move');      // 'move' | 'draw'
  const [pendingSrc, setPendingSrc] = useState(null);
  const [drawCursor, setDrawCursor] = useState({ x: 0, y: 0 });
  const [hoverArrow, setHoverArrow] = useState(null);
  const [names, setNames] = useState({});        // {i: custom station name}
  const [ppl, setPpl] = useState({});            // {i: custom people count}
  const [fgName, setFgName] = useState('');
  const [fgPpl, setFgPpl] = useState(null);

  useEffect(() => { api.get('/api/skus').then(list => { setSkus(list); if (list.length) { const a = getActiveSku(); setSkuId(p => p ?? (list.some(s => s.id === a) ? a : list[0].id)); } }); }, []);
  useEffect(() => { if (skuId == null) return; setActiveSku(skuId); setSize(null); api.get(`/api/skus/${skuId}`).then(setDetail); }, [skuId]);

  const sizes = detail ? [...new Set(detail.steps.flatMap(s => s.size_times ? Object.keys(s.size_times) : []))] : [];
  const activeSize = size ?? (sizes.length ? sizes[Math.floor((sizes.length - 1) / 2)] : null);
  const durOf = s => (activeSize && s.size_times && s.size_times[activeSize] != null) ? s.size_times[activeSize] : (s.effective_seconds || 0);

  const groups = useMemo(() => detail ? computeGroups(detail.steps, skuId, durOf) : [], [detail, activeSize]); // eslint-disable-line
  const nBase = groups.length;
  const n = stations.length || nBase;

  // people per station from the Line Designer worker counts (max staffing on its steps)
  const lineWorkers = useMemo(() => { try { return JSON.parse(localStorage.getItem(`sw-line-${skuId}`))?.workers || {}; } catch { return {}; } }, [skuId, detail]);
  const stepName = s => (s.tag_id ? s.tag_name : s.name) || `Step ${s.sequence}`;
  const peopleOf = i => Math.max(1, ...(groups[i] || []).map(s => lineWorkers[s.id] || 1));
  const roleOf = i => { const g = groups[i] || []; if (!g.length) return ''; const top = g.reduce((a, b) => durOf(b) > durOf(a) ? b : a, g[0]); return stepName(top); };
  const displayName = i => names[i] || roleOf(i) || `Station ${i + 1}`;
  const displayPeople = i => (ppl[i] != null ? ppl[i] : peopleOf(i));

  // load saved positions/connections, else defaults
  useEffect(() => {
    if (!nBase) return;
    const savedS = load(skuId, 'stations');
    const savedC = load(skuId, 'carts');
    const savedFg = load(skuId, 'fg');
    const savedConn = load(skuId, 'conn');
    const st = savedS && savedS.length ? savedS : preset('feeders', nBase);
    const ct = savedC && savedC.length ? savedC : [{ x: FW / 2, y: 1.6 }];
    setStations(st); setCarts(ct);
    setFg(savedFg || { x: FW - 3, y: 5 });
    setNames(load(skuId, 'names') || {});
    setPpl(load(skuId, 'ppl') || {});
    setFgName(load(skuId, 'fgName') || '');
    setFgPpl(load(skuId, 'fgPpl') ?? null);
    setConn(savedConn && Object.keys(savedConn).length ? savedConn : defaultConn(st.length, st, ct));
  }, [nBase, skuId]); // eslint-disable-line
  useEffect(() => { if (stations.length) saveLayout(skuId, { stations, carts, fg, conn, names, ppl, fgName, fgPpl }); }, [stations, carts, fg, conn, names, ppl, fgName, fgPpl]); // eslint-disable-line

  function floorXY(e) {
    const r = svgRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (FW / r.width), y: (e.clientY - r.top) * (FH / r.height) };
  }
  function onMove(e) {
    if (mode === 'draw' && pendingSrc) { setDrawCursor(floorXY(e)); return; }
    if (!drag) return;
    const p = floorXY(e);
    const x = Math.max(SW / 2, Math.min(FW - SW / 2, p.x - drag.offX));
    const y = Math.max(SH / 2, Math.min(FH - SH / 2, p.y - drag.offY));
    if (drag.type === 'station') setStations(s => s.map((q, i) => i === drag.idx ? { x, y } : q));
    else if (drag.type === 'cart') setCarts(c => c.map((q, i) => i === drag.idx ? { x, y } : q));
    else setFg({ x, y });
  }
  const startDrag = (type, idx, e) => { e.stopPropagation(); const p = floorXY(e); const cur = type === 'station' ? stations[idx] : type === 'cart' ? carts[idx] : fg; setDrag({ type, idx, offX: p.x - cur.x, offY: p.y - cur.y }); };

  // arrow drawing / deleting
  const addEdge = (a, b) => setConn(c => { const cur = c[a] || []; return cur.includes(b) ? c : { ...c, [a]: [...cur, b] }; });
  const removeEdge = (a, b) => setConn(c => ({ ...c, [a]: (c[a] || []).filter(t => t !== b) }));
  function handleDrawClick(key) {
    if (!pendingSrc) { if (key === 'fg') return; setPendingSrc(key); const c = nodeC(key); if (c) setDrawCursor({ x: c.x, y: c.y }); return; }
    if (pendingSrc === key) { setPendingSrc(null); return; }
    const srcCart = pendingSrc[0] === 'c', tgtCart = key[0] === 'c';
    // valid: station->station, station->FG, cart->station. Not: *->cart, cart->FG.
    if (!tgtCart && !(srcCart && key === 'fg')) addEdge(pendingSrc, key);
    setPendingSrc(null);
  }
  const onNodeDown = (key, type, idx, e) => { if (mode === 'draw') { e.stopPropagation(); e.preventDefault(); handleDrawClick(key); } else startDrag(type, idx, e); };

  // add / remove station boxes (independent of Line Designer count)
  const addStation = () => setStations(s => [...s, { x: 4 + (s.length % 6) * 3, y: 12.5 }]);
  const removeStation = () => {
    const i = stations.length - 1; if (i < 0) return;
    setStations(s => s.slice(0, -1));
    setConn(cn => { const x = { ...cn }; delete x['s' + i]; Object.keys(x).forEach(k => { x[k] = (x[k] || []).filter(t => t !== 's' + i); }); return x; });
    setNames(nm => { const x = { ...nm }; delete x[i]; return x; });
    setPpl(pp => { const x = { ...pp }; delete x[i]; return x; });
  };
  // one-click: arrange exactly like the Meritage sketch
  function applySketch() {
    const lbl = ['Connector station', 'Arms assembly', 'Back frame', 'Trellis', 'Seat frame', 'Full assembly'];
    const pk = [1, 2, 1, 1, 1, 2];
    setStations([{ x: 5, y: 4 }, { x: 11, y: 4 }, { x: 17, y: 4 }, { x: 23, y: 4 }, { x: 6, y: 9.5 }, { x: 15, y: 9.5 }]);
    const nm = {}, pp2 = {}; lbl.forEach((l, i) => { nm[i] = l; pp2[i] = pk[i]; });
    setNames(nm); setPpl(pp2);
    setCarts([{ x: 15, y: 1.5 }]);
    setFg({ x: 15, y: 13.8 }); setFgName('Furniture'); setFgPpl(0);
    setConn({ c0: ['s0', 's1', 's2', 's3', 's4'], s0: ['s1', 's2', 's3'], s1: ['s5'], s2: ['s5'], s3: ['s5'], s4: ['s5'], s5: ['fg'] });
    // also configure the line so the 3D Floor & Line Designer show this plan
    try {
      if (detail && detail.steps) {
        const seqToStation = { 1: 0, 2: 0, 3: 5, 4: 1, 5: 4, 6: 2, 7: 5, 8: 5, 9: 5, 10: 3, 11: 5, 12: 5 };
        const stPeople = [1, 2, 1, 1, 1, 2];
        const assign = {}, workers = {};
        detail.steps.forEach(s => { const st = seqToStation[s.sequence] != null ? seqToStation[s.sequence] : 5; assign[s.id] = st; workers[s.id] = stPeople[st] || 1; });
        localStorage.setItem(`sw-line-${skuId}`, JSON.stringify({ assign, workers, stationCount: 6 }));
      }
    } catch { /* ignore */ }
  }

  // node geometry by key ('s'=station, 'c'=cart, 'fg'=finished goods)
  const nodeC = key => key === 'fg' ? fg : key[0] === 'c' ? carts[parseInt(key.slice(1), 10)] : stations[parseInt(key.slice(1), 10)];
  const halfOf = key => key[0] === 'c' ? { hw: CW / 2, hh: CH / 2 } : { hw: SW / 2, hh: SH / 2 };
  function edge(key, tx, ty) {
    const c = nodeC(key); const { hw, hh } = halfOf(key); if (!c) return null;
    const dx = tx - c.x, dy = ty - c.y; if (dx === 0 && dy === 0) return [c.x, c.y];
    const s = Math.min(Math.abs(dx) < 1e-6 ? 1e9 : hw / Math.abs(dx), Math.abs(dy) < 1e-6 ? 1e9 : hh / Math.abs(dy));
    return [c.x + dx * s, c.y + dy * s];
  }
  const arrows = [];
  Object.keys(conn).forEach(src => {
    const cs = nodeC(src); if (!cs) return;
    (conn[src] || []).forEach(tg => {
      const ct = nodeC(tg); if (!ct) return;
      const p1 = edge(src, ct.x, ct.y), p2 = edge(tg, cs.x, cs.y);
      if (p1 && p2) arrows.push({ key: src + '-' + tg, src, tg, p1, p2, kind: src[0] === 'c' ? 'cart' : 'flow' });
    });
  });

  // metrics (flow arrows = parts movement; cart arrows = supply)
  const elen = a => Math.hypot(a.p1[0] - a.p2[0], a.p1[1] - a.p2[1]);
  const flowArr = arrows.filter(a => a.kind === 'flow'), cartArr = arrows.filter(a => a.kind === 'cart');
  const flowPath = flowArr.reduce((s, a) => s + elen(a), 0);
  const longestHop = flowArr.length ? Math.max(...flowArr.map(elen)) : 0;
  const cartTotal = cartArr.reduce((s, a) => s + elen(a), 0);
  const farthestEdge = cartArr.reduce((m2, a) => elen(a) > elen(m2 || a) ? a : (m2 || a), null);
  const farthest = farthestEdge ? elen(farthestEdge) : 0;
  const farthestIdx = farthestEdge ? parseInt(farthestEdge.tg.slice(1), 10) : -1;
  const totalPeople = (stations.map((_, i) => peopleOf(i)).reduce((a, b) => a + b, 0));
  const m = v => `${v.toFixed(1)} m`;

  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0 }}>Layout</h1>
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
      <p className="subtitle">A floor-plan view of the line. Drag the {n} stations, the parts cart and the Finished Goods box anywhere. Arrows show material flow — edit where each station feeds below. Stations &amp; people come from your Line Designer / build order.</p>

      <div className="card">
        <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="stat" style={{ borderLeftColor: '#1a56b0' }}><div className="stat-value">{m(flowPath)}</div><div className="stat-label">total flow path</div></div>
          <div className="stat" style={{ borderLeftColor: longestHop > 7 ? '#b3261e' : '#5c6470' }}><div className="stat-value">{m(longestHop)}</div><div className="stat-label">longest single hop</div></div>
          <div className="stat" style={{ borderLeftColor: '#d2762a' }}><div className="stat-value">{m(cartTotal)}</div><div className="stat-label">cart→station total</div></div>
          <div className="stat" style={{ borderLeftColor: '#2f7d52' }}><div className="stat-value">{totalPeople}</div><div className="stat-label">operators on the line</div></div>
          <div className="spacer" />
          <div className="field" style={{ maxWidth: 420 }}>
            <label>Arrange</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="small" onClick={applySketch} style={{ background: '#1f4d33', color: '#fff', borderColor: '#1f4d33' }}>★ Meritage sketch</button>
              {[['feeders', 'Feeders→Assembly'], ['row', 'Single row'], ['serpentine', 'Two rows'], ['u', 'U-shape'], ['cell', 'Cell']].map(([k, lbl]) =>
                <button key={k} className="small" onClick={() => setStations(preset(k, n))}>{lbl}</button>)}
            </div>
          </div>
          <div className="field" style={{ maxWidth: 130 }}>
            <label>Stations</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="small" onClick={addStation}>＋ Add</button>
              <button className="small" disabled={stations.length <= 1} onClick={removeStation}>− Remove</button>
            </div>
          </div>
          <div className="field" style={{ maxWidth: 150 }}>
            <label>Parts carts</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="small" onClick={() => setCarts(c => [...c, { x: FW / 2 + c.length * 2, y: 1.6 }])}>＋ Add</button>
              <button className="small" disabled={carts.length <= 0} onClick={() => { const i = carts.length - 1; setCarts(c => c.slice(0, -1)); setConn(cn => { const x = { ...cn }; delete x['c' + i]; return x; }); }}>− Remove</button>
            </div>
          </div>
          <div className="field" style={{ maxWidth: 280 }}>
            <label>Flow arrows (parts movement)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="small" onClick={() => { setMode(m => m === 'draw' ? 'move' : 'draw'); setPendingSrc(null); }}
                style={mode === 'draw' ? { background: '#1a56b0', color: '#fff', borderColor: '#1a56b0' } : undefined}>
                {mode === 'draw' ? '✏️ Drawing — click 2 boxes' : '✏️ Draw arrows'}</button>
              <button className="small" onClick={() => setConn(defaultConn(n, stations, carts))}>Reset</button>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 8 }}>
        <svg ref={svgRef} viewBox={`0 0 ${FW} ${FH}`} className="layout-svg"
          style={{ width: '100%', display: 'block', background: '#eef1f5', borderRadius: 8, touchAction: 'none', cursor: mode === 'draw' ? 'crosshair' : 'default' }}
          onPointerMove={onMove} onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)}
          onClick={e => { if (mode === 'draw' && e.target === svgRef.current) setPendingSrc(null); }}>
          <defs>
            <marker id="flowArrow" markerWidth="5" markerHeight="5" refX="3.6" refY="2" orient="auto">
              <path d="M0,0 L4,2 L0,4 Z" fill="#1a56b0" />
            </marker>
            <marker id="cartArrow" markerWidth="5" markerHeight="5" refX="3.6" refY="2" orient="auto">
              <path d="M0,0 L4,2 L0,4 Z" fill="#d2762a" />
            </marker>
          </defs>
          {/* aisle guide lines */}
          {[2.6, 14.4].map(y => <line key={y} x1="1" y1={y} x2={FW - 1} y2={y} stroke="#d9c544" strokeWidth="0.08" strokeDasharray="0.6 0.4" />)}
          {/* flow + cart-supply arrows — click to delete */}
          {arrows.map(a => {
            const isCart = a.kind === 'cart';
            const col = hoverArrow === a.key ? '#b3261e' : (isCart ? '#d2762a' : '#1a56b0');
            return (
              <g key={a.key} style={{ cursor: 'pointer' }}
                onClick={e => { e.stopPropagation(); removeEdge(a.src, a.tg); }}
                onPointerEnter={() => setHoverArrow(a.key)} onPointerLeave={() => setHoverArrow(h => h === a.key ? null : h)}>
                <line x1={a.p1[0]} y1={a.p1[1]} x2={a.p2[0]} y2={a.p2[1]} stroke="transparent" strokeWidth="0.55" />
                <line x1={a.p1[0]} y1={a.p1[1]} x2={a.p2[0]} y2={a.p2[1]}
                  stroke={col} strokeWidth={hoverArrow === a.key ? 0.17 : (isCart ? 0.08 : 0.11)}
                  strokeDasharray={isCart ? '0.4 0.3' : undefined} opacity="0.9"
                  markerEnd={isCart ? 'url(#cartArrow)' : 'url(#flowArrow)'} />
                <title>{isCart ? 'Cart supply — click to delete' : 'Parts flow — click to delete'}</title>
              </g>
            );
          })}
          {/* ghost line while drawing */}
          {mode === 'draw' && pendingSrc && nodeC(pendingSrc) && (
            <line x1={nodeC(pendingSrc).x} y1={nodeC(pendingSrc).y} x2={drawCursor.x} y2={drawCursor.y}
              stroke="#2f7d52" strokeWidth="0.1" strokeDasharray="0.3 0.3" markerEnd="url(#flowArrow)" pointerEvents="none" />
          )}
          {/* stations */}
          {stations.map((s, i) => {
            const np = displayPeople(i);
            return (
              <g key={i} style={{ cursor: mode === 'draw' ? 'crosshair' : 'grab' }} onPointerDown={e => onNodeDown('s' + i, 'station', i, e)}>
                <rect x={s.x - SW / 2} y={s.y - SH / 2} width={SW} height={SH} rx="0.18"
                  fill="#ffffff" stroke={pendingSrc === 's' + i ? '#2f7d52' : '#1d3a66'} strokeWidth={pendingSrc === 's' + i ? 0.18 : 0.08} />
                <rect x={s.x - SW / 2} y={s.y - SH / 2} width={SW} height={0.46} rx="0.18" fill="#1d3a66" />
                <text x={s.x - SW / 2 + 0.16} y={s.y - SH / 2 + 0.34} fontSize="0.32" fontWeight="700" fill="#fff">{i + 1}. {displayName(i).slice(0, 20)}</text>
                <text x={s.x + SW / 2 - 0.16} y={s.y - SH / 2 + 0.34} textAnchor="end" fontSize="0.34" fontWeight="700" fill="#cfe0ff">{np}👤</text>
                <text x={s.x} y={s.y + 0.55} textAnchor="middle" fontSize="0.62" fontWeight="800" fill="#16324f">{displayName(i).length > 14 ? displayName(i).slice(0, 18) : displayName(i)}</text>
                <title>{`${i + 1}. ${displayName(i)} — ${np} ${np === 1 ? 'person' : 'people'}\n${(groups[i] || []).map(stepName).join(', ')}`}</title>
              </g>
            );
          })}
          {/* finished goods */}
          <g style={{ cursor: mode === 'draw' ? 'crosshair' : 'grab' }} onPointerDown={e => onNodeDown('fg', 'fg', 0, e)}>
            <rect x={fg.x - SW / 2} y={fg.y - SH / 2} width={SW} height={SH} rx="0.18" fill="#eaf7ef" stroke="#2f7d52" strokeWidth={pendingSrc === 'fg' ? 0.18 : 0.09} />
            <rect x={fg.x - SW / 2} y={fg.y - SH / 2} width={SW} height={0.46} rx="0.18" fill="#2f7d52" />
            <text x={fg.x - SW / 2 + 0.16} y={fg.y - SH / 2 + 0.34} fontSize="0.32" fontWeight="700" fill="#fff">{(fgName || 'Finished Goods').slice(0, 18)}</text>
            {fgPpl != null && <text x={fg.x + SW / 2 - 0.16} y={fg.y - SH / 2 + 0.34} textAnchor="end" fontSize="0.34" fontWeight="700" fill="#d7f0e1">{fgPpl}👤</text>}
            <text x={fg.x} y={fg.y + 0.5} textAnchor="middle" fontSize="0.5" fontWeight="800" fill="#1f4d33">📦 {(fgName || 'Finished Goods').length > 12 ? '' : (fgName || 'Finished Goods')}</text>
            <title>{`${fgName || 'Finished Goods'}${fgPpl != null ? ` — ${fgPpl} people` : ''}`}</title>
          </g>
          {/* carts */}
          {carts.map((c, i) => (
            <g key={i} style={{ cursor: mode === 'draw' ? 'crosshair' : 'grab' }} onPointerDown={e => onNodeDown('c' + i, 'cart', i, e)}>
              <rect x={c.x - CW / 2} y={c.y - CH / 2} width={CW} height={CH} rx="0.1" fill="#d2762a" stroke={pendingSrc === 'c' + i ? '#2f7d52' : '#9c531f'} strokeWidth={pendingSrc === 'c' + i ? 0.16 : 0.06} />
              <rect x={c.x - CW / 2 + 0.12} y={c.y - CH / 2 + 0.12} width={CW - 0.24} height={CH - 0.24} rx="0.06" fill="#f0b36b" />
              <title>Parts cart {i + 1} — drag to move; in Draw mode, click then a station to add a supply arrow</title>
            </g>
          ))}
        </svg>
        <p className="muted" style={{ fontSize: 12, margin: '8px 4px 0' }}>
          <b>Move mode:</b> drag stations, carts and Finished Goods. <b>Draw arrows:</b> click the button, then click a box and the box it feeds — <b>station→station/FG</b> draws blue (parts flow), <b>cart→station</b> draws orange (supply). <b>Delete</b> any arrow by clicking it. Saved per product on this computer.
        </p>
      </div>

      {/* stations editor */}
      <div className="card">
        <h3 style={{ margin: '0 0 8px' }}>Stations — name, people &amp; flow</h3>
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Name each station, set its crew, and where it feeds (e.g. <b>S6</b>, or <b>S2, S3, S4</b>, or <b>FG</b>). Or just drag &amp; draw on the plan above. The <b>★ Meritage sketch</b> button sets it all up to match the drawing.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '44px 1.5fr 78px 1.3fr', gap: 8, alignItems: 'center', maxWidth: 760 }}>
          <div className="muted" style={{ fontSize: 11 }}>#</div><div className="muted" style={{ fontSize: 11 }}>Name</div><div className="muted" style={{ fontSize: 11 }}>People</div><div className="muted" style={{ fontSize: 11 }}>Feeds →</div>
          {stations.map((_, i) => (
            <Fragment key={i}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>S{i + 1}</div>
              <input type="text" value={names[i] ?? ''} placeholder={roleOf(i) || `Station ${i + 1}`}
                onChange={e => setNames(m => ({ ...m, [i]: e.target.value }))} />
              <input type="number" min="0" max="9" value={displayPeople(i)}
                onChange={e => setPpl(m => ({ ...m, [i]: Math.max(0, parseInt(e.target.value, 10) || 0) }))} />
              <input key={'f' + i + connToLabels(conn['s' + i])} type="text" defaultValue={connToLabels(conn['s' + i])}
                onBlur={e => setConn(c => ({ ...c, ['s' + i]: labelsToConn(e.target.value, n) }))} />
            </Fragment>
          ))}
          <div style={{ fontWeight: 700, fontSize: 13, color: '#2f7d52' }}>FG</div>
          <input type="text" value={fgName} placeholder="Finished Goods" onChange={e => setFgName(e.target.value)} />
          <input type="number" min="0" max="9" value={fgPpl ?? 0} onChange={e => setFgPpl(Math.max(0, parseInt(e.target.value, 10) || 0))} />
          <div className="muted" style={{ fontSize: 12 }}>— (end of line)</div>
        </div>
      </div>
    </>
  );
}
