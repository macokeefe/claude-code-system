import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { api, formatTime, formatLong } from '@backend';
import { simulateBuild } from '../../../shared/simulate.js';
import { sizeLabel } from '../sizeLabel.js';

function Stat({ label, value, sub, tone }) {
  return (
    <div className="stat" style={tone ? { borderLeftColor: tone } : undefined}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="muted" style={{ fontSize: 12 }}>{sub}</div>}
    </div>
  );
}

export default function Staffing() {
  const [skus, setSkus] = useState([]);
  const [skuId, setSkuId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [size, setSize] = useState(null);
  const [operators, setOperators] = useState(8);
  const [shiftHours, setShiftHours] = useState(8);
  const [target, setTarget] = useState(8);
  const [helping, setHelping] = useState(true);

  const load = useCallback(() => { if (skuId != null) api.get(`/api/skus/${skuId}`).then(setDetail); }, [skuId]);
  useEffect(() => { api.get('/api/skus').then(list => { setSkus(list); if (list.length) setSkuId(p => p ?? list[0].id); }); }, []);
  useEffect(() => { if (skuId == null) return; setSize(null); api.get(`/api/skus/${skuId}`).then(setDetail); }, [skuId]);

  const sizes = detail ? [...new Set(detail.steps.flatMap(s => s.size_times ? Object.keys(s.size_times) : []))] : [];
  const activeSize = size ?? (sizes.length ? sizes[Math.floor((sizes.length - 1) / 2)] : null);

  // Steps with the chosen size applied, ready for the simulator.
  const simSteps = useMemo(() => {
    if (!detail) return [];
    return detail.steps.map(s => ({
      id: s.id,
      depends_on: s.depends_on || [],
      effective_seconds: (activeSize && s.size_times && s.size_times[activeSize] != null) ? s.size_times[activeSize] : (s.effective_seconds || 0),
      helpable: !!s.helpable,
      help_seconds: s.help_seconds || 0,
    }));
  }, [detail, activeSize]);

  const shiftSeconds = Math.round(shiftHours * 3600);
  const sim = useMemo(() => simSteps.length ? simulateBuild(simSteps, operators, { helping }) : null, [simSteps, operators, helping]);
  const unitsPerShift = sim && sim.makespan > 0 ? Math.floor(shiftSeconds / sim.makespan) : 0;
  const hitsTarget = unitsPerShift >= target;
  const neededTimePerUnit = target > 0 ? shiftSeconds / target : 0; // takt: each unit must finish in this to hit target

  // Operator sweep: how makespan & throughput change with crew size.
  const sweep = useMemo(() => {
    if (!simSteps.length) return [];
    const rows = [];
    for (let n = 2; n <= 16; n++) {
      const r = simulateBuild(simSteps, n, { helping });
      rows.push({ n, makespan: r.makespan, units: r.makespan > 0 ? Math.floor(shiftSeconds / r.makespan) : 0, util: r.utilization });
    }
    return rows;
  }, [simSteps, helping, shiftSeconds]);

  const sweepChart = sweep.map(r => ({ name: `${r.n}`, minutes: +(r.makespan / 60).toFixed(1), hits: r.units >= target }));

  // helpable editor
  async function setHelpable(step, on) { await api.put(`/api/steps/${step.id}`, { helpable: on }); load(); }
  async function setHelpTime(step, v) { await api.put(`/api/steps/${step.id}`, { help_time: v, helpable: true }); load(); }

  // step ids that received a helper during the current sim (role 'help')
  const helpedInSim = sim ? new Set(sim.operators.flatMap(o => (o.intervals || []).filter(iv => iv.role === 'help').map(iv => iv.template))) : new Set();

  return (
    <>
      <h1>Staffing & throughput</h1>
      <p className="subtitle">Set a target, then try operator structures. Idle operators automatically jump in to help on steps you mark as helpable, and peel off when their own work comes ready.</p>

      <div className="card">
        <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
          <div className="field" style={{ minWidth: 220 }}>
            <label>Product</label>
            <select value={skuId || ''} onChange={e => setSkuId(Number(e.target.value))}>
              {skus.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {sizes.length > 0 && (
            <div className="field" style={{ maxWidth: 150 }}>
              <label>Size</label>
              <select value={activeSize || ''} onChange={e => setSize(e.target.value)}>
                {sizes.map(sz => <option key={sz} value={sz}>{sizeLabel(sz)}</option>)}
              </select>
            </div>
          )}
          <div className="field" style={{ maxWidth: 120 }}>
            <label>Target (units)</label>
            <input type="number" min="1" value={target} onChange={e => setTarget(Math.max(1, Number(e.target.value)))} />
          </div>
          <div className="field" style={{ maxWidth: 120 }}>
            <label>Shift (hours)</label>
            <input type="number" min="0.5" step="0.5" value={shiftHours} onChange={e => setShiftHours(Math.max(0.5, Number(e.target.value)))} />
          </div>
          <div className="field" style={{ maxWidth: 130 }}>
            <label>Operators</label>
            <input type="number" min="1" value={operators} onChange={e => setOperators(Math.max(1, Number(e.target.value)))} />
          </div>
          <div className="field" style={{ maxWidth: 170 }}>
            <label>Helping</label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', textTransform: 'none', fontWeight: 400, marginTop: 6 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={helping} onChange={e => setHelping(e.target.checked)} />
              idle operators help out
            </label>
          </div>
        </div>
      </div>

      {sim && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>With {operators} operators{helping ? ' + helping' : ''}</h2>
          <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
            <Stat label="Build time per unit" value={formatLong(sim.makespan)} tone="#1a56b0" />
            <Stat label={`Units in ${shiftHours}h`} value={unitsPerShift} tone={hitsTarget ? '#1c7c3c' : '#b3261e'} sub={`target ${target}`} />
            <Stat label="Hits target?" value={hitsTarget ? 'Yes ✓' : 'No'} tone={hitsTarget ? '#1c7c3c' : '#b3261e'}
              sub={hitsTarget ? `${unitsPerShift - target} spare` : `short ${target - unitsPerShift}`} />
            <Stat label="Operator utilization" value={`${Math.round(sim.utilization * 100)}%`} sub={`${formatLong(sim.idleSeconds)} idle/unit`} />
            <Stat label="Need ≤ per unit" value={formatLong(neededTimePerUnit)} sub="to hit target" tone={sim.makespan <= neededTimePerUnit ? '#1c7c3c' : '#e0913d'} />
          </div>
          {sim.stuck && <div className="alert error" style={{ marginTop: 10 }}>The dependency graph has a cycle — the build can't complete. Fix it on the SKU page.</div>}
        </div>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>How many operators do you need? <span className="muted" style={{ fontWeight: 400 }}>(green = hits the {target}-unit target)</span></h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={sweepChart} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
            <XAxis dataKey="name" label={{ value: 'operators', position: 'insideBottom', offset: -2, fontSize: 12 }} />
            <YAxis unit=" min" />
            <Tooltip formatter={(v) => [`${v} min/unit`]} labelFormatter={l => `${l} operators`} />
            <Bar dataKey="minutes" radius={[4, 4, 0, 0]} maxBarSize={40}>
              {sweepChart.map((d, i) => <Cell key={i} fill={d.hits ? '#1c7c3c' : '#9aa4b2'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <table className="data" style={{ marginTop: 8 }}>
          <thead><tr><th>Operators</th><th>Build time / unit</th><th>Units / shift</th><th>Utilization</th><th>Target</th></tr></thead>
          <tbody>
            {sweep.filter(r => [2, 4, 6, 8, 10, 12, 14, 16].includes(r.n)).map(r => (
              <tr key={r.n} style={r.n === operators ? { background: '#eef4ff' } : undefined}>
                <td>{r.n}{r.n === operators ? ' (current)' : ''}</td>
                <td className="time">{formatTime(r.makespan)}</td>
                <td>{r.units}</td>
                <td>{Math.round(r.util * 100)}%</td>
                <td>{r.units >= target ? <span className="badge ok">hits {target}</span> : <span className="badge review">short</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 12 }}>One unit at a time with the whole crew. More operators help until the work runs out of parallel branches — then extra hands only help on steps you mark helpable below.</p>
      </div>

      {detail && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Which steps can a helper speed up?</h2>
          <p className="muted">Mark a step helpable and set how long it takes with a 2nd person. A green dot means the simulation actually sent a helper there.</p>
          <table className="data">
            <thead><tr><th>#</th><th>Step</th><th>Solo time</th><th>Helpable?</th><th>With a helper</th><th></th></tr></thead>
            <tbody>
              {detail.steps.map(s => {
                const solo = (activeSize && s.size_times && s.size_times[activeSize] != null) ? s.size_times[activeSize] : (s.effective_seconds || 0);
                return (
                  <tr key={s.id}>
                    <td>{s.sequence}{helpedInSim.has(s.id) && <span title="helper sent here in the current sim" style={{ color: '#1c7c3c' }}> ●</span>}</td>
                    <td>{(s.tag_id ? s.tag_name : s.name) || ''}</td>
                    <td className="time">{formatTime(solo)}</td>
                    <td><input type="checkbox" style={{ width: 'auto' }} checked={!!s.helpable} onChange={e => setHelpable(s, e.target.checked)} /></td>
                    <td>
                      {s.helpable ? (
                        <input style={{ width: 90 }} defaultValue={s.help_seconds ? formatTime(s.help_seconds) : ''}
                          placeholder={solo ? `< ${formatTime(solo)}` : 'm:ss'}
                          onBlur={e => { if (e.target.value.trim()) setHelpTime(s, e.target.value.trim()); }} />
                      ) : <span className="muted">—</span>}
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {s.helpable && s.help_seconds ? `~${Math.round((1 - s.help_seconds / (solo || 1)) * 100)}% faster with 2` : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
