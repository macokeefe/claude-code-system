import { useEffect, useMemo, useRef, useState } from 'react';
import { api, backupData, restoreData, formatLong, formatTime } from '@backend';
import { simulateBuild } from '../../shared/simulate.js';
import { criticalPath } from '../../shared/precedence.js';
import { sizeLabel } from './sizeLabel.js';

const CREW = 8;
const REWORK = [
  { re: /(replace|swap).{0,20}screw|wrong screw/i, label: 'swapping wrong screws' },
  { re: /enlarge.{0,12}hole|adjust.{0,12}hole|drill.{0,18}hole/i, label: 'fixing holes' },
  { re: /re-?orient|flip orientation/i, label: 're-orienting parts' },
  { re: /placeholder screw/i, label: 'placeholder screws' },
  { re: /paint.{0,18}(exposed|unpainted)|touch up|touch-up/i, label: 'painting on the line' },
  { re: /deburr/i, label: 'deburring' },
];
const reworkHit = s => {
  const t = `${s.name || ''} ${s.tag_name || ''} ${s.description || ''}`;
  for (const r of REWORK) if (r.re.test(t)) return r.label;
  return null;
};

const CSS = `
.sw2{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#13212e;background:#eef2f7;min-height:100vh}
.sw2 *{box-sizing:border-box}
.sw2 .bar{position:sticky;top:0;z-index:5;background:#10202e;color:#fff;display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:14px 28px}
.sw2 .bar h1{font-size:19px;margin:0;font-weight:800;letter-spacing:-.2px}
.sw2 .bar .sp{flex:1}
.sw2 select{font-size:15px;padding:8px 10px;border-radius:8px;border:1px solid #2c3e52;background:#fff;color:#13212e}
.sw2 .lnk{color:#bcd0ec;font-size:13px;cursor:pointer;text-decoration:underline;background:none;border:none}
.sw2 .wrap{max-width:920px;margin:0 auto;padding:26px 28px 60px}
.sw2 .head{font-size:27px;line-height:1.3;font-weight:700;margin:6px 0 22px}
.sw2 .head b{color:#1a56b0}
.sw2 .tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:26px}
.sw2 .tile{background:#fff;border-radius:16px;padding:22px;box-shadow:0 1px 4px rgba(0,0,0,.07)}
.sw2 .tile .big{font-size:38px;font-weight:800;letter-spacing:-1px;line-height:1}
.sw2 .tile .lab{color:#5e6e7d;font-size:14px;margin-top:8px}
.sw2 .g{color:#1c7c3c}.sw2 .b{color:#1a56b0}.sw2 .r{color:#b3261e}
.sw2 .card{background:#fff;border-radius:16px;padding:22px 24px;box-shadow:0 1px 4px rgba(0,0,0,.07);margin-bottom:18px}
.sw2 .card h2{font-size:20px;margin:0 0 4px}
.sw2 .card p{font-size:16px;line-height:1.5;margin:6px 0;color:#23323f}
.sw2 .fix{margin-top:10px;background:#eaf7ee;border:1px solid #cdebd6;border-radius:10px;padding:10px 13px;font-size:15px}
.sw2 .fix b{color:#1c7c3c}
.sw2 .warn{margin-top:10px;background:#fdf3e8;border:1px solid #f0dcbf;border-radius:10px;padding:10px 13px;font-size:15px}
.sw2 .warn b{color:#c9791f}
.sw2 .row{display:flex;align-items:center;gap:12px;margin:7px 0}
.sw2 .rl{width:230px;text-align:right;font-size:14px}
.sw2 .rt{flex:1;background:#eef2f7;border-radius:6px;height:24px;overflow:hidden}
.sw2 .rf{height:100%;border-radius:6px;display:flex;align-items:center;justify-content:flex-end;padding-right:8px;color:#fff;font-size:12px;font-weight:700}
.sw2 .tag{width:108px;font-size:12px;color:#5e6e7d}
.sw2 .muted{color:#5e6e7d;font-size:13px}
@media(max-width:680px){.sw2 .tiles{grid-template-columns:1fr}.sw2 .rl{width:130px}}
`;

export default function SimpleHome() {
  const [skus, setSkus] = useState([]);
  const [skuId, setSkuId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [size, setSize] = useState(null);
  const restoreRef = useRef();

  useEffect(() => { api.get('/api/skus').then(list => { setSkus(list); if (list.length) setSkuId(p => p ?? list[0].id); }); }, []);
  useEffect(() => { if (skuId == null) return; setSize(null); setDetail(null); api.get(`/api/skus/${skuId}`).then(setDetail); }, [skuId]);

  const sizes = detail ? [...new Set(detail.steps.flatMap(s => s.size_times ? Object.keys(s.size_times) : []))] : [];
  const activeSize = size ?? (sizes.length ? sizes[Math.floor((sizes.length - 1) / 2)] : null);
  const effOf = s => (activeSize && s.size_times && s.size_times[activeSize] != null) ? s.size_times[activeSize] : (s.effective_seconds || 0);

  const a = useMemo(() => {
    if (!detail || !detail.steps.length) return null;
    const steps = detail.steps.map(s => ({
      id: s.id, name: (s.tag_id ? s.tag_name : s.name) || `Step ${s.sequence}`,
      depends_on: s.depends_on || [], dep_overlap: s.dep_overlap || null, dep_need_at: s.dep_need_at || null,
      eff: effOf(s), helpable: !!s.helpable, help_seconds: s.help_seconds || 0, rework: reworkHit(s),
    })).filter(s => s.eff > 0);
    if (!steps.length) return null;
    const totalLabor = steps.reduce((x, s) => x + s.eff, 0);
    const build = simulateBuild(steps.map(s => ({ id: s.id, depends_on: s.depends_on, effective_seconds: s.eff, helpable: s.helpable, help_seconds: s.help_seconds })), CREW, { helping: true }).makespan;
    const cpSteps = steps.map(s => ({ id: s.id, depends_on: s.depends_on, effective_seconds: s.eff, dep_overlap: s.dep_overlap, dep_need_at: s.dep_need_at }));
    const cp = criticalPath(cpSteps); const critSet = new Set(cp.criticalStepIds);
    const onPath = steps.filter(s => critSet.has(s.id)).sort((x, y) => y.eff - x.eff);
    const bottleneck = onPath[0] || null;
    let saving = 0;
    if (bottleneck) {
      const halved = cpSteps.map(s => s.id === bottleneck.id ? { ...s, effective_seconds: Math.round(s.eff / 2) } : s);
      saving = Math.max(0, cp.criticalSeconds - criticalPath(halved).criticalSeconds);
    }
    const reworkSteps = steps.filter(s => s.rework);
    const reworkLabor = reworkSteps.reduce((x, s) => x + s.eff, 0);
    const ranked = [...steps].sort((x, y) => y.eff - x.eff);
    return { steps, totalLabor, build, critSet, bottleneck, saving, reworkSteps, reworkLabor, ranked };
  }, [detail, activeSize]); // eslint-disable-line

  const sku = skus.find(s => s.id === skuId);
  const maxEff = a ? Math.max(...a.ranked.map(s => s.eff), 1) : 1;
  const perShift = a && a.build > 0 ? Math.floor((8 * 3600) / a.build) : 0;

  return (
    <div className="sw2">
      <style>{CSS}</style>
      <div className="bar">
        <h1>Standard Work — Simplified</h1>
        <select value={skuId || ''} onChange={e => setSkuId(Number(e.target.value))}>
          {skus.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {sizes.length > 0 && (
          <select value={activeSize || ''} onChange={e => setSize(e.target.value)}>
            {sizes.map(sz => <option key={sz} value={sz}>{sizeLabel(sz)}</option>)}
          </select>
        )}
        <div className="sp" />
        {backupData && <button className="lnk" onClick={() => backupData()}>Save my data</button>}
        {restoreData && <>
          <button className="lnk" onClick={() => restoreRef.current.click()}>Load my data</button>
          <input type="file" accept=".json" hidden ref={restoreRef}
            onChange={e => { const f = e.target.files[0]; if (f && confirm('Replace all data with this backup?')) restoreData(f).catch(err => alert(err.message)); e.target.value = ''; }} />
        </>}
      </div>

      <div className="wrap">
        {!a ? (
          <div className="card"><p>{detail ? 'This product has no step times yet — use “Load my data” to bring in your numbers.' : 'Loading…'}</p></div>
        ) : (
          <>
            <div className="head">
              Building one <b>{sku ? sku.name : 'unit'}</b> takes about <b>{formatLong(a.build)}</b> with a team —
              and <b>{formatLong(a.totalLabor)}</b> of total work.
            </div>

            <div className="tiles">
              <div className="tile"><div className="big g">{formatLong(a.build)}</div><div className="lab">Time to build one (with a team)</div></div>
              <div className="tile"><div className="big b">{formatLong(a.totalLabor)}</div><div className="lab">Total hands-on work in one</div></div>
              <div className="tile"><div className="big">{perShift}</div><div className="lab">Made per 8-hour shift</div></div>
            </div>

            {a.bottleneck && (
              <div className="card">
                <h2>① The one step slowing you down</h2>
                <p><b>{a.bottleneck.name}</b> takes <b>{formatLong(a.bottleneck.eff)}</b> and the line waits on it.</p>
                {a.saving > 30
                  ? <div className="fix">Put <b>two people</b> on it (or add a simple fixture) and you’d save about <b>{formatLong(a.saving)}</b> on every unit.</div>
                  : <div className="fix">Already runs alongside other work — keep it staffed so it never holds things up.</div>}
              </div>
            )}

            {a.reworkSteps.length > 0 && (
              <div className="card">
                <h2>② Time wasted on bad parts</h2>
                <p>Up to <b>{formatLong(a.reworkLabor)}</b> per unit is spent <b>fixing parts that arrived wrong</b> — not building.</p>
                <div className="warn">Ask the supplier to fix it at the source: {a.reworkSteps.map(s => `${s.name} (${s.rework})`).join(', ')}. That time would mostly disappear.</div>
              </div>
            )}

            <div className="card">
              <h2>Where the time goes</h2>
              <p className="muted" style={{ marginTop: 0 }}>Longest first. Red bars set the pace — those are the ones worth shortening.</p>
              {a.ranked.map(s => {
                const onPath = a.critSet.has(s.id);
                return (
                  <div className="row" key={s.id}>
                    <div className="rl">{s.name}</div>
                    <div className="rt"><div className="rf" style={{ width: `${Math.max(8, (s.eff / maxEff) * 100)}%`, background: onPath ? '#b3261e' : '#5b8def' }}>{formatTime(s.eff)}</div></div>
                    <div className="tag">{s.rework ? 'bad-part fix' : (onPath ? 'sets the pace' : 'runs in parallel')}</div>
                  </div>
                );
              })}
            </div>

            <p className="muted">Numbers come straight from your recorded step times. “Time to build one” assumes a team of {CREW} working in parallel.</p>
          </>
        )}
      </div>
    </div>
  );
}
