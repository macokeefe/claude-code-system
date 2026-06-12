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
    const gap = Math.min(3.4, (FW - 4) / n);
    const x0 = cx - (gap * (n - 1)) / 2;
    for (let i = 0; i < n; i++) out.push({ x: x0 + i * gap, y: 5 });
  } else if (name === 'serpentine') {
    const half = Math.ceil(n / 2);
    const gap = Math.min(3.4, (FW - 4) / half);
    const x0 = cx - (gap * (half - 1)) / 2;
    for (let i = 0; i < n; i++) {
      const top = i < half;
      const col = top ? i : (n - 1 - i);
      out.push({ x: x0 + col * gap, y: top ? 4.5 : 9.5 });
    }
  } else if (name === 'u') {
    const perLeg = Math.ceil(n / 3);
    const gap = 3.0;
    for (let i = 0; i < n; i++) {
      if (i < perLeg) out.push({ x: 5, y: 3.5 + i * gap });               // down the left
      else if (i < 2 * perLeg) out.push({ x: 5 + (i - perLeg + 1) * 3.4, y: 3.5 + (perLeg - 1) * gap }); // across bottom
      else out.push({ x: 5 + (perLeg) * 3.4, y: 3.5 + (n - 1 - i) * gap }); // up the right
    }
  } else { // cell — compact two short rows facing in
    const half = Math.ceil(n / 2);
    const gap = 3.2; const x0 = cx - (gap * (half - 1)) / 2;
    for (let i = 0; i < n; i++) {
      const top = i < half; const col = top ? i : (n - 1 - i);
      out.push({ x: x0 + col * gap, y: top ? 6 : 8.2 });
    }
  }
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
  const [drag, setDrag] = useState(null);         // {type,idx,offX,offY}

  useEffect(() => { api.get('/api/skus').then(list => { setSkus(list); if (list.length) { const a = getActiveSku(); setSkuId(p => p ?? (list.some(s => s.id === a) ? a : list[0].id)); } }); }, []);
  useEffect(() => { if (skuId == null) return; setActiveSku(skuId); setSize(null); api.get(`/api/skus/${skuId}`).then(setDetail); }, [skuId]);

  const sizes = detail ? [...new Set(detail.steps.flatMap(s => s.size_times ? Object.keys(s.size_times) : []))] : [];
  const activeSize = size ?? (sizes.length ? sizes[Math.floor((sizes.length - 1) / 2)] : null);
  const durOf = s => (activeSize && s.size_times && s.size_times[activeSize] != null) ? s.size_times[activeSize] : (s.effective_seconds || 0);

  const groups = useMemo(() => detail ? computeGroups(detail.steps, skuId, durOf) : [], [detail, activeSize]); // eslint-disable-line
  const n = groups.length;

  // load saved positions, else default to a single row
  useEffect(() => {
    if (!n) return;
    const savedS = load(skuId, 'stations');
    const savedC = load(skuId, 'carts');
    setStations(savedS && savedS.length === n ? savedS : preset('row', n));
    setCarts(savedC && savedC.length ? savedC : [{ x: FW / 2, y: 12 }]);
  }, [n, skuId]); // eslint-disable-line
  useEffect(() => { if (stations.length) saveLayout(skuId, { stations, carts }); }, [stations, carts]); // eslint-disable-line

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
    else setCarts(c => c.map((q, i) => i === drag.idx ? { x, y } : q));
  }
  const startDrag = (type, idx, e) => { e.stopPropagation(); const p = floorXY(e); const cur = (type === 'station' ? stations : carts)[idx]; setDrag({ type, idx, offX: p.x - cur.x, offY: p.y - cur.y }); };

  // metrics
  const flowHops = [];
  for (let i = 0; i < stations.length - 1; i++) flowHops.push(dist(stations[i], stations[i + 1]));
  const flowPath = flowHops.reduce((a, b) => a + b, 0);
  const longestHop = flowHops.length ? Math.max(...flowHops) : 0;
  const longestHopIdx = flowHops.indexOf(longestHop);
  // each station is fed by its nearest cart
  const cartFeed = stations.map(s => carts.length ? Math.min(...carts.map(c => dist(s, c))) : 0);
  const cartTotal = cartFeed.reduce((a, b) => a + b, 0);
  const farthest = cartFeed.length ? Math.max(...cartFeed) : 0;
  const farthestIdx = cartFeed.indexOf(farthest);
  const m = v => `${v.toFixed(1)} m`;

  const stepName = s => (s.tag_id ? s.tag_name : s.name) || `Step ${s.sequence}`;

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
      <p className="subtitle">Try different floor arrangements: drag the {n} stations and the parts cart anywhere, and watch the travel numbers. The blue line is the product flowing station 1→{n}; orange lines show each station reaching its nearest cart. Shorter = less walking and material handling.</p>

      <div className="card">
        <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="stat" style={{ borderLeftColor: '#1a56b0' }}><div className="stat-value">{m(flowPath)}</div><div className="stat-label">total flow path (1→{n})</div></div>
          <div className="stat" style={{ borderLeftColor: longestHop > 6 ? '#b3261e' : '#5c6470' }}><div className="stat-value">{m(longestHop)}</div><div className="stat-label">longest single hop{longestHopIdx >= 0 ? ` (${longestHopIdx + 1}→${longestHopIdx + 2})` : ''}</div></div>
          <div className="stat" style={{ borderLeftColor: '#d2762a' }}><div className="stat-value">{m(cartTotal)}</div><div className="stat-label">cart→station total</div></div>
          <div className="stat" style={{ borderLeftColor: farthest > 7 ? '#b3261e' : '#5c6470' }}><div className="stat-value">{m(farthest)}</div><div className="stat-label">farthest station from a cart{farthestIdx >= 0 ? ` (#${farthestIdx + 1})` : ''}</div></div>
          <div className="spacer" />
          <div className="field" style={{ maxWidth: 320 }}>
            <label>Arrange</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[['row', 'Single row'], ['serpentine', 'Two rows'], ['u', 'U-shape'], ['cell', 'Cell']].map(([k, lbl]) =>
                <button key={k} className="small" onClick={() => setStations(preset(k, n))}>{lbl}</button>)}
            </div>
          </div>
          <div className="field" style={{ maxWidth: 150 }}>
            <label>Parts carts</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="small" onClick={() => setCarts(c => [...c, { x: FW / 2 + c.length * 2, y: 13 }])}>＋ Add</button>
              <button className="small" disabled={carts.length <= 0} onClick={() => setCarts(c => c.slice(0, -1))}>− Remove</button>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 8 }}>
        <svg ref={svgRef} viewBox={`0 0 ${FW} ${FH}`} className="layout-svg"
          style={{ width: '100%', display: 'block', background: '#eef1f5', borderRadius: 8, touchAction: 'none' }}
          onPointerMove={onMove} onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)}>
          {/* aisle guide lines */}
          {[3.0, 10.6].map(y => <line key={y} x1="1" y1={y} x2={FW - 1} y2={y} stroke="#d9c544" strokeWidth="0.08" strokeDasharray="0.6 0.4" />)}
          {/* cart → nearest station feed lines */}
          {stations.map((s, i) => {
            if (!carts.length) return null;
            let best = carts[0], bd = dist(s, carts[0]);
            for (const c of carts) { const d = dist(s, c); if (d < bd) { bd = d; best = c; } }
            return <line key={i} x1={s.x} y1={s.y} x2={best.x} y2={best.y} stroke="#d2762a" strokeWidth="0.05" strokeDasharray="0.4 0.3" opacity="0.7" />;
          })}
          {/* product flow path 1→n */}
          {stations.length > 1 && (
            <polyline points={stations.map(s => `${s.x},${s.y}`).join(' ')} fill="none"
              stroke="#1a56b0" strokeWidth="0.12" strokeLinejoin="round" opacity="0.8" />
          )}
          {/* stations */}
          {stations.map((s, i) => {
            const isLongHop = i === longestHopIdx || i === longestHopIdx + 1;
            return (
              <g key={i} style={{ cursor: 'grab' }} onPointerDown={e => startDrag('station', i, e)}>
                <rect x={s.x - SW / 2} y={s.y - SH / 2} width={SW} height={SH} rx="0.18"
                  fill="#ffffff" stroke={isLongHop && longestHop > 6 ? '#b3261e' : '#1d3a66'} strokeWidth="0.08" />
                <rect x={s.x - SW / 2} y={s.y - SH / 2} width={SW} height={0.5} rx="0.18" fill="#1d3a66" />
                <text x={s.x} y={s.y + 0.32} textAnchor="middle" fontSize="0.95" fontWeight="800" fill="#10151d">{i + 1}</text>
                <text x={s.x} y={s.y - SH / 2 + 0.37} textAnchor="middle" fontSize="0.34" fontWeight="700" fill="#fff">STATION {i + 1}</text>
                <title>{`Station ${i + 1}: ${groups[i]?.map(stepName).join(', ')}`}</title>
              </g>
            );
          })}
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
          Drag stations and carts to test arrangements. Stations are grouped from your Line Designer / build order; hover one to see its steps. Layout is saved per product on this computer. A long hop or a station far from any cart is flagged red.
        </p>
      </div>
    </>
  );
}
