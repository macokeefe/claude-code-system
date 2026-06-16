import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatTime, formatLong } from '@backend';
import { simulateBuild } from '../../../shared/simulate.js';
import { criticalPath } from '../../../shared/precedence.js';
import { sizeLabel } from '../sizeLabel.js';

const CREW = 8; // the staffing standard

// Tasks whose wording signals non-value-added correction / rework.
const REWORK = [
  { re: /(replace|swap).{0,20}screw|wrong screw/i, label: 'wrong-part swap' },
  { re: /enlarge.{0,12}hole|adjust.{0,12}hole|drill.{0,18}hole/i, label: 'hole rework' },
  { re: /re-?orient|flip orientation/i, label: 're-orientation' },
  { re: /placeholder screw/i, label: 'placeholder screws' },
  { re: /paint.{0,18}(exposed|unpainted)|touch up|touch-up/i, label: 'on-line painting' },
  { re: /deburr/i, label: 'deburring' },
];
function reworkHit(s) {
  const text = `${s.name || ''} ${s.tag_name || ''} ${s.description || ''}`;
  for (const r of REWORK) if (r.re.test(text)) return r.label;
  return null;
}

function Stat({ value, label, sub, tone }) {
  return (
    <div className="stat" style={tone ? { borderLeftColor: tone } : undefined}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="muted" style={{ fontSize: 12 }}>{sub}</div>}
    </div>
  );
}

export default function Insights() {
  const [skus, setSkus] = useState([]);
  const [skuId, setSkuId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [size, setSize] = useState(null);

  useEffect(() => { api.get('/api/skus').then(list => { setSkus(list); if (list.length) setSkuId(p => p ?? list[0].id); }); }, []);
  useEffect(() => { if (skuId == null) return; setSize(null); setDetail(null); api.get(`/api/skus/${skuId}`).then(setDetail); }, [skuId]);

  const sizes = detail ? [...new Set(detail.steps.flatMap(s => s.size_times ? Object.keys(s.size_times) : []))] : [];
  const activeSize = size ?? (sizes.length ? sizes[Math.floor((sizes.length - 1) / 2)] : null);
  const effOf = s => (activeSize && s.size_times && s.size_times[activeSize] != null) ? s.size_times[activeSize] : (s.effective_seconds || 0);

  const analysis = useMemo(() => {
    if (!detail || !detail.steps.length) return null;
    const steps = detail.steps.map(s => ({
      id: s.id, name: (s.tag_id ? s.tag_name : s.name) || '', sequence: s.sequence,
      depends_on: s.depends_on || [], dep_overlap: s.dep_overlap || null, dep_need_at: s.dep_need_at || null,
      eff: effOf(s), helpable: !!s.helpable, help_seconds: s.help_seconds || 0, rework: reworkHit(s),
    }));
    const totalLabor = steps.reduce((a, s) => a + s.eff, 0);
    const simSteps = steps.map(s => ({ id: s.id, depends_on: s.depends_on, effective_seconds: s.eff, helpable: s.helpable, help_seconds: s.help_seconds }));
    const build = simulateBuild(simSteps, CREW, { helping: true }).makespan;
    const cpSteps = steps.map(s => ({ id: s.id, depends_on: s.depends_on, effective_seconds: s.eff, dep_overlap: s.dep_overlap, dep_need_at: s.dep_need_at }));
    const cp = criticalPath(cpSteps);
    const baseCP = cp.criticalSeconds;
    const critSet = new Set(cp.criticalStepIds);

    // Bottleneck = biggest step ON the critical path; estimate saving if halved.
    const onPath = steps.filter(s => critSet.has(s.id)).sort((a, b) => b.eff - a.eff);
    const bottleneck = onPath[0] || null;
    let halveSaving = 0;
    if (bottleneck) {
      const halved = cpSteps.map(s => s.id === bottleneck.id ? { ...s, effective_seconds: Math.round(s.eff / 2) } : s);
      halveSaving = Math.max(0, baseCP - criticalPath(halved).criticalSeconds);
    }

    const reworkSteps = steps.filter(s => s.rework);
    const reworkLabor = reworkSteps.reduce((a, s) => a + s.eff, 0);
    const ranked = [...steps].sort((a, b) => b.eff - a.eff);

    return { steps, totalLabor, build, baseCP, critSet, bottleneck, halveSaving, reworkSteps, reworkLabor, ranked };
  }, [detail, activeSize]); // eslint-disable-line

  const a = analysis;
  const maxEff = a ? Math.max(...a.ranked.map(s => s.eff), 1) : 1;
  const unitsPerShift = a && a.build > 0 ? Math.floor((8 * 3600) / a.build) : 0;

  return (
    <>
      <h1>Insights</h1>
      <p className="subtitle">Pick a product. The model reads your recorded times and points to where the time really goes — and where to get it back.</p>

      <div className="card">
        <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
          <div className="field" style={{ minWidth: 240 }}>
            <label>Product</label>
            <select value={skuId || ''} onChange={e => setSkuId(Number(e.target.value))}>
              {skus.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {sizes.length > 0 && (
            <div className="field" style={{ maxWidth: 160 }}>
              <label>Size</label>
              <select value={activeSize || ''} onChange={e => setSize(e.target.value)}>
                {sizes.map(sz => <option key={sz} value={sz}>{sizeLabel(sz)}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {!a ? <div className="card"><div className="empty">{detail ? 'This product has no steps yet.' : 'Loading…'}</div></div> : (
        <>
          {/* HERO — the value in one line */}
          <div className="card">
            <h2 style={{ marginTop: 0 }}>The bottom line for one unit</h2>
            <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
              <Stat value={formatLong(a.build)} label={`Build time with ${CREW} people`} tone="#1c7c3c" sub="one unit, crew in parallel" />
              <Stat value={formatLong(a.totalLabor)} label="Total hands-on labor" tone="#1a56b0" sub="every step added up" />
              <Stat value={unitsPerShift} label="Units / 8h shift" sub={`paced by the slowest station`} />
              {a.bottleneck && <Stat value={formatTime(a.bottleneck.eff)} label="Longest step on the line" tone="#b3261e" sub={a.bottleneck.name} />}
            </div>
            <p className="muted" style={{ fontSize: 13 }}>
              Build time is far below total labor because the crew works in parallel — so the win isn’t “more people,” it’s shortening the longest chain and fixing waste.
            </p>
          </div>

          {/* OPPORTUNITIES — auto-detected */}
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Where to optimize <span className="muted" style={{ fontWeight: 400 }}>— found in your data</span></h2>

            {a.bottleneck && a.halveSaving > 30 && (
              <div className="op" style={{ borderLeft: '4px solid #b3261e', padding: '10px 14px', background: '#fdf4f3', borderRadius: 8, marginBottom: 12 }}>
                <strong>① The bottleneck: {a.bottleneck.name} ({formatTime(a.bottleneck.eff)})</strong>
                <div>It’s the longest step on the critical path. Splitting it across two people (or a fixture) would take roughly
                  {' '}<strong style={{ color: '#1c7c3c' }}>{formatLong(a.halveSaving)}</strong> off the build time of every unit.</div>
              </div>
            )}

            {a.reworkSteps.length > 0 && (
              <div className="op" style={{ borderLeft: '4px solid #e0913d', padding: '10px 14px', background: '#fdf7ef', borderRadius: 8, marginBottom: 12 }}>
                <strong>② Rework / supplier-fixable: {a.reworkSteps.length} step{a.reworkSteps.length > 1 ? 's' : ''}</strong>
                <div>These contain correction tasks (swapping wrong screws, enlarging holes, re-orienting, painting) — work that exists only because parts arrive wrong.
                  Up to <strong style={{ color: '#1c7c3c' }}>{formatLong(a.reworkLabor)}</strong> of labor per unit could move upstream to the supplier.</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {a.reworkSteps.map(s => `${s.name} (${s.rework})`).join(' · ')}
                </div>
              </div>
            )}

            <div className="op" style={{ borderLeft: '4px solid #1a56b0', padding: '10px 14px', background: '#f1f5fc', borderRadius: 8 }}>
              <strong>③ Focus effort on the critical path</strong>
              <div>Only the steps that gate the build matter for speed. The model marks them below — improving anything off the path saves labor cost, not build time.</div>
            </div>
          </div>

          {/* WHERE THE TIME GOES */}
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Every step, biggest first <span className="muted" style={{ fontWeight: 400 }}>(★ = on the critical path)</span></h2>
            <table className="data">
              <thead><tr><th>Step</th><th>Time</th><th>On the line?</th><th>Note</th></tr></thead>
              <tbody>
                {a.ranked.map(s => (
                  <tr key={s.id}>
                    <td>{a.critSet.has(s.id) ? '★ ' : ''}{s.name}</td>
                    <td className="time">{formatTime(s.eff)}</td>
                    <td>{a.critSet.has(s.id) ? <span className="badge review">sets the pace</span> : <span className="badge ok">parallel</span>}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{s.rework ? `rework: ${s.rework}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 12 }}>
              Dig deeper: <Link to="/staffing">try crew sizes</Link> · <Link to="/line">balance the line</Link> · <Link to="/dashboard">full charts</Link>.
            </p>
          </div>
        </>
      )}
    </>
  );
}
