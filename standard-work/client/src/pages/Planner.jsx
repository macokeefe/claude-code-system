import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { api, formatTime, formatLong } from '@backend';
import { planDay } from '../../../shared/planner.js';

function Stat({ label, value, sub, tone }) {
  return (
    <div className="stat" style={tone ? { borderLeftColor: tone } : undefined}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="muted" style={{ fontSize: 12 }}>{sub}</div>}
    </div>
  );
}

function OperatorManager({ operators, reload }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  async function add() {
    if (!name.trim()) return;
    await api.post('/api/operators', { name });
    setName('');
    reload();
  }
  async function toggle(op) { await api.put(`/api/operators/${op.id}`, { active: !op.active }); reload(); }
  async function rename(op) {
    const n = window.prompt('Operator name', op.name);
    if (n && n.trim()) { await api.put(`/api/operators/${op.id}`, { name: n.trim() }); reload(); }
  }
  async function remove(op) {
    if (window.confirm(`Remove ${op.name}?`)) { await api.del(`/api/operators/${op.id}`); reload(); }
  }

  const activeCount = operators.filter(o => o.active).length;
  return (
    <div className="card">
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Operators <span className="muted" style={{ fontWeight: 400 }}>— {activeCount} active</span></h2>
        <div className="spacer" />
        <button className="small" onClick={() => setOpen(o => !o)}>{open ? 'Done' : 'Manage'}</button>
      </div>
      {open && (
        <>
          <table className="data">
            <thead><tr><th>Name</th><th>Skills (optional)</th><th>Active</th><th></th></tr></thead>
            <tbody>
              {operators.map(op => (
                <tr key={op.id}>
                  <td>{op.name}</td>
                  <td className="muted">{op.skills || 'flexible (all tasks)'}</td>
                  <td><input type="checkbox" style={{ width: 'auto' }} checked={!!op.active} onChange={() => toggle(op)} /></td>
                  <td>
                    <button className="ghost small" onClick={() => rename(op)}>rename</button>
                    <button className="ghost small" onClick={() => remove(op)}>delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="toolbar" style={{ marginTop: 10 }}>
            <input style={{ maxWidth: 240 }} placeholder="New operator name" value={name}
              onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
            <button className="small primary" onClick={add}>+ Add operator</button>
          </div>
          <p className="muted" style={{ fontSize: 12 }}>Everyone is treated as flexible (can do any task). Skills are recorded for later, when the optimizer can honor them.</p>
        </>
      )}
    </div>
  );
}

export default function Planner() {
  const [operators, setOperators] = useState([]);
  const [skus, setSkus] = useState([]);
  const [detail, setDetail] = useState({}); // sku_id -> full detail with steps
  const [orders, setOrders] = useState([]); // [{sku_id, qty}]
  const [shiftHours, setShiftHours] = useState(8);
  const [opOverride, setOpOverride] = useState(null); // null = use active count
  const [mode, setMode] = useState('unit'); // detailed view: unit (cells) | split (stations)

  const loadOps = () => api.get('/api/operators').then(setOperators);
  useEffect(() => {
    loadOps();
    api.get('/api/skus').then(setSkus);
  }, []);

  // Fetch full step detail for every SKU that appears in the order list (needed for split mode).
  useEffect(() => {
    const needed = orders.map(o => o.sku_id).filter(id => id && !detail[id]);
    needed.forEach(id => api.get(`/api/skus/${id}`).then(d => setDetail(prev => ({ ...prev, [id]: d }))));
  }, [orders]); // eslint-disable-line

  const activeCount = operators.filter(o => o.active).length;
  const operatorCount = opOverride ?? activeCount;
  const shiftSeconds = Math.round(shiftHours * 3600);

  const skuMap = useMemo(() => {
    const m = new Map();
    for (const s of skus) {
      const d = detail[s.id];
      m.set(s.id, { id: s.id, name: s.name, total_seconds: s.total_seconds, steps: d ? d.steps : [] });
    }
    return m;
  }, [skus, detail]);

  const ready = orders.length > 0 && orders.every(o => o.sku_id) && operatorCount > 0;
  const unitPlan = ready ? planDay(orders, skuMap, operatorCount, shiftSeconds, 'unit') : null;
  const splitPlan = ready ? planDay(orders, skuMap, operatorCount, shiftSeconds, 'split') : null;
  const shown = mode === 'split' ? splitPlan : unitPlan;

  function addOrder() {
    const firstUnused = skus.find(s => !orders.some(o => o.sku_id === s.id)) || skus[0];
    setOrders([...orders, { sku_id: firstUnused ? firstUnused.id : null, qty: 1 }]);
  }
  const setOrder = (i, patch) => setOrders(orders.map((o, j) => j === i ? { ...o, ...patch } : o));
  const removeOrder = i => setOrders(orders.filter((_, j) => j !== i));

  const barData = shown
    ? shown.bins.map(b => ({
        name: operators.filter(o => o.active)[b.operator]?.name || `Op ${b.operator + 1}`,
        minutes: +(b.load / 60).toFixed(1),
        idle: +((shown.makespan - b.load) / 60).toFixed(1),
      }))
    : [];

  return (
    <>
      <h1>Day Planner</h1>
      <p className="subtitle">Build today's order list, then see how to split the work across your operators — and the idle time (waste) each way of organizing implies.</p>

      <OperatorManager operators={operators} reload={loadOps} />

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Today's orders</h2>
        {skus.length === 0 ? (
          <div className="empty">No SKUs yet — add some on the SKUs page first.</div>
        ) : (
          <>
            <table className="data">
              <thead><tr><th>Product (SKU)</th><th>Qty</th><th>Labor each</th><th>Subtotal</th><th></th></tr></thead>
              <tbody>
                {orders.map((o, i) => {
                  const sku = skus.find(s => s.id === o.sku_id);
                  const each = sku ? sku.total_seconds : 0;
                  return (
                    <tr key={i}>
                      <td>
                        <select value={o.sku_id || ''} onChange={e => setOrder(i, { sku_id: Number(e.target.value) })}>
                          {skus.map(s => <option key={s.id} value={s.id}>{s.name} ({s.sku_number})</option>)}
                        </select>
                      </td>
                      <td><input type="number" min="0" style={{ width: 70 }} value={o.qty}
                        onChange={e => setOrder(i, { qty: e.target.value })} /></td>
                      <td className="time">{formatTime(each)}</td>
                      <td className="time">{formatLong(each * Math.max(0, Math.round(o.qty || 0)))}</td>
                      <td><button className="ghost small" onClick={() => removeOrder(i)}>remove</button></td>
                    </tr>
                  );
                })}
                {orders.length === 0 && <tr><td colSpan={5} className="empty">No orders yet — add a line below.</td></tr>}
              </tbody>
            </table>
            <div className="toolbar" style={{ marginTop: 10 }}>
              <button className="small primary" onClick={addOrder}>+ Add order line</button>
              <div className="spacer" />
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', textTransform: 'none', fontWeight: 400 }}>
                Operators: <input type="number" min="1" style={{ width: 64 }} value={operatorCount}
                  onChange={e => setOpOverride(Math.max(1, Number(e.target.value)))} />
                {opOverride !== null && opOverride !== activeCount &&
                  <button className="ghost small" onClick={() => setOpOverride(null)}>reset to {activeCount}</button>}
              </label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', textTransform: 'none', fontWeight: 400 }}>
                Shift hours: <input type="number" min="0.5" step="0.5" style={{ width: 64 }} value={shiftHours}
                  onChange={e => setShiftHours(Math.max(0.5, Number(e.target.value)))} />
              </label>
            </div>
          </>
        )}
      </div>

      {ready && (
        <>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Cells vs. stations — which organization wastes less?</h2>
            <p className="muted">Same work, same people. The difference is whether each operator builds whole units or the work is split into shared tasks.</p>
            <div className="compare">
              <div className={`compare-col ${unitPlan.idle <= splitPlan.idle ? 'win' : ''}`} onClick={() => setMode('unit')} role="button">
                <h3>Cells — one builder per unit</h3>
                <div className="big-time">{formatLong(unitPlan.idle)} idle</div>
                <div className="muted">{Math.round(unitPlan.utilization * 100)}% utilization · finishes in {formatLong(unitPlan.makespan)}</div>
                {!unitPlan.fits && <div className="badge review" style={{ marginTop: 6 }}>over shift by {formatLong(-unitPlan.slackSeconds)}</div>}
              </div>
              <div className={`compare-col ${splitPlan.idle < unitPlan.idle ? 'win' : ''}`} onClick={() => setMode('split')} role="button">
                <h3>Stations — work split across people</h3>
                <div className="big-time">{formatLong(splitPlan.idle)} idle</div>
                <div className="muted">{Math.round(splitPlan.utilization * 100)}% utilization · finishes in {formatLong(splitPlan.makespan)}</div>
                {!splitPlan.fits && <div className="badge review" style={{ marginTop: 6 }}>over shift by {formatLong(-splitPlan.slackSeconds)}</div>}
              </div>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
              Splitting work almost always balances better, but it ignores build order for now (a later step adds precedence so the split stays physically valid). Click a card to see its per-operator breakdown.
            </p>
          </div>

          <div className="card">
            <div className="toolbar">
              <h2 style={{ margin: 0 }}>Per-operator load — {mode === 'split' ? 'stations (split work)' : 'cells (whole units)'}</h2>
              <div className="spacer" />
              <button className={mode === 'unit' ? 'small primary' : 'small'} onClick={() => setMode('unit')}>Cells</button>
              <button className={mode === 'split' ? 'small primary' : 'small'} onClick={() => setMode('split')}>Stations</button>
            </div>
            <div className="row" style={{ gap: 12, margin: '4px 0 16px' }}>
              <Stat label="Total labor today" value={formatLong(shown.totalWork)} />
              <Stat label="Day finishes in" value={formatLong(shown.makespan)} sub={`shift is ${shiftHours}h`} tone={shown.fits ? '#1c7c3c' : '#b3261e'} />
              <Stat label="Idle / waste" value={formatLong(shown.idle)} tone="#e0913d" />
              <Stat label="Utilization" value={`${Math.round(shown.utilization * 100)}%`} />
              <Stat label="Takt" value={shown.taktSeconds ? formatTime(Math.round(shown.taktSeconds)) : '—'} sub={`${shown.totalUnits} units / shift`} />
            </div>
            <ResponsiveContainer width="100%" height={Math.max(140, barData.length * 42)}>
              <BarChart data={barData} layout="vertical" margin={{ left: 20, right: 40 }}>
                <XAxis type="number" unit=" min" />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v, n) => [`${v} min`, n === 'idle' ? 'Idle' : 'Working']} />
                <ReferenceLine x={+(shiftSeconds / 60).toFixed(1)} stroke="#b3261e" strokeDasharray="4 3" label={{ value: 'shift', fontSize: 11, fill: '#b3261e' }} />
                <Bar dataKey="minutes" stackId="a" radius={[0, 0, 0, 0]}>
                  {barData.map((d, i) => <Cell key={i} fill={d.minutes >= (shown.makespan / 60) - 0.05 ? '#b3261e' : '#1a56b0'} />)}
                </Bar>
                <Bar dataKey="idle" stackId="a" fill="#e7e3da" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <p className="muted" style={{ fontSize: 12 }}>Blue = working, grey = idle (waiting for the slowest operator to finish). Red bar = the bottleneck operator. Dashed line = end of shift.</p>
          </div>
        </>
      )}
    </>
  );
}
