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
  const [drag, setDrag] = useState(null);        // {id, offX, offY}
  const [link, setLink] = useState(null);        // {fromId, x, y}
  const [error, setError] = useState('');
  const [hoverArrow, setHoverArrow] = useState(null);

  const load = useCallback(() => { if (skuId != null) return api.get(`/api/skus/${skuId}`).then(setDetail); }, [skuId]);
  useEffect(() => { api.get('/api/skus').then(list => { setSkus(list); if (list.length) setSkuId(p => p ?? list[0].id); }); }, []);
  useEffect(() => { if (skuId == null) return; setSize(null); api.get(`/api/skus/${skuId}`).then(setDetail); }, [skuId]);

  const sizes = detail ? [...new Set(detail.steps.flatMap(s => s.size_times ? Object.keys(s.size_times) : []))] : [];
  const activeSize = size ?? (sizes.length ? sizes[Math.floor((sizes.length - 1) / 2)] : null);
  const timeOf = s => (activeSize && s.size_times && s.size_times[activeSize] != null) ? s.size_times[activeSize] : (s.effective_seconds || 0);

  // positions: load saved or auto-arrange by dependency layers
  useEffect(() => {
    if (!detail) return;
    const saved = loadPos(skuId);
    const have = detail.steps.every(s => saved[s.id]);
    if (have) setPos(saved);
    else setPos(autoArrange());
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
    return { x: e.clientX - r.left + boardRef.current.scrollLeft, y: e.clientY - r.top + boardRef.current.scrollTop };
  }

  function onPointerMove(e) {
    if (drag) {
      const { x, y } = boardXY(e);
      setPos(p => ({ ...p, [drag.id]: { x: Math.max(0, x - drag.offX), y: Math.max(0, y - drag.offY) } }));
    } else if (link) {
      const { x, y } = boardXY(e);
      setLink(l => ({ ...l, x, y }));
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
    setDrag(null);
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
        <button className="small" onClick={() => { const a = autoArrange(); setPos(a); }}>⤢ Auto-arrange</button>
      </div>
      <p className="subtitle">Drag sticky notes anywhere. To set a prerequisite, drag from a note's <strong>● right handle</strong> onto another note — the arrow means “must finish before.” Click an arrow to delete it. These arrows are the real dependencies: they drive the critical path, the simulation, and the line. Red = on the critical path.</p>

      {error && <div className="alert error">{error}</div>}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div ref={boardRef} className="map-board"
          style={{ position: 'relative', width: '100%', height: 560, overflow: 'auto', background: '#f3f5f8', backgroundImage: 'radial-gradient(#d6dbe3 1px, transparent 1px)', backgroundSize: '22px 22px' }}
          onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={() => { setDrag(null); setLink(null); }}>
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
              return (
                <g key={i}>
                  <path d={path} fill="none" stroke={a.critical ? '#b3261e' : '#7a828f'} strokeWidth={hot ? 3.5 : 2}
                    markerEnd={`url(#${a.critical ? 'ahr' : 'ah'})`} />
                  <path d={path} fill="none" stroke="transparent" strokeWidth="16" style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                    onPointerEnter={() => setHoverArrow(i)} onPointerLeave={() => setHoverArrow(null)}
                    onClick={() => removeDep(a.fromId, a.toId)} />
                </g>
              );
            })}
            {link && pos[link.fromId] && (() => {
              const s = anchor(link.fromId, 'out');
              return <path d={`M${s.x},${s.y} L${link.x},${link.y}`} fill="none" stroke="#1a56b0" strokeWidth="2.5" strokeDasharray="5 4" markerEnd="url(#ah)" />;
            })()}
          </svg>

          {detail && detail.steps.map(s => {
            const p = pos[s.id] || { x: 20, y: 20 };
            const crit = criticalSet.has(s.id);
            const t = timeOf(s);
            return (
              <div key={s.id} className={`map-note ${crit ? 'crit' : ''}`}
                style={{ left: p.x, top: p.y, width: NW, minHeight: NH, background: COLORS[(s.sequence - 1) % COLORS.length] }}
                onPointerDown={e => {
                  if (e.target.classList.contains('map-handle')) return;
                  const b = boardXY(e); setDrag({ id: s.id, offX: b.x - p.x, offY: b.y - p.y });
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
      <p className="muted" style={{ fontSize: 12 }}>
        Fastest possible (critical path): <strong>{formatTime(cp.criticalSeconds)}</strong>. Note positions are saved per product on this computer; the arrows (dependencies) are saved in your data and used everywhere.
      </p>
    </>
  );
}
