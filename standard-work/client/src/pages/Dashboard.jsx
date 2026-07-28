import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { api, formatTime, formatLong } from '@backend';
import { criticalPath } from '../../../shared/precedence.js';
import { simulateBuild } from '../../../shared/simulate.js';
import { sizeLabel } from '../sizeLabel.js';

// The staffing standard: a line normally runs with this many people.
const STANDARD_CREW = 8;

export default function Dashboard() {
  const [skus, setSkus] = useState([]);
  const [tagImpact, setTagImpact] = useState([]);
  const [family, setFamily] = useState('');
  const [pickFamily, setPickFamily] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedSize, setSelectedSize] = useState(null);
  const [detail, setDetail] = useState(null);
  const [crewTimes, setCrewTimes] = useState({}); // skuId -> build time (s) with STANDARD_CREW

  const famOf = s => s.family || 'Other';
  // Configuration label = product name with the family prefix stripped
  // ("Sola Lounge Right Arm" → "Right Arm").
  const configLabel = s => {
    const fam = s.family || '';
    const stripped = s.name.replace(fam, '').trim();
    return stripped || s.name;
  };

  useEffect(() => {
    api.get('/api/skus').then(setSkus);
    api.get('/api/stats/tag-impact').then(setTagImpact);
  }, []);

  // Default the family once products load.
  useEffect(() => {
    if (skus.length && pickFamily == null) setPickFamily(famOf(skus[0]));
  }, [skus]); // eslint-disable-line

  // Build time with the standard crew of 8 — how long ONE unit really takes when
  // 8 people work it in parallel (vs. the raw sum of every hands-on second).
  useEffect(() => {
    if (!skus.length) return;
    let cancelled = false;
    Promise.all(skus.map(s => api.get(`/api/skus/${s.id}`).catch(() => null))).then(details => {
      if (cancelled) return;
      const out = {};
      for (const d of details) {
        if (!d || !d.steps || !d.steps.length) continue;
        const steps = d.steps.map(s => ({
          id: s.id,
          depends_on: s.depends_on || [],
          effective_seconds: s.effective_seconds || 0,
          helpable: !!s.helpable,
          help_seconds: s.help_seconds || 0,
        }));
        const sim = simulateBuild(steps, STANDARD_CREW, { helping: true });
        out[d.id] = (sim && sim.makespan) || 0;
      }
      setCrewTimes(out);
    });
    return () => { cancelled = true; };
  }, [skus]);

  // When the family changes (or products load), pick the first configuration in it.
  useEffect(() => {
    if (!pickFamily) return;
    const inFam = skus.filter(s => famOf(s) === pickFamily);
    if (inFam.length && !inFam.some(s => s.id === selectedId)) setSelectedId(inFam[0].id);
  }, [pickFamily, skus]); // eslint-disable-line

  // Load the selected SKU's full step detail for the per-step breakdown.
  useEffect(() => {
    if (selectedId == null) return;
    setDetail(null);
    setSelectedSize(null);
    api.get(`/api/skus/${selectedId}`).then(setDetail);
  }, [selectedId]);

  const pickFamilies = [...new Set(skus.map(famOf))];
  const configs = skus.filter(s => famOf(s) === pickFamily);
  const families = [...new Set(skus.map(s => s.family).filter(Boolean))];
  const filtered = family ? skus.filter(s => s.family === family) : skus;
  const skuData = filtered
    .map(s => ({
      name: s.name,
      minutes: +(s.total_seconds / 60).toFixed(1),
      crew: crewTimes[s.id] != null ? +(crewTimes[s.id] / 60).toFixed(1) : null,
      seconds: s.total_seconds,
    }))
    .sort((a, b) => b.seconds - a.seconds);
  const impactData = tagImpact
    .filter(t => t.aggregate_seconds > 0)
    .map(t => ({ name: t.name, minutes: +(t.aggregate_seconds / 60).toFixed(1), usage: t.usage_count }));

  // Sizes that affect this product's step times (union across its steps).
  const sizes = useMemo(() => {
    if (!detail) return [];
    const out = [];
    for (const s of detail.steps) {
      if (s.size_times) for (const k of Object.keys(s.size_times)) if (!out.includes(k)) out.push(k);
    }
    return out;
  }, [detail]);

  // No "standard" sofa — a size is always active (default: middle bucket).
  const activeSize = selectedSize ?? (sizes.length ? sizes[Math.floor((sizes.length - 1) / 2)] : null);

  // A step's time for the chosen size (size-variant steps switch; others fixed).
  const effFor = s =>
    (activeSize && s.size_times && s.size_times[activeSize] != null)
      ? s.size_times[activeSize] : (s.effective_seconds || 0);

  const stepData = useMemo(() => {
    if (!detail) return [];
    const vals = detail.steps.map(effFor);
    const max = Math.max(...vals, 1);
    return detail.steps.map((s, i) => ({
      name: `${s.sequence}. ${(s.tag_id ? s.tag_name : s.name) || ''}`,
      minutes: +(vals[i] / 60).toFixed(1),
      seconds: vals[i],
      shared: !!s.tag_id,
      sized: !!s.size_times,
      isMax: vals[i] === max,
    }));
  }, [detail, selectedSize]); // eslint-disable-line

  const shownTotal = detail ? detail.steps.reduce((a, s) => a + effFor(s), 0) : 0;
  // Build time = critical path (the fastest a crew can finish ONE unit with
  // work in parallel) — not the sum of all hands-on labor.
  const buildTime = useMemo(() => detail ? criticalPath(detail.steps.map(s => ({
    id: s.id, depends_on: s.depends_on || [], dep_overlap: s.dep_overlap || null, dep_need_at: s.dep_need_at || null, effective_seconds: effFor(s),
  }))).criticalSeconds : 0, [detail, selectedSize]); // eslint-disable-line

  // Realistic build time for the selected product with the standard crew of 8.
  const buildTime8 = useMemo(() => {
    if (!detail || !detail.steps.length) return 0;
    const steps = detail.steps.map(s => ({
      id: s.id, depends_on: s.depends_on || [], effective_seconds: effFor(s),
      helpable: !!s.helpable, help_seconds: s.help_seconds || 0,
    }));
    const sim = simulateBuild(steps, STANDARD_CREW, { helping: true });
    return (sim && sim.makespan) || 0;
  }, [detail, selectedSize]); // eslint-disable-line

  return (
    <>
      <h1>Dashboard</h1>
      <p className="subtitle">Labor time across SKUs and the shared steps with the biggest improvement potential.</p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Step times for a product <span className="muted" style={{ fontWeight: 400 }}>(red = longest step / bottleneck)</span></h2>
        {skus.length > 0 && (
          <>
            <div className="picker-row">
              <span className="picker-label">Family</span>
              {pickFamilies.map(f => (
                <button key={f} className={`chip ${f === pickFamily ? 'active' : ''}`} onClick={() => setPickFamily(f)}>{f}</button>
              ))}
            </div>
            <div className="picker-row">
              <span className="picker-label">Configuration</span>
              {configs.map(s => (
                <button key={s.id} className={`chip ${s.id === selectedId ? 'active' : ''}`} onClick={() => setSelectedId(s.id)}>{configLabel(s)}</button>
              ))}
            </div>
            {sizes.length > 0 && (
              <div className="picker-row">
                <span className="picker-label">Size</span>
                {sizes.map(sz => (
                  <button key={sz} className={`chip ${sz === activeSize ? 'active' : ''}`} onClick={() => setSelectedSize(sz)}>{sizeLabel(sz)}</button>
                ))}
                <span className="muted" style={{ fontSize: 12 }}>affects {detail ? detail.steps.filter(s => s.size_times).length : 0} step(s)</span>
              </div>
            )}
          </>
        )}
        {!detail ? (
          <div className="empty">{skus.length ? 'Loading…' : 'No products yet — create one or import a spreadsheet.'}</div>
        ) : detail.steps.length === 0 ? (
          <div className="empty">This product has no steps yet.</div>
        ) : (
          <>
            <div className="muted" style={{ marginBottom: 8 }}>
              {detail.steps.length} steps · <strong>with {STANDARD_CREW} people</strong> <strong className="time" style={{ color: '#1c7c3c' }}>{formatTime(buildTime8)}</strong>
              {' · '}ideal build time (unlimited crew) <span className="time">{formatTime(buildTime)}</span>
              {' · '}total hands-on labor <span className="time">{formatTime(shownTotal)}</span>
              {activeSize ? <> · size <strong>{sizeLabel(activeSize)}</strong></> : null} ·{' '}
              <Link to={`/skus/${detail.id}`}>open / edit</Link>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: -2, marginBottom: 10 }}>
              <strong>With {STANDARD_CREW} people</strong> is how long one piece really takes on the floor with the standard crew (green). Ideal build time is the theoretical floor if you had unlimited people (the critical path). Total hands-on labor is every step added up (person-time) — much bigger, because several people work at once.
            </p>
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
          <h2 style={{ margin: 0 }}>Total labor vs. build time with {STANDARD_CREW} people</h2>
          <div className="spacer" />
          {families.length > 0 && (
            <select style={{ width: 220 }} value={family} onChange={e => setFamily(e.target.value)}>
              <option value="">All families</option>
              {families.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          )}
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: -2 }}>
          The big bar is <strong>total hands-on labor</strong> — every step added up (person-time). The green bar is how long
          one unit actually takes on the floor with the standard crew of <strong>{STANDARD_CREW}</strong> working in parallel.
          A high labor total doesn't mean a long build: with {STANDARD_CREW} people the unit comes off far sooner.
        </p>
        {skuData.length === 0 ? <div className="empty">No SKUs yet — create one or import a spreadsheet.</div> : (
          <ResponsiveContainer width="100%" height={Math.max(160, skuData.length * 64)}>
            <BarChart data={skuData} layout="vertical" margin={{ left: 40, right: 40 }} barGap={2}>
              <XAxis type="number" unit=" min" />
              <YAxis type="category" dataKey="name" width={220} tick={{ fontSize: 13 }} />
              <Tooltip formatter={(v, n) => [`${v} min`, n === 'crew' ? `Build time · ${STANDARD_CREW} people` : 'Total hands-on labor']} />
              <Legend formatter={n => n === 'crew' ? `Build time · ${STANDARD_CREW} people` : 'Total hands-on labor'} />
              <Bar dataKey="minutes" name="minutes" fill="#c2cfe6" radius={[0, 4, 4, 0]} barSize={18} />
              <Bar dataKey="crew" name="crew" fill="#1c7c3c" radius={[0, 4, 4, 0]} barSize={18} />
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
          <thead><tr><th>SKU</th><th>Name</th><th>Family</th><th>Steps</th><th>Total labor (person-time)</th></tr></thead>
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
