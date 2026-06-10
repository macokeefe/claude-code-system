import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { api, formatTime, formatLong } from '@backend';

export default function Dashboard() {
  const [skus, setSkus] = useState([]);
  const [tagImpact, setTagImpact] = useState([]);
  const [family, setFamily] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    api.get('/api/skus').then(list => {
      setSkus(list);
      if (list.length) setSelectedId(prev => prev ?? list[0].id);
    });
    api.get('/api/stats/tag-impact').then(setTagImpact);
  }, []);

  // Load the selected SKU's full step detail for the per-step breakdown.
  useEffect(() => {
    if (selectedId == null) return;
    setDetail(null);
    api.get(`/api/skus/${selectedId}`).then(setDetail);
  }, [selectedId]);

  const families = [...new Set(skus.map(s => s.family).filter(Boolean))];
  const filtered = family ? skus.filter(s => s.family === family) : skus;
  const skuData = filtered
    .map(s => ({ name: s.name, minutes: +(s.total_seconds / 60).toFixed(1), seconds: s.total_seconds }))
    .sort((a, b) => b.seconds - a.seconds);
  const impactData = tagImpact
    .filter(t => t.aggregate_seconds > 0)
    .map(t => ({ name: t.name, minutes: +(t.aggregate_seconds / 60).toFixed(1), usage: t.usage_count }));

  const stepData = useMemo(() => {
    if (!detail) return [];
    const max = Math.max(...detail.steps.map(s => s.effective_seconds || 0), 1);
    return detail.steps.map(s => ({
      name: `${s.sequence}. ${(s.tag_id ? s.tag_name : s.name) || ''}`,
      minutes: +((s.effective_seconds || 0) / 60).toFixed(1),
      seconds: s.effective_seconds || 0,
      shared: !!s.tag_id,
      isMax: (s.effective_seconds || 0) === max,
    }));
  }, [detail]);

  return (
    <>
      <h1>Dashboard</h1>
      <p className="subtitle">Labor time across SKUs and the shared steps with the biggest improvement potential.</p>

      <div className="card">
        <div className="toolbar">
          <h2 style={{ margin: 0 }}>Step times for a product <span className="muted" style={{ fontWeight: 400 }}>(red = longest step / bottleneck)</span></h2>
          <div className="spacer" />
          <select style={{ width: 280 }} value={selectedId || ''} onChange={e => setSelectedId(Number(e.target.value))}>
            {skus.map(s => <option key={s.id} value={s.id}>{s.name} ({s.sku_number})</option>)}
          </select>
        </div>
        {!detail ? (
          <div className="empty">{skus.length ? 'Loading…' : 'No products yet — create one or import a spreadsheet.'}</div>
        ) : detail.steps.length === 0 ? (
          <div className="empty">This product has no steps yet.</div>
        ) : (
          <>
            <div className="muted" style={{ marginBottom: 8 }}>
              {detail.steps.length} steps · total <strong className="time">{formatTime(detail.total_seconds)}</strong> ({formatLong(detail.total_seconds)}) ·{' '}
              <Link to={`/skus/${detail.id}`}>open / edit</Link>
            </div>
            <ResponsiveContainer width="100%" height={420}>
              <BarChart data={stepData} margin={{ top: 10, right: 20, left: 10, bottom: 130 }}>
                <XAxis type="category" dataKey="name" interval={0} angle={-40} textAnchor="end" height={130} tick={{ fontSize: 11 }} />
                <YAxis type="number" unit=" min" />
                <Tooltip formatter={(v, n, p) => [`${v} min${p.payload.shared ? ' · shared step' : ''}`, 'Time']} />
                <Bar dataKey="minutes" radius={[4, 4, 0, 0]} maxBarSize={56}>
                  {stepData.map((d, i) => <Cell key={i} fill={d.isMax ? '#b3261e' : d.shared ? '#5b8def' : '#1a56b0'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="muted" style={{ fontSize: 12 }}>Dark blue = unique step · light blue = shared step · red = the bottleneck (longest) step.</p>
          </>
        )}
      </div>

      <div className="card">
        <div className="toolbar">
          <h2 style={{ margin: 0 }}>Total labor time by SKU</h2>
          <div className="spacer" />
          {families.length > 0 && (
            <select style={{ width: 220 }} value={family} onChange={e => setFamily(e.target.value)}>
              <option value="">All families</option>
              {families.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          )}
        </div>
        {skuData.length === 0 ? <div className="empty">No SKUs yet — create one or import a spreadsheet.</div> : (
          <ResponsiveContainer width="100%" height={Math.max(120, skuData.length * 56)}>
            <BarChart data={skuData} layout="vertical" margin={{ left: 40, right: 40 }}>
              <XAxis type="number" unit=" min" />
              <YAxis type="category" dataKey="name" width={220} tick={{ fontSize: 13 }} />
              <Tooltip formatter={v => [`${v} min`, 'Total labor']} />
              <Bar dataKey="minutes" fill="#1a56b0" radius={[0, 4, 4, 0]} barSize={26} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Shared step impact (aggregate time across all SKUs)</h2>
        <p className="muted">The shared steps consuming the most total labor — the best targets for improvement work.</p>
        {impactData.length === 0 ? <div className="empty">No shared steps with recorded times yet.</div> : (
          <ResponsiveContainer width="100%" height={Math.max(120, impactData.length * 48)}>
            <BarChart data={impactData} layout="vertical" margin={{ left: 40, right: 40 }}>
              <XAxis type="number" unit=" min" />
              <YAxis type="category" dataKey="name" width={220} tick={{ fontSize: 13 }} />
              <Tooltip formatter={(v, n, p) => [`${v} min across ${p.payload.usage} SKU(s)`, 'Aggregate']} />
              <Bar dataKey="minutes" radius={[0, 4, 4, 0]} barSize={22}>
                {impactData.map((d, i) => <Cell key={i} fill={i === 0 ? '#b3261e' : '#e0913d'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>SKUs</h2>
        <table className="data">
          <thead><tr><th>SKU</th><th>Name</th><th>Family</th><th>Steps</th><th>Total time</th></tr></thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id}>
                <td><Link to={`/skus/${s.id}`}>{s.sku_number}</Link></td>
                <td><Link to={`/skus/${s.id}`}>{s.name}</Link></td>
                <td>{s.family || '—'}</td>
                <td>{s.step_count}</td>
                <td className="time">{formatTime(s.total_seconds)} <span className="muted">({formatLong(s.total_seconds)})</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
