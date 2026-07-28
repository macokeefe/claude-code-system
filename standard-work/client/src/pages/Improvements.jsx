import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { api, formatTime, formatLong } from '@backend';

// Reduced time for one step under a set of active targets.
function reducedSeconds(step, tagTargets, stepTargets) {
  let secs = step.effective_seconds || 0;
  const apply = (t, perUnit) => {
    if (t.mode === 'percent') secs = Math.round(secs * (1 - t.value / 100));
    else secs = Math.max(0, Math.round(secs - t.value * (perUnit ? (step.quantity || 1) : 1)));
  };
  if (step.tag_id && tagTargets.has(step.tag_id)) {
    for (const t of tagTargets.get(step.tag_id)) apply(t, step.tag_unit_seconds != null);
  }
  if (stepTargets.has(step.id)) {
    for (const t of stepTargets.get(step.id)) apply(t, false);
  }
  return Math.max(0, secs);
}

function TargetAdder({ solution, tags, skus, details, onAdded }) {
  const [kind, setKind] = useState('tag');
  const [tagId, setTagId] = useState('');
  const [skuId, setSkuId] = useState('');
  const [stepId, setStepId] = useState('');
  const [mode, setMode] = useState('percent');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const steps = skuId && details[skuId] ? details[skuId].steps : [];

  async function add() {
    setError('');
    try {
      const target_id = kind === 'tag' ? Number(tagId) : Number(stepId);
      if (!target_id) return setError('Pick a target first');
      await api.post(`/api/solutions/${solution.id}/targets`, {
        target_type: kind === 'tag' ? 'tag' : 'sku_step',
        target_id, mode,
        value: mode === 'seconds' ? parseTimeToSeconds(value) : Number(value),
      });
      setValue('');
      onAdded();
    } catch (e) { setError(e.message); }
  }

  function parseTimeToSeconds(v) {
    const m = String(v).trim().match(/^(\d+):(\d{2})$/);
    if (m) return +m[1] * 60 + +m[2];
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN; // bare number = seconds saved
  }

  return (
    <div className="target-adder">
      {error && <div className="inline-error">{error}</div>}
      <div className="toolbar" style={{ gap: 6, marginBottom: 0 }}>
        <select style={{ width: 130 }} value={kind} onChange={e => setKind(e.target.value)}>
          <option value="tag">Shared step</option>
          <option value="step">One SKU's step</option>
        </select>
        {kind === 'tag' ? (
          <select style={{ flex: 1, minWidth: 180 }} value={tagId} onChange={e => setTagId(e.target.value)}>
            <option value="">— pick a shared step —</option>
            {tags.map(t => <option key={t.id} value={t.id}>{t.name}{t.unit_seconds != null ? ` (${formatTime(t.unit_seconds)}/${t.unit_label || 'unit'})` : ` (${formatTime(t.canonical_time_seconds)})`}</option>)}
          </select>
        ) : (
          <>
            <select style={{ width: 170 }} value={skuId} onChange={e => { setSkuId(e.target.value); setStepId(''); }}>
              <option value="">— SKU —</option>
              {skus.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select style={{ flex: 1, minWidth: 160 }} value={stepId} onChange={e => setStepId(e.target.value)}>
              <option value="">— step —</option>
              {steps.map(s => <option key={s.id} value={s.id}>{s.sequence}. {(s.tag_id ? s.tag_name : s.name) || ''}</option>)}
            </select>
          </>
        )}
        <select style={{ width: 120 }} value={mode} onChange={e => setMode(e.target.value)}>
          <option value="percent">% faster</option>
          <option value="seconds">time saved</option>
        </select>
        <input style={{ width: 90 }} placeholder={mode === 'percent' ? 'e.g. 20' : 'e.g. 1:30'}
          value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
        <button className="small primary" onClick={add}>Add</button>
      </div>
      <p className="muted" style={{ fontSize: 11, margin: '4px 0 0' }}>
        Shared-step savings apply on every SKU using it. For per-unit shared steps (e.g. per connector), "time saved" means per unit.
      </p>
    </div>
  );
}

export default function Improvements() {
  const [solutions, setSolutions] = useState([]);
  const [tags, setTags] = useState([]);
  const [skus, setSkus] = useState([]);
  const [details, setDetails] = useState({});
  const [active, setActive] = useState(new Set()); // solution ids in the what-if
  const [form, setForm] = useState({ name: '', description: '' });
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(() => {
    api.get('/api/solutions').then(setSolutions);
    api.get('/api/tags').then(setTags);
    api.get('/api/skus').then(list => {
      setSkus(list);
      list.forEach(s => api.get(`/api/skus/${s.id}`).then(d => setDetails(prev => ({ ...prev, [s.id]: d }))));
    });
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const sol = await api.post('/api/solutions', form);
    setForm({ name: '', description: '' });
    setExpanded(sol.id);
    setActive(a => new Set([...a, sol.id]));
    load();
  }

  async function applySolution(sol) {
    const lines = sol.targets.map(t => `• ${t.label}: ${t.mode === 'percent' ? t.value + '% faster' : formatTime(t.value) + ' saved' + (t.is_unit ? ' per unit' : '')}`).join('\n');
    if (!window.confirm(`Install "${sol.name}"?\n\nThis permanently updates the real step times:\n${lines}\n\nEvery change is recorded in history with the solution's name.`)) return;
    await api.post(`/api/solutions/${sol.id}/apply`);
    load();
  }

  // ---- What-if math across all SKUs ----
  const impact = useMemo(() => {
    const activeSols = solutions.filter(s => active.has(s.id) && s.status !== 'installed');
    const tagTargets = new Map(), stepTargets = new Map();
    for (const sol of activeSols) for (const t of sol.targets) {
      const map = t.target_type === 'tag' ? tagTargets : stepTargets;
      if (!map.has(t.target_id)) map.set(t.target_id, []);
      map.get(t.target_id).push(t);
    }
    const rows = [];
    for (const sku of skus) {
      const d = details[sku.id];
      if (!d) continue;
      const before = d.steps.reduce((a, s) => a + (s.effective_seconds || 0), 0);
      const after = d.steps.reduce((a, s) => a + reducedSeconds(s, tagTargets, stepTargets), 0);
      rows.push({ sku, before, after, saved: before - after });
    }
    return { rows, anyActive: activeSols.length > 0, totalSaved: rows.reduce((a, r) => a + r.saved, 0) };
  }, [solutions, active, skus, details]);

  const chartData = impact.rows.map(r => ({
    name: r.sku.name.length > 24 ? r.sku.name.slice(0, 24) + '…' : r.sku.name,
    current: +(r.before / 60).toFixed(1),
    'with solutions': +(r.after / 60).toFixed(1),
  }));

  return (
    <>
      <h1>Improvements</h1>
      <p className="subtitle">Log a solution, mark which steps it speeds up, and preview the whole process with it installed — before changing any real numbers.</p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>New solution</h2>
        <form onSubmit={create} className="toolbar" style={{ marginBottom: 0 }}>
          <input style={{ width: 240 }} placeholder="Name (e.g. Second rivnut fixture)" value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })} />
          <input style={{ flex: 1 }} placeholder="Description (optional)" value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })} />
          <button className="primary" type="submit">Create</button>
        </form>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Solutions <span className="muted" style={{ fontWeight: 400 }}>— check the ones to include in the what-if</span></h2>
        {solutions.length === 0 && <div className="empty">No solutions yet — log your first improvement idea above.</div>}
        {solutions.map(sol => (
          <div key={sol.id} className="solution-row">
            <div className="toolbar" style={{ marginBottom: 0 }}>
              {sol.status !== 'installed' ? (
                <input type="checkbox" style={{ width: 'auto' }} checked={active.has(sol.id)}
                  onChange={e => setActive(a => { const n = new Set(a); e.target.checked ? n.add(sol.id) : n.delete(sol.id); return n; })} />
              ) : <span className="badge ok">installed</span>}
              <strong>{sol.name}</strong>
              {sol.description && <span className="muted">— {sol.description}</span>}
              <span className="muted" style={{ fontSize: 12 }}>{sol.targets.length} step(s) affected</span>
              <div className="spacer" />
              <button className="ghost small" onClick={() => setExpanded(expanded === sol.id ? null : sol.id)}>
                {expanded === sol.id ? 'close' : 'edit steps'}
              </button>
              {sol.status !== 'installed' && sol.targets.length > 0 &&
                <button className="small" onClick={() => applySolution(sol)}>mark installed</button>}
              <button className="ghost small" onClick={async () => {
                if (window.confirm(`Delete solution "${sol.name}"?`)) { await api.del(`/api/solutions/${sol.id}`); load(); }
              }}>delete</button>
            </div>
            {expanded === sol.id && (
              <div style={{ margin: '8px 0 4px 26px' }}>
                {sol.targets.map(t => (
                  <div key={t.id} style={{ fontSize: 13, marginBottom: 2 }}>
                    <span className="badge tag">{t.target_type === 'tag' ? 'shared' : 'step'}</span>{' '}
                    {t.label} — <strong>{t.mode === 'percent' ? `${t.value}% faster` : `${formatTime(t.value)} saved${t.is_unit ? '/unit' : ''}`}</strong>{' '}
                    {sol.status !== 'installed' &&
                      <button className="ghost small" onClick={async () => { await api.del(`/api/solutions/${sol.id}/targets/${t.id}`); load(); }}>✕</button>}
                  </div>
                ))}
                {sol.status !== 'installed' &&
                  <TargetAdder solution={sol} tags={tags} skus={skus} details={details} onAdded={load} />}
              </div>
            )}
          </div>
        ))}
      </div>

      {impact.anyActive && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>What-if impact</h2>
          <div className="row" style={{ gap: 14, marginBottom: 14 }}>
            <div className="stat" style={{ borderLeftColor: '#1c7c3c' }}>
              <div className="stat-value">{formatLong(impact.totalSaved)}</div>
              <div className="stat-label">Saved per one of each SKU</div>
            </div>
          </div>
          <table className="data" style={{ marginBottom: 16 }}>
            <thead><tr><th>SKU</th><th>Current</th><th>With solutions</th><th>Saved</th></tr></thead>
            <tbody>
              {impact.rows.map(r => (
                <tr key={r.sku.id}>
                  <td>{r.sku.name}</td>
                  <td className="time">{formatTime(r.before)}</td>
                  <td className="time" style={{ color: r.saved > 0 ? 'var(--ok)' : undefined }}>{formatTime(r.after)}</td>
                  <td className="time">{r.saved > 0 ? `−${formatTime(r.saved)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 60 }}>
              <XAxis dataKey="name" interval={0} angle={-25} textAnchor="end" height={70} tick={{ fontSize: 11 }} />
              <YAxis unit=" min" />
              <Tooltip formatter={v => [`${v} min`]} />
              <Legend />
              <Bar dataKey="current" fill="#9aa4b2" radius={[4, 4, 0, 0]} maxBarSize={48} />
              <Bar dataKey="with solutions" fill="#1c7c3c" radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
          <p className="muted" style={{ fontSize: 12 }}>Preview only — real times don't change until you "mark installed" on a solution. Installed solutions write their reductions into the data with a history note.</p>
        </div>
      )}
    </>
  );
}
