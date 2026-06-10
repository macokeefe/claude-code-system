import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { api, formatTime, formatLong } from '../api.js';

export default function Dashboard() {
  const [skus, setSkus] = useState([]);
  const [tagImpact, setTagImpact] = useState([]);
  const [family, setFamily] = useState('');

  useEffect(() => {
    api.get('/api/skus').then(setSkus);
    api.get('/api/stats/tag-impact').then(setTagImpact);
  }, []);

  const families = [...new Set(skus.map(s => s.family).filter(Boolean))];
  const filtered = family ? skus.filter(s => s.family === family) : skus;
  const skuData = filtered
    .map(s => ({ name: s.name, minutes: +(s.total_seconds / 60).toFixed(1), seconds: s.total_seconds }))
    .sort((a, b) => b.seconds - a.seconds);
  const impactData = tagImpact
    .filter(t => t.aggregate_seconds > 0)
    .map(t => ({ name: t.name, minutes: +(t.aggregate_seconds / 60).toFixed(1), usage: t.usage_count }));

  return (
    <>
      <h1>Dashboard</h1>
      <p className="subtitle">Labor time across SKUs and the shared steps with the biggest improvement potential.</p>

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
