import { useEffect, useMemo, useState } from 'react';
import { api, formatTime, formatLong } from '@backend';
import { stepTimeAtWorkers } from '../../../shared/workerTime.js';
import { sizeLabel } from '../sizeLabel.js';

const NOTE_COLORS = ['#fff3b0', '#ffd6a5', '#caffbf', '#9bf6ff', '#bdb2ff', '#ffc6ff', '#fdffb6', '#a0e7e5'];

const loadLayout = skuId => { try { return JSON.parse(localStorage.getItem(`sw-line-${skuId}`)) || null; } catch { return null; } };
const saveLayout = (skuId, l) => { try { localStorage.setItem(`sw-line-${skuId}`, JSON.stringify(l)); } catch {} };

export default function LineDesigner() {
  const [skus, setSkus] = useState([]);
  const [skuId, setSkuId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [size, setSize] = useState(null);
  const [shiftHours, setShiftHours] = useState(8);
  const [assign, setAssign] = useState({});   // stepId -> stationIndex
  const [workers, setWorkers] = useState({});  // stepId -> count
  const [stationCount, setStationCount] = useState(5);
  const [dragId, setDragId] = useState(null);

  useEffect(() => { api.get('/api/skus').then(list => { setSkus(list); if (list.length) setSkuId(p => p ?? list[0].id); }); }, []);
  useEffect(() => { if (skuId == null) return; setSize(null); api.get(`/api/skus/${skuId}`).then(setDetail); }, [skuId]);

  const sizes = detail ? [...new Set(detail.steps.flatMap(s => s.size_times ? Object.keys(s.size_times) : []))] : [];
  const activeSize = size ?? (sizes.length ? sizes[Math.floor((sizes.length - 1) / 2)] : null);
  const baseTime = s => (activeSize && s.size_times && s.size_times[activeSize] != null) ? s.size_times[activeSize] : (s.effective_seconds || 0);

  // load saved layout or auto-balance a starting line
  useEffect(() => {
    if (!detail) return;
    const saved = loadLayout(skuId);
    if (saved && saved.assign) {
      setAssign(saved.assign); setWorkers(saved.workers || {}); setStationCount(saved.stationCount || 5);
    } else {
      autoBalance(5, true);
    }
  }, [detail]); // eslint-disable-line

  useEffect(() => {
    if (detail && Object.keys(assign).length) saveLayout(skuId, { assign, workers, stationCount });
  }, [assign, workers, stationCount]); // eslint-disable-line

  const wOf = id => workers[id] || 1;
  // On the board a 2nd person always helps: use the exact 2-person time if set
  // (Staffing page), otherwise assume ~40% faster with diminishing returns.
  const helpSecOf = s => s.help_seconds && s.help_seconds > 0 ? s.help_seconds : Math.round(baseTime(s) * 0.62);
  const timeOf = s => stepTimeAtWorkers(baseTime(s), wOf(s.id), true, helpSecOf(s));
  const MAX_W = 4;

  function autoBalance(n, setState) {
    if (!detail) return;
    const steps = detail.steps;
    const total = steps.reduce((a, s) => a + baseTime(s), 0);
    const targetPer = total / n;
    const nextAssign = {};
    let k = 0, acc = 0;
    for (const s of steps) {
      const t = baseTime(s);
      if (acc > 0 && acc + t > targetPer * 1.15 && k < n - 1) { k++; acc = 0; }
      nextAssign[s.id] = k;
      acc += t;
    }
    setAssign(nextAssign); setStationCount(n);
  }

  const stations = useMemo(() => {
    if (!detail) return [];
    const arr = Array.from({ length: stationCount }, () => []);
    for (const s of detail.steps) {
      const k = Math.min(stationCount - 1, assign[s.id] ?? 0);
      arr[k].push(s);
    }
    arr.forEach(list => list.sort((a, b) => a.sequence - b.sequence));
    return arr;
  }, [detail, assign, stationCount]);

  // metrics
  const stationTime = list => list.reduce((a, s) => a + timeOf(s), 0);
  const stationOps = list => list.length ? Math.max(...list.map(s => wOf(s.id))) : 0;
  const times = stations.map(stationTime);
  const bottleneck = Math.max(0, ...times);
  const totalOps = stations.reduce((a, l) => a + stationOps(l), 0);
  const shiftSeconds = Math.round(shiftHours * 3600);
  const unitsPerShift = bottleneck > 0 ? Math.floor(shiftSeconds / bottleneck) : 0;
  const totalWork = stations.reduce((a, l) => a + stationTime(l), 0);
  const activeStations = stations.filter(l => l.length).length;
  const balance = activeStations && bottleneck ? totalWork / (activeStations * bottleneck) : 0;

  // precedence: a step's prerequisites must be in an earlier (or same) station
  const stationOfStep = useMemo(() => { const m = {}; stations.forEach((l, k) => l.forEach(s => { m[s.id] = k; })); return m; }, [stations]);
  const violations = useMemo(() => {
    if (!detail) return new Set();
    const bad = new Set();
    for (const s of detail.steps) {
      for (const d of (s.depends_on || [])) {
        if (stationOfStep[d] != null && stationOfStep[s.id] != null && stationOfStep[d] > stationOfStep[s.id]) bad.add(s.id);
      }
    }
    return bad;
  }, [detail, stationOfStep]);

  function moveTo(stepId, k) { setAssign(a => ({ ...a, [stepId]: k })); }
  function setW(stepId, n) { setWorkers(w => ({ ...w, [stepId]: Math.max(1, n) })); }

  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0 }}>Line Designer</h1>
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
      <p className="subtitle">Drag each step onto a station. Each operator stays at their station and does the same work on every unit. Balance the stations so the slowest one (the bottleneck) is as light as possible — that sets your output rate. Use the −/+ on a helpable note to add a 2nd person and shrink its time.</p>

      <div className="card">
        <div className="row" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="stat" style={{ borderLeftColor: '#b3261e' }}>
            <div className="stat-value">{formatTime(bottleneck)}</div>
            <div className="stat-label">Cycle time (slowest station) — a unit comes off the line this often</div>
          </div>
          <div className="stat" style={{ borderLeftColor: '#1c7c3c' }}>
            <div className="stat-value">{unitsPerShift}</div>
            <div className="stat-label">units / {shiftHours}h shift</div>
          </div>
          <div className="stat" style={{ borderLeftColor: '#1a56b0' }}>
            <div className="stat-value">{totalOps}</div>
            <div className="stat-label">operators on the line</div>
          </div>
          <div className="stat" style={{ borderLeftColor: balance > 0.85 ? '#1c7c3c' : balance > 0.7 ? '#e0913d' : '#b3261e' }}>
            <div className="stat-value">{Math.round(balance * 100)}%</div>
            <div className="stat-label">line balance (higher = less idle)</div>
          </div>
          <div className="field" style={{ maxWidth: 110 }}>
            <label>Stations</label>
            <input type="number" min="1" max="14" value={stationCount}
              onChange={e => setStationCount(Math.max(1, Math.min(14, Number(e.target.value))))} />
          </div>
          <div className="field" style={{ maxWidth: 100 }}>
            <label>Shift (h)</label>
            <input type="number" min="0.5" step="0.5" value={shiftHours} onChange={e => setShiftHours(Math.max(0.5, Number(e.target.value)))} />
          </div>
          <button className="small" onClick={() => autoBalance(stationCount)}>⚖ Auto-balance</button>
        </div>
        {violations.size > 0 && (
          <div className="alert error" style={{ marginTop: 8, fontSize: 13 }}>
            {violations.size} step(s) are placed before a step they depend on (red border) — a unit can't reach that station yet. Move them later or move their prerequisite earlier.
          </div>
        )}
      </div>

      <div className="line-board">
        {stations.map((list, k) => {
          const tt = times[k];
          const isBottleneck = tt === bottleneck && tt > 0;
          return (
            <div key={k} className={`line-station ${isBottleneck ? 'bottleneck' : ''}`}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); if (dragId != null) moveTo(dragId, k); setDragId(null); }}>
              <div className="line-station-head">
                <strong>Station {k + 1}</strong>
                <span>{stationOps(list)} op{stationOps(list) === 1 ? '' : 's'}</span>
              </div>
              <div className={`line-station-time ${isBottleneck ? 'bn' : ''}`}>
                {formatTime(tt)}{isBottleneck && <span className="badge review" style={{ marginLeft: 6 }}>bottleneck</span>}
              </div>
              <div className="line-notes">
                {list.map(s => {
                  const w = wOf(s.id);
                  const bad = violations.has(s.id);
                  const exact = s.help_seconds && s.help_seconds > 0;
                  return (
                    <div key={s.id} draggable className={`sticky ${bad ? 'bad' : ''}`}
                      style={{ background: NOTE_COLORS[(s.sequence - 1) % NOTE_COLORS.length] }}
                      onDragStart={() => setDragId(s.id)} onDragEnd={() => setDragId(null)}>
                      <div className="sticky-name">{s.sequence}. {(s.tag_id ? s.tag_name : s.name) || ''}</div>
                      <div className="sticky-foot">
                        <span className="sticky-time">{formatTime(timeOf(s))}{w > 1 ? ` (${w}p)` : ''}</span>
                        <span className="sticky-workers">
                          <button className="wbtn" disabled={w <= 1} onClick={() => setW(s.id, w - 1)}>−</button>
                          <span title="workers on this step">{w}👤</span>
                          <button className="wbtn" disabled={w >= MAX_W} title="add a person to this step" onClick={() => setW(s.id, w + 1)}>＋</button>
                        </span>
                      </div>
                      {w > 1 && !exact && <div className="sticky-est">est. — set exact 2-person time on Staffing</div>}
                      {bad && <div className="sticky-warn">after a prerequisite ⚠</div>}
                    </div>
                  );
                })}
                {list.length === 0 && <div className="line-empty">drop steps here</div>}
              </div>
            </div>
          );
        })}
      </div>

      <p className="muted" style={{ fontSize: 12 }}>
        Cycle time = the slowest station; that's how often a finished unit comes off the line (operators all work in parallel on different units). Hands-on work total: <strong>{formatLong(totalWork)}</strong> across {activeStations} station(s). Layout is saved per product on this computer.
      </p>
    </>
  );
}
