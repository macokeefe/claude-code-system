import { useCallback, useEffect, useRef, useState } from 'react';
import { api, formatTime } from '@backend';
import { criticalPath } from '../../../shared/precedence.js';
import { sizeLabel } from '../sizeLabel.js';

const NW = 172, NH = 78; // note size
const COLORS = ['#fff3b0', '#ffd6a5', '#caffbf', '#9bf6ff', '#bdb2ff', '#ffc6ff', '#fdffb6', '#a0e7e5'];

const loadPos = id => { try { return JSON.parse(localStorage.getItem(`sw-map-${id}`)) || {}; } catch { return {}; } };
const savePos = (id, p) => { try { localStorage.setItem(`sw-map-${id}`, JSON.stringify(p)); } catch {} };

export default function ProcessMap() {
  const boardRef = useRef();
  const [skus, setSkus] = useState([]);
  const [skuId, setSkuId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [size, setSize] = useState(null);
  const [pos, setPos] = useState({});            // stepId -> {x,y}
  const [drag, setDrag] = useState(null);        // {startX, startY, items:[{id,x0,y0}], moved}
  const [link, setLink] = useState(null);        // {fromId, x, y}
  const [selected, setSelected] = useState(() => new Set()); // selected step ids
  const [marquee, setMarquee] = useState(null);  // {x0,y0,x1,y1}
  const [error, setError] = useState('');
  const [hoverArrow, setHoverArrow] = useState(null);
  const [zoom, setZoom] = useState(1);

  const load = useCallback(() => { if (skuId != null) return api.get(`/api/skus/${skuId}`).then(setDetail); }, [skuId]);
  useEffect(() => { api.get('/api/skus').then(list => { setSkus(list); if (list.length) setSkuId(p => p ?? list[0].id); }); }, []);
  useEffect(() => { if (skuId == null) return; setSize(null); setSelected(new Set()); api.get(`/api/skus/${skuId}`).then(setDetail); }, [skuId]);

  const sizes = detail ? [...new Set(detail.steps.flatMap(s => s.size_times ? Object.keys(s.size_times) : []))] : [];
  const activeSize = size ?? (sizes.length ? sizes[Math.floor((sizes.length - 1) / 2)] : null);
  const timeOf = s => (activeSize && s.size_times && s.size_times[activeSize] != null) ? s.size_times[activeSize] : (s.effective_seconds || 0);

  // positions: load saved or auto-arrange by dependency layers
  useEffect(() => {
    if (!detail) return;
    const saved = loadPos(skuId);
    const have = detail.steps.every(s => saved[s.id]);
    const next = have ? saved : autoArrange();
    setPos(next);
    fitView(next);
  }, [detail]); // eslint-disable-line

  useEffect(() => { if (detail && Object.keys(pos).length) savePos(skuId, pos); }, [pos]); // eslint-disable-line

  function autoArrange() {
    const steps = detail.steps;
    const byId = new Map(steps.map(s => [s.id, s]));
    const depth = new Map();
    const calc = id => {
      if (depth.has(id)) return depth.get(id);
      const s = byId.get(id); let d = 0;
      for (const p of (s.depends_on || [])) if (byId.has(p)) d = Math.max(d, calc(p) + 1);
      depth.set(id, d); return d;
    };
    steps.forEach(s => calc(s.id));
    const byLayer = {};
    steps.forEach(s => { const d = depth.get(s.id); (byLayer[d] = byLayer[d] || []).push(s); });
    const next = {};
    Object.entries(byLayer).forEach(([d, list]) => {
      list.forEach((s, i) => { next[s.id] = { x: 40 + Number(d) * 250, y: 40 + i * 108 }; });
    });
    return next;
  }

  const cp = detail ? criticalPath(detail.steps.map(s => ({ id: s.id, depends_on: s.depends_on || [], effective_seconds: timeOf(s) }))) : { criticalStepIds: [] };
  const criticalSet = new Set(cp.criticalStepIds);

  function boardXY(e) {
    const r = boardRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - r.left + boardRef.current.scrollLeft) / zoom,
      y: (e.clientY - r.top + boardRef.current.scrollTop) / zoom,
    };
  }

  // Scale the whole graph so it fits inside the visible board (never above 1×).
  function fitView(p) {
    const el = boardRef.current;
    if (!el) return;
    const vals = Object.values(p || {});
    if (!vals.length) return;
    const cw = Math.max(900, ...vals.map(q => q.x + NW + 40));
    const ch = Math.max(520, ...vals.map(q => q.y + NH + 40));
    const z = Math.min(1, (el.clientWidth - 8) / cw, (el.clientHeight - 8) / ch);
    setZoom(Math.max(0.4, Number(z.toFixed(3))));
    el.scrollTo({ left: 0, top: 0 });
  }

  function onPointerMove(e) {
    if (drag) {
      const { x, y } = boardXY(e);
      const dx = x - drag.startX, dy = y - drag.startY;
      if (!drag.moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) setDrag(d => ({ ...d, moved: true }));
      setPos(p => {
        const n = { ...p };
        for (const it of drag.items) n[it.id] = { x: Math.max(0, it.x0 + dx), y: Math.max(0, it.y0 + dy) };
        return n;
      });
    } else if (link) {
      const { x, y } = boardXY(e);
      setLink(l => ({ ...l, x, y }));
    } else if (marquee) {
      const { x, y } = boardXY(e);
      setMarquee(m => ({ ...m, x1: x, y1: y }));
    }
  }
  async function onPointerUp(e) {
    if (link) {
      const { x, y } = boardXY(e);
      // find note under cursor
      const target = detail.steps.find(s => {
        const p = pos[s.id]; if (!p) return false;
        return x >= p.x && x <= p.x + NW && y >= p.y && y <= p.y + NH;
      });
      if (target && target.id !== link.fromId) await addDep(link.fromId, target.id);
      setLink(null);
    }
    if (marquee) {
      const rx = Math.min(marquee.x0, marquee.x1), ry = Math.min(marquee.y0, marquee.y1);
      const rw = Math.abs(marquee.x1 - marquee.x0), rh = Math.abs(marquee.y1 - marquee.y0);
      if (rw > 4 || rh > 4) {
        const hit = new Set();
        for (const s of detail.steps) {
          const p = pos[s.id]; if (!p) continue;
          if (p.x < rx + rw && p.x + NW > rx && p.y < ry + rh && p.y + NH > ry) hit.add(s.id);
        }
        setSelected(prev => e.shiftKey ? new Set([...prev, ...hit]) : hit);
      } else if (!e.shiftKey) {
        setSelected(new Set()); // a click on empty space clears selection
      }
      setMarquee(null);
    }
    setDrag(null);
  }

  function onBoardPointerDown(e) {
    // background press (notes/handles stop propagation) → start a marquee
    const b = boardXY(e);
    setMarquee({ x0: b.x, y0: b.y, x1: b.x, y1: b.y });
  }

  function startNoteDrag(e, s) {
    e.stopPropagation();
    const b = boardXY(e);
    if (e.shiftKey) {
      setSelected(prev => { const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; });
      return; // shift-click toggles selection, no drag
    }
    const group = selected.has(s.id) && selected.size > 1 ? [...selected] : [s.id];
    if (!selected.has(s.id)) setSelected(new Set([s.id]));
    const items = group.map(id => ({ id, x0: (pos[id] || { x: 0, y: 0 }).x, y0: (pos[id] || { x: 0, y: 0 }).y }));
    setDrag({ startX: b.x, startY: b.y, items, moved: false });
  }

  async function addDep(fromId, toId) {
    // arrow from prerequisite -> dependent: toId.depends_on gains fromId
    const target = detail.steps.find(s => s.id === toId);
    if ((target.depends_on || []).includes(fromId)) return;
    setError('');
    try {
      await api.put(`/api/steps/${toId}`, { depends_on: [...(target.depends_on || []), fromId] });
      await load();
    } catch (err) { setError(err.message); }
  }
  async function removeDep(fromId, toId) {
    const target = detail.steps.find(s => s.id === toId);
    await api.put(`/api/steps/${toId}`, { depends_on: (target.depends_on || []).filter(d => d !== fromId) });
    await load();
  }

  // arrows: prerequisite (from) -> dependent (to)
  const arrows = [];
  if (detail) for (const s of detail.steps) for (const d of (s.depends_on || [])) {
    if (pos[d] && pos[s.id]) arrows.push({ fromId: d, toId: s.id, critical: criticalSet.has(d) && criticalSet.has(s.id) });
  }
  const anchor = (id, side) => {
    const p = pos[id] || { x: 0, y: 0 };
    return side === 'out' ? { x: p.x + NW, y: p.y + NH / 2 } : { x: p.x, y: p.y + NH / 2 };
  };

  const maxX = Math.max(900, ...Object.values(pos).map(p => p.x + NW + 60));
  const maxY = Math.max(520, ...Object.values(pos).map(p => p.y + NH + 60));

  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0 }}>Process Map</h1>
        <div className="spacer" />
        <select value={skuId || ''} onChange={e => setSkuId(Number(e.target.value))} style={{ width: 240 }}>
          {skus.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {sizes.length > 0 && (
          <select value={activeSize || ''} onChange={e => setSize(e.target.value)} style={{ width: 160 }}>
            {sizes.map(sz => <option key={sz} value={sz}>{sizeLabel(sz)}</option>)}
          </select>
        )}
        <button className="small" onClick={() => { const a = autoArrange(); setPos(a); fitView(a); }}>⤢ Auto-arrange</button>
        <span className="zoom-ctl">
          <button className="small" title="zoom out" onClick={() => setZoom(z => Math.max(0.4, Number((z - 0.1).toFixed(2))))}>−</button>
          <button className="small" title="fit to screen" onClick={() => fitView(pos)}>{Math.round(zoom * 100)}%</button>
          <button className="small" title="zoom in" onClick={() => setZoom(z => Math.min(1.6, Number((z + 0.1).toFixed(2))))}>＋</button>
        </span>
      </div>
      <p className="subtitle">Drag sticky notes anywhere. Drag a box around several to select them, or <strong>shift-click</strong> to add/remove — then drag any one to move the whole group. To set a prerequisite, drag from a note's <strong>● right handle</strong> onto another note (the arrow means “must finish before”). To delete an arrow, click its <strong>✕</strong>. These arrows are the real dependencies: they drive the critical path, the simulation, and the line. Red = on the critical path.{selected.size > 1 && <strong style={{ color: '#1a56b0' }}> · {selected.size} selected</strong>}</p>

      {error && <div className="alert error">{error}</div>}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div ref={boardRef} className="map-board"
          style={{ position: 'relative', width: '100%', height: 560, overflow: 'auto', background: '#f3f5f8', backgroundImage: 'radial-gradient(#d6dbe3 1px, transparent 1px)', backgroundSize: `${22 * zoom}px ${22 * zoom}px` }}
          onPointerDown={onBoardPointerDown}
          onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={() => { setDrag(null); setLink(null); setMarquee(null); }}>
          <div className="map-canvas" style={{ position: 'relative', width: maxX * zoom, height: maxY * zoom }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: maxX, height: maxY, transform: `scale(${zoom})`, transformOrigin: '0 0' }}>
          <svg width={maxX} height={maxY} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
            <defs>
              <marker id="ah" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
                <path d="M0,0 L7,3 L0,6 Z" fill="#5c6470" />
              </marker>
              <marker id="ahr" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
                <path d="M0,0 L7,3 L0,6 Z" fill="#b3261e" />
              </marker>
            </defs>
            {arrows.map((a, i) => {
              const s = anchor(a.fromId, 'out'), t = anchor(a.toId, 'in');
              const dx = Math.max(40, Math.abs(t.x - s.x) / 2);
              const path = `M${s.x},${s.y} C${s.x + dx},${s.y} ${t.x - dx},${t.y} ${t.x},${t.y}`;
              const hot = hoverArrow === i;
              const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2; // bezier midpoint
              return (
                <g key={i}>
                  <path d={path} fill="none" stroke={a.critical ? '#b3261e' : '#7a828f'} strokeWidth={hot ? 3.5 : 2}
                    markerEnd={`url(#${a.critical ? 'ahr' : 'ah'})`} />
                  <path d={path} fill="none" stroke="transparent" strokeWidth="16" style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                    onPointerEnter={() => setHoverArrow(i)} onPointerLeave={() => setHoverArrow(null)}
                    onClick={() => removeDep(a.fromId, a.toId)} />
                  {/* always-visible delete badge at the arrow midpoint; turns red on hover */}
                  <g style={{ pointerEvents: 'all', cursor: 'pointer' }}
                    onPointerEnter={() => setHoverArrow(i)} onPointerLeave={() => setHoverArrow(null)}
                    onClick={() => removeDep(a.fromId, a.toId)}>
                    <circle cx={mx} cy={my} r={hot ? 9.5 : 7} fill={hot ? '#b3261e' : '#ffffff'}
                      stroke={hot ? '#b3261e' : '#c2c8d0'} strokeWidth="1.5" opacity={hot ? 1 : 0.9} />
                    <path d={`M${mx - 3},${my - 3} L${mx + 3},${my + 3} M${mx + 3},${my - 3} L${mx - 3},${my + 3}`}
                      stroke={hot ? '#ffffff' : '#8a929c'} strokeWidth="1.7" strokeLinecap="round" />
                  </g>
                </g>
              );
            })}
            {link && pos[link.fromId] && (() => {
              const s = anchor(link.fromId, 'out');
              return <path d={`M${s.x},${s.y} L${link.x},${link.y}`} fill="none" stroke="#1a56b0" strokeWidth="2.5" strokeDasharray="5 4" markerEnd="url(#ah)" />;
            })()}
            {marquee && (() => {
              const rx = Math.min(marquee.x0, marquee.x1), ry = Math.min(marquee.y0, marquee.y1);
              const rw = Math.abs(marquee.x1 - marquee.x0), rh = Math.abs(marquee.y1 - marquee.y0);
              return <rect x={rx} y={ry} width={rw} height={rh} fill="rgba(26,86,176,0.10)" stroke="#1a56b0" strokeDasharray="4 3" strokeWidth="1.5" />;
            })()}
          </svg>

          {detail && detail.steps.map(s => {
            const p = pos[s.id] || { x: 20, y: 20 };
            const crit = criticalSet.has(s.id);
            const t = timeOf(s);
            return (
              <div key={s.id} className={`map-note ${crit ? 'crit' : ''} ${selected.has(s.id) ? 'sel' : ''}`}
                style={{ left: p.x, top: p.y, width: NW, minHeight: NH, background: COLORS[(s.sequence - 1) % COLORS.length] }}
                onPointerDown={e => {
                  if (e.target.classList.contains('map-handle')) return;
                  startNoteDrag(e, s);
                }}>
                <div className="map-note-name">{s.sequence}. {(s.tag_id ? s.tag_name : s.name) || ''}</div>
                <div className="map-note-time">{t > 0 ? formatTime(t) : 'no time'}{crit ? ' · critical' : ''}</div>
                <div className="map-handle" title="drag to a note this comes BEFORE"
                  onPointerDown={e => { e.stopPropagation(); const b = boardXY(e); setLink({ fromId: s.id, x: b.x, y: b.y }); }} />
              </div>
            );
          })}
          </div>
          </div>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        Fastest possible (critical path): <strong>{formatTime(cp.criticalSeconds)}</strong>. Note positions are saved per product on this computer; the arrows (dependencies) are saved in your data and used everywhere.
      </p>
    </>
  );
}
