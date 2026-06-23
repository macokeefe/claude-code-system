import { useEffect, useMemo, useRef, useState } from 'react';
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
function defaultConn(n) {
  const c = {};
  for (let i = 0; i < n; i++) c['s' + i] = [i < n - 1 ? 's' + (i + 1) : 'fg'];
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

  useEffect(() => { api.get('/api/skus').then(list => { setSkus(list); if (list.length) { const a = getActiveSku(); setSkuId(p => p ?? (list.some(s => s.id === a) ? a : list[0].id)); } }); }, []);
  useEffect(() => { if (skuId == null) return; setActiveSku(skuId); setSize(null); api.get(`/api/skus/${skuId}`).then(setDetail); }, [skuId]);

  const sizes = detail ? [...new Set(detail.steps.flatMap(s => s.size_times ? Object.keys(s.size_times) : []))] : [];
  const activeSize = size ?? (sizes.length ? sizes[Math.floor((sizes.length - 1) / 2)] : null);
  const durOf = s => (activeSize && s.size_times && s.size_times[activeSize] != null) ? s.size_times[activeSize] : (s.effective_seconds || 0);

  const groups = useMemo(() => detail ? computeGroups(detail.steps, skuId, durOf) : [], [detail, activeSize]); // eslint-disable-line
  const n = groups.length;

  // people per station from the Line Designer worker counts (max staffing on its steps)
  const lineWorkers = useMemo(() => { try { return JSON.parse(localStorage.getItem(`sw-line-${skuId}`))?.workers || {}; } catch { return {}; } }, [skuId, detail]);
  const stepName = s => (s.tag_id ? s.tag_name : s.name) || `Step ${s.sequence}`;
  const peopleOf = i => Math.max(1, ...(groups[i] || []).map(s => lineWorkers[s.id] || 1));
  const roleOf = i => { const g = groups[i] || []; if (!g.length) return ''; const top = g.reduce((a, b) => durOf(b) > durOf(a) ? b : a, g[0]); return stepName(top); };

  // load saved positions/connections, else defaults
  useEffect(() => {
    if (!n) return;
    const savedS = load(skuId, 'stations');
    const savedC = load(skuId, 'carts');
    const savedFg = load(skuId, 'fg');
    const savedConn = load(skuId, 'conn');
    setStations(savedS && savedS.length === n ? savedS : preset('feeders', n));
    setCarts(savedC && savedC.length ? savedC : [{ x: FW / 2, y: 1.6 }]);
    setFg(savedFg || { x: FW - 3, y: 5 });
    setConn(savedConn && Object.keys(savedConn).length ? savedConn : defaultConn(n));
  }, [n, skuId]); // eslint-disable-line
  useEffect(() => { if (stations.length) saveLayout(skuId, { stations, carts, fg, conn }); }, [stations, carts, fg, conn]); // eslint-disable-line

  function floorXY(e) {
    const r = svgRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (FW / r.width), y: (e.clientY - r.top) * (FH / r.height) };
  }
  function onMove(e) {
    if (!drag) return;
    const p = floorXY(e);
    const x = Math.max(SW / 2, Math.min(FW - SW / 2, p.x - drag.offX));
    const y = Math.max(SH / 2, Math.min(FH - SH / 2, p.y - drag.offY));
    if (drag.type === 'station') setStations(s => s.map((q, i) => i === drag.idx ? { x, y } : q));
    else if (drag.type === 'cart') setCarts(c => c.map((q, i) => i === drag.idx ? { x, y } : q));
    else setFg({ x, y });
  }
  const startDrag = (type, idx, e) => { e.stopPropagation(); const p = floorXY(e); const cur = type === 'station' ? stations[idx] : type === 'cart' ? carts[idx] : fg; setDrag({ type, idx, offX: p.x - cur.x, offY: p.y - cur.y }); };

  // node geometry by key
  const nodeC = key => key === 'fg' ? fg : stations[parseInt(key.slice(1), 10)];
  const halfOf = key => key === 'fg' ? { hw: SW / 2, hh: SH / 2 } : { hw: SW / 2, hh: SH / 2 };
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
      if (p1 && p2) arrows.push({ key: src + '-' + tg, p1, p2 });
    });
  });

  // metrics (along the flow graph)
  const flowEdges = arrows.map(a => Math.hypot(a.p1[0] - a.p2[0], a.p1[1] - a.p2[1]));
  const flowPath = flowEdges.reduce((a, b) => a + b, 0);
  const longestHop = flowEdges.length ? Math.max(...flowEdges) : 0;
  const cartFeed = stations.map(s => carts.length ? Math.min(...carts.map(c => dist(s, c))) : 0);
  const cartTotal = cartFeed.reduce((a, b) => a + b, 0);
  const farthest = cartFeed.length ? Math.max(...cartFeed) : 0;
  const farthestIdx = cartFeed.indexOf(farthest);
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
          <div className="field" style={{ maxWidth: 360 }}>
            <label>Arrange</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[['feeders', 'Feeders→Assembly'], ['row', 'Single row'], ['serpentine', 'Two rows'], ['u', 'U-shape'], ['cell', 'Cell']].map(([k, lbl]) =>
                <button key={k} className="small" onClick={() => setStations(preset(k, n))}>{lbl}</button>)}
            </div>
          </div>
          <div className="field" style={{ maxWidth: 150 }}>
            <label>Parts carts</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="small" onClick={() => setCarts(c => [...c, { x: FW / 2 + c.length * 2, y: 1.6 }])}>＋ Add</button>
              <button className="small" disabled={carts.length <= 0} onClick={() => setCarts(c => c.slice(0, -1))}>− Remove</button>
            </div>
          </div>
          <div className="field" style={{ maxWidth: 130 }}>
            <label>Flow</label>
            <button className="small" onClick={() => setConn(defaultConn(n))}>Reset arrows</button>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 8 }}>
        <svg ref={svgRef} viewBox={`0 0 ${FW} ${FH}`} className="layout-svg"
          style={{ width: '100%', display: 'block', background: '#eef1f5', borderRadius: 8, touchAction: 'none' }}
          onPointerMove={onMove} onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)}>
          <defs>
            <marker id="flowArrow" markerWidth="5" markerHeight="5" refX="3.6" refY="2" orient="auto">
              <path d="M0,0 L4,2 L0,4 Z" fill="#1a56b0" />
            </marker>
          </defs>
          {/* aisle guide lines */}
          {[2.6, 14.4].map(y => <line key={y} x1="1" y1={y} x2={FW - 1} y2={y} stroke="#d9c544" strokeWidth="0.08" strokeDasharray="0.6 0.4" />)}
          {/* cart → nearest station feed lines */}
          {stations.map((s, i) => {
            if (!carts.length) return null;
            let best = carts[0], bd = dist(s, carts[0]);
            for (const c of carts) { const d = dist(s, c); if (d < bd) { bd = d; best = c; } }
            return <line key={i} x1={s.x} y1={s.y} x2={best.x} y2={best.y} stroke="#d2762a" strokeWidth="0.05" strokeDasharray="0.4 0.3" opacity="0.65" />;
          })}
          {/* flow arrows between stations / to finished goods */}
          {arrows.map(a => (
            <line key={a.key} x1={a.p1[0]} y1={a.p1[1]} x2={a.p2[0]} y2={a.p2[1]}
              stroke="#1a56b0" strokeWidth="0.11" opacity="0.85" markerEnd="url(#flowArrow)" />
          ))}
          {/* stations */}
          {stations.map((s, i) => {
            const ppl = peopleOf(i);
            return (
              <g key={i} style={{ cursor: 'grab' }} onPointerDown={e => startDrag('station', i, e)}>
                <rect x={s.x - SW / 2} y={s.y - SH / 2} width={SW} height={SH} rx="0.18"
                  fill="#ffffff" stroke="#1d3a66" strokeWidth="0.08" />
                <rect x={s.x - SW / 2} y={s.y - SH / 2} width={SW} height={0.46} rx="0.18" fill="#1d3a66" />
                <text x={s.x - SW / 2 + 0.18} y={s.y - SH / 2 + 0.34} fontSize="0.34" fontWeight="700" fill="#fff">STATION {i + 1}</text>
                <text x={s.x + SW / 2 - 0.18} y={s.y - SH / 2 + 0.34} textAnchor="end" fontSize="0.34" fontWeight="700" fill="#cfe0ff">{ppl}👤</text>
                <text x={s.x} y={s.y + 0.12} textAnchor="middle" fontSize="0.78" fontWeight="800" fill="#10151d">{i + 1}</text>
                <text x={s.x} y={s.y + SH / 2 - 0.22} textAnchor="middle" fontSize="0.36" fontWeight="600" fill="#41506a">{roleOf(i).slice(0, 22)}</text>
                <title>{`Station ${i + 1} — ${ppl} ${ppl > 1 ? 'people' : 'person'}\n${(groups[i] || []).map(stepName).join(', ')}`}</title>
              </g>
            );
          })}
          {/* finished goods */}
          <g style={{ cursor: 'grab' }} onPointerDown={e => startDrag('fg', 0, e)}>
            <rect x={fg.x - SW / 2} y={fg.y - SH / 2} width={SW} height={SH} rx="0.18" fill="#eaf7ef" stroke="#2f7d52" strokeWidth="0.09" />
            <rect x={fg.x - SW / 2} y={fg.y - SH / 2} width={SW} height={0.46} rx="0.18" fill="#2f7d52" />
            <text x={fg.x} y={fg.y - SH / 2 + 0.34} textAnchor="middle" fontSize="0.34" fontWeight="700" fill="#fff">FINISHED GOODS</text>
            <text x={fg.x} y={fg.y + 0.3} textAnchor="middle" fontSize="0.5" fontWeight="800" fill="#1f4d33">📦</text>
            <title>Finished Goods — packed unit leaves the line</title>
          </g>
          {/* carts */}
          {carts.map((c, i) => (
            <g key={i} style={{ cursor: 'grab' }} onPointerDown={e => startDrag('cart', i, e)}>
              <rect x={c.x - CW / 2} y={c.y - CH / 2} width={CW} height={CH} rx="0.1" fill="#d2762a" stroke="#9c531f" strokeWidth="0.06" />
              <rect x={c.x - CW / 2 + 0.12} y={c.y - CH / 2 + 0.12} width={CW - 0.24} height={CH - 0.24} rx="0.06" fill="#f0b36b" />
              <title>Parts cart — drag to feed nearby stations</title>
            </g>
          ))}
        </svg>
        <p className="muted" style={{ fontSize: 12, margin: '8px 4px 0' }}>
          Drag stations, the cart and Finished Goods to test arrangements. Blue arrows = material flow (edit below). Orange = each station to its nearest cart. Layout saved per product on this computer.
        </p>
      </div>

      {/* flow editor */}
      <div className="card">
        <h3 style={{ margin: '0 0 8px' }}>Flow — where each station feeds</h3>
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Type target stations (e.g. <b>S6</b>, or <b>S2, S3, S4</b>) or <b>FG</b> for finished goods. This draws the arrows — use it to build sub-assemblies that converge into a final station.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 8 }}>
          {stations.map((_, i) => (
            <div key={i} className="row" style={{ gap: 8, alignItems: 'center' }}>
              <span style={{ minWidth: 130, fontSize: 13 }}><b>S{i + 1}</b> {roleOf(i).slice(0, 16)} <span className="muted">({peopleOf(i)}👤)</span></span>
              <span className="muted">→</span>
              <input type="text" defaultValue={connToLabels(conn['s' + i])} style={{ flex: 1, minWidth: 80 }}
                onBlur={e => setConn(c => ({ ...c, ['s' + i]: labelsToConn(e.target.value, n) }))} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
