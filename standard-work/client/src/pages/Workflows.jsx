import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatTime, formatLong } from '@backend';
import { criticalPath } from '../../../shared/precedence.js';
import { optimizeLine } from '../../../shared/optimize.js';
import { sizeLabel } from '../sizeLabel.js';
import { getActiveSku, setActiveSku } from '../activeSku.js';

// Snapshot the SKU's current precedence as {sequence: [prereqSequences]} so a
// saved workflow survives even if step ids change.
function depsSnapshot(steps) {
  const idToSeq = Object.fromEntries(steps.map(s => [s.id, s.sequence]));
  const out = {};
  for (const s of steps) {
    const ps = (s.depends_on || []).map(d => idToSeq[d]).filter(Boolean).sort((a, b) => a - b);
    if (ps.length) out[s.sequence] = ps;
  }
  return out;
}

export default function Workflows() {
  const navigate = useNavigate();
  const [skus, setSkus] = useState([]);
  const [skuId, setSkuId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [size, setSize] = useState(null);
  const [workflows, setWorkflows] = useState([]);
  const [name, setName] = useState('');
  const [operators, setOperators] = useState(8);
  const [shiftHours, setShiftHours] = useState(8);
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { api.get('/api/skus').then(list => { setSkus(list); if (list.length) { const a = getActiveSku(); setSkuId(p => p ?? (list.some(s => s.id === a) ? a : list[0].id)); } }); }, []);
  const loadDetail = () => api.get(`/api/skus/${skuId}`).then(setDetail);
  const loadWorkflows = () => api.get(`/api/workflows?sku_id=${skuId}`).then(setWorkflows);
  useEffect(() => { if (skuId == null) return; setActiveSku(skuId); setSize(null); setResult(null); setMsg(''); loadDetail(); loadWorkflows(); }, [skuId]); // eslint-disable-line

  const sizes = detail ? [...new Set(detail.steps.flatMap(s => s.size_times ? Object.keys(s.size_times) : []))] : [];
  const activeSize = size ?? (sizes.length ? sizes[Math.floor((sizes.length - 1) / 2)] : null);
  const timeOf = s => (activeSize && s.size_times && s.size_times[activeSize] != null) ? s.size_times[activeSize] : (s.effective_seconds || 0);

  const steps = detail ? detail.steps : [];
  const stepBySeq = useMemo(() => Object.fromEntries(steps.map(s => [s.sequence, s])), [steps]);
  const stepName = s => (s.tag_id ? s.tag_name : s.name) || `Step ${s.sequence}`;

  const cp = detail ? criticalPath(steps.map(s => ({ id: s.id, depends_on: s.depends_on || [], effective_seconds: timeOf(s) }))) : { criticalSeconds: 0 };
  const withPrereqs = steps.filter(s => (s.depends_on || []).length).length;
  const totalWork = steps.reduce((a, s) => a + timeOf(s), 0);

  function runOptimizer() {
    setError(''); setMsg('');
    const input = steps.map(s => ({
      id: s.id, depends_on: s.depends_on || [], effective_seconds: timeOf(s),
      helpable: true, help_seconds: s.help_seconds || 0, sequence: s.sequence,
    }));
    const r = optimizeLine(input, { operators: Number(operators), shiftSeconds: shiftHours * 3600, durationOf: s => s.effective_seconds });
    setResult(r);
  }

  // Build the workflow's portable line ({seqs, workers}) from an optimizer result.
  function lineFromResult(r) {
    const idToSeq = Object.fromEntries(steps.map(s => [s.id, s.sequence]));
    return {
      stationCount: r.stations.length,
      stations: r.stations.map(st => ({ seqs: st.stepIds.map(id => idToSeq[id]).filter(Boolean), workers: st.workers })),
    };
  }
  const metricsFromResult = r => ({ cycle: r.cycle, unitsPerShift: r.unitsPerShift, operators: r.usedOps, balance: r.balance });

  async function saveWorkflow(withLine) {
    if (!name.trim()) { setError('Give the workflow a name first.'); return; }
    setError('');
    const body = {
      sku_id: skuId, name: name.trim(), size: activeSize,
      deps: depsSnapshot(steps),
      line: withLine && result ? lineFromResult(result) : null,
      metrics: withLine && result ? metricsFromResult(result) : null,
    };
    await api.post('/api/workflows', body);
    setName(''); setMsg('Workflow saved.'); loadWorkflows();
  }

  // Write a saved workflow's line into the Line Designer's per-product layout.
  function pushLineToDesigner(wf) {
    if (!wf.line) return false;
    const seqToId = Object.fromEntries(steps.map(s => [s.sequence, s.id]));
    const assign = {}, workers = {};
    wf.line.stations.forEach((st, k) => {
      for (const seq of st.seqs) { const id = seqToId[seq]; if (id) { assign[id] = k; workers[id] = st.workers; } }
    });
    try { localStorage.setItem(`sw-line-${skuId}`, JSON.stringify({ assign, workers, stationCount: wf.line.stationCount })); } catch {}
    return true;
  }

  async function loadWorkflow(wf) {
    setError(''); setMsg('');
    await api.post(`/api/workflows/${wf.id}/apply`);
    const hadLine = pushLineToDesigner(wf);
    await loadDetail();
    setMsg(`Loaded “${wf.name}” — precedence applied${hadLine ? ', line sent to the Line Designer' : ''}.`);
  }
  async function renameWorkflow(wf) {
    const next = window.prompt('Rename workflow', wf.name);
    if (next && next.trim() && next.trim() !== wf.name) { await api.put(`/api/workflows/${wf.id}`, { name: next.trim() }); loadWorkflows(); }
  }
  async function deleteWorkflow(wf) {
    if (window.confirm(`Delete workflow “${wf.name}”?`)) { await api.del(`/api/workflows/${wf.id}`); loadWorkflows(); }
  }

  function sendResultToDesigner() {
    if (!result) return;
    const idToK = {}, workers = {};
    result.stations.forEach((st, k) => { for (const id of st.stepIds) { idToK[id] = k; workers[id] = st.workers; } });
    try { localStorage.setItem(`sw-line-${skuId}`, JSON.stringify({ assign: idToK, workers, stationCount: result.stations.length })); } catch {}
    navigate('/line');
  }

  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0 }}>Workflows</h1>
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
      <p className="subtitle">The prerequisites you draw on the <strong>Process Map</strong> are this product's process — the software reads them straight from there. Below it uses them to design an optimized assembly line. You can also save a <strong>named snapshot</strong> of the current prerequisites (a workflow) to keep a version or compare alternatives.</p>

      {error && <div className="alert error">{error}</div>}
      {msg && <div className="alert info">{msg}</div>}

      <div className="card">
        <div className="row" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="stat"><div className="stat-value">{steps.length}</div><div className="stat-label">steps</div></div>
          <div className="stat"><div className="stat-value">{withPrereqs}</div><div className="stat-label">with prerequisites</div></div>
          <div className="stat" style={{ borderLeftColor: '#1c7c3c' }}><div className="stat-value">{formatTime(totalWork)}</div><div className="stat-label">total hands-on work</div></div>
          <div className="stat" style={{ borderLeftColor: '#b3261e' }}><div className="stat-value">{formatTime(cp.criticalSeconds)}</div><div className="stat-label">critical path (fastest possible)</div></div>
          <div className="field" style={{ maxWidth: 280, flex: 1 }}>
            <label>Save this process as a workflow</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sola Middle Leg — v1" />
              <button className="primary" onClick={() => saveWorkflow(false)}>Save</button>
            </div>
          </div>
        </div>
      </div>

      <h2>Optimize the line</h2>
      <div className="card">
        <div className="row" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ maxWidth: 150 }}>
            <label>Operators available</label>
            <input type="number" min="1" max="20" value={operators} onChange={e => setOperators(Math.max(1, Math.min(20, Number(e.target.value))))} />
          </div>
          <div className="field" style={{ maxWidth: 120 }}>
            <label>Shift (h)</label>
            <input type="number" min="0.5" step="0.5" value={shiftHours} onChange={e => setShiftHours(Math.max(0.5, Number(e.target.value)))} />
          </div>
          <button className="primary" onClick={runOptimizer}>⚙ Optimize</button>
          <span className="muted" style={{ fontSize: 12, flex: 1 }}>
            Groups steps into stations along the build order, staffs the bottleneck, and respects every prerequisite. One operator per station; a unit comes off the line every cycle.
          </span>
        </div>

        {result && (
          <>
            <div className="row" style={{ gap: 14, flexWrap: 'wrap', marginTop: 16 }}>
              <div className="stat" style={{ borderLeftColor: '#b3261e' }}><div className="stat-value">{formatTime(result.cycle)}</div><div className="stat-label">cycle time (a unit every…)</div></div>
              <div className="stat" style={{ borderLeftColor: '#1c7c3c' }}><div className="stat-value">{result.unitsPerShift}</div><div className="stat-label">units / {shiftHours}h shift</div></div>
              <div className="stat" style={{ borderLeftColor: '#1a56b0' }}><div className="stat-value">{result.usedOps}</div><div className="stat-label">operators used (of {result.operators})</div></div>
              <div className="stat" style={{ borderLeftColor: result.balance > 0.85 ? '#1c7c3c' : result.balance > 0.7 ? '#e0913d' : '#b3261e' }}><div className="stat-value">{Math.round(result.balance * 100)}%</div><div className="stat-label">line balance</div></div>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Theoretical floor with {result.operators} people: <strong>{formatTime(result.floorCycle)}</strong> cycle. {result.usedOps < result.operators && `${result.operators - result.usedOps} operator(s) left unassigned — adding them wouldn't shrink the bottleneck.`}
            </p>

            <div className="line-board" style={{ marginTop: 10 }}>
              {result.stations.map((st, k) => {
                const bottleneck = st.seconds === result.cycle;
                return (
                  <div key={k} className={`line-station ${bottleneck ? 'bottleneck' : ''}`} style={{ flexBasis: 200 }}>
                    <div className="line-station-head"><strong>Station {k + 1}</strong><span>{st.workers} op{st.workers === 1 ? '' : 's'}</span></div>
                    <div className={`line-station-time ${bottleneck ? 'bn' : ''}`}>{formatTime(st.seconds)}{bottleneck && <span className="badge review" style={{ marginLeft: 6 }}>bottleneck</span>}</div>
                    <div className="line-notes">
                      {st.stepIds.map(id => { const s = steps.find(x => x.id === id); return s ? <div key={id} className="wf-step">{s.sequence}. {stepName(s)} <span className="muted">· {formatTime(timeOf(s))}</span></div> : null; })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <button className="primary" onClick={() => saveWorkflow(true)} disabled={!name.trim()} title={!name.trim() ? 'Enter a name above first' : ''}>💾 Save as workflow{name.trim() ? ` “${name.trim()}”` : ''}</button>
              <button onClick={sendResultToDesigner}>✎ Open in Line Designer to tweak</button>
            </div>
          </>
        )}
      </div>

      <h2>Saved workflows</h2>
      <div className="card">
        {workflows.length === 0 && <div className="empty">No saved workflows for this product yet. Save the current process above, or optimize and save the result.</div>}
        {workflows.map(wf => (
          <div key={wf.id} className="solution-row" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <strong>{wf.name}</strong>
              <div className="muted" style={{ fontSize: 12 }}>
                {Object.keys(wf.deps || {}).length} step(s) with prerequisites
                {wf.size ? ` · ${sizeLabel(wf.size)}` : ''}
                {wf.metrics ? ` · line: ${formatTime(wf.metrics.cycle)} cycle, ${wf.metrics.operators} ops` : ''}
                {` · saved ${(wf.updated_at || wf.created_at || '').slice(0, 16)}`}
              </div>
            </div>
            {wf.line && <span className="badge ok">has line</span>}
            <button className="small" onClick={() => loadWorkflow(wf)} title="Apply this precedence (and line) to the product">Load</button>
            <button className="small" onClick={() => renameWorkflow(wf)}>Rename</button>
            <button className="small danger" onClick={() => deleteWorkflow(wf)}>Delete</button>
          </div>
        ))}
      </div>
    </>
  );
}
