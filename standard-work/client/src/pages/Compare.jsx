import { useEffect, useMemo, useState } from 'react';
import { api, formatTime } from '@backend';
import { criticalPath } from '../../../shared/precedence.js';
import { sizeLabel } from '../sizeLabel.js';
import { getActiveSku, setActiveSku } from '../activeSku.js';

const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Steps line up across products by their shared tag; fall back to the name.
const keyOf = st => st.tag_id ? `t${st.tag_id}` : `n:${norm(st.name)}`;
const labelOf = st => (st.tag_id ? st.tag_name : st.name) || `Step ${st.sequence}`;

function useSku(initial) {
  const [skuId, setSkuId] = useState(initial);
  const [detail, setDetail] = useState(null);
  const [size, setSize] = useState(null);
  useEffect(() => { if (skuId == null) { setDetail(null); return; } setSize(null); api.get(`/api/skus/${skuId}`).then(setDetail); }, [skuId]);
  const sizes = detail ? [...new Set(detail.steps.flatMap(s => s.size_times ? Object.keys(s.size_times) : []))] : [];
  const activeSize = size ?? (sizes.length ? sizes[Math.floor((sizes.length - 1) / 2)] : null);
  const timeOf = s => (activeSize && s.size_times && s.size_times[activeSize] != null) ? s.size_times[activeSize] : (s.effective_seconds || 0);
  return { skuId, setSkuId, detail, sizes, activeSize, setSize, timeOf };
}

function SidePicker({ side, skus, sku, color }) {
  return (
    <div className="row" style={{ gap: 8, alignItems: 'center', flex: 1 }}>
      <span className="badge" style={{ background: color, color: '#fff' }}>{side}</span>
      <select value={sku.skuId || ''} onChange={e => sku.setSkuId(Number(e.target.value))} style={{ flex: 2 }}>
        {skus.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      {sku.sizes.length > 0 && (
        <select value={sku.activeSize || ''} onChange={e => sku.setSize(e.target.value)} style={{ flex: 1, minWidth: 110 }}>
          {sku.sizes.map(sz => <option key={sz} value={sz}>{sizeLabel(sz)}</option>)}
        </select>
      )}
    </div>
  );
}

export default function Compare() {
  const [skus, setSkus] = useState([]);
  const A = useSku(null);
  const B = useSku(null);

  useEffect(() => {
    api.get('/api/skus').then(list => {
      setSkus(list);
      if (!list.length) return;
      const active = getActiveSku();
      const first = list.some(s => s.id === active) ? active : list[0].id;
      A.setSkuId(p => p ?? first);
      B.setSkuId(p => p ?? (list.find(s => s.id !== first) || list[0]).id);
    });
  }, []); // eslint-disable-line
  useEffect(() => { if (A.skuId != null) setActiveSku(A.skuId); }, [A.skuId]);

  const rows = useMemo(() => {
    if (!A.detail || !B.detail) return [];
    const out = [];
    const usedB = new Set();
    const bByKey = new Map();
    for (const s of B.detail.steps) { const k = keyOf(s); (bByKey.get(k) || bByKey.set(k, []).get(k)).push(s); }
    for (const a of A.detail.steps) {
      const list = bByKey.get(keyOf(a)) || [];
      const b = list.find(x => !usedB.has(x.id)) || null;
      if (b) usedB.add(b.id);
      out.push({ label: labelOf(a), a, b });
    }
    for (const b of B.detail.steps) if (!usedB.has(b.id)) out.push({ label: labelOf(b), a: null, b });
    return out;
  }, [A.detail, B.detail]);

  const maxTime = Math.max(1, ...rows.map(r => Math.max(r.a ? A.timeOf(r.a) : 0, r.b ? B.timeOf(r.b) : 0)));
  const totalA = rows.reduce((s, r) => s + (r.a ? A.timeOf(r.a) : 0), 0);
  const totalB = rows.reduce((s, r) => s + (r.b ? B.timeOf(r.b) : 0), 0);
  const critOf = (sku) => sku.detail ? criticalPath(sku.detail.steps.map(s => ({ id: s.id, depends_on: s.depends_on || [], effective_seconds: sku.timeOf(s) }))).criticalSeconds : 0;
  const critA = critOf(A), critB = critOf(B);

  const COL_A = '#1a56b0', COL_B = '#1c7c3c';
  const deltaTag = (delta) => {
    if (delta === 0) return <span className="muted">—</span>;
    const slower = delta > 0;
    return <span style={{ fontWeight: 700, color: slower ? '#b3261e' : '#1c7c3c' }}>{slower ? '+' : '−'}{formatTime(Math.abs(delta))}</span>;
  };

  return (
    <>
      <div className="toolbar"><h1 style={{ margin: 0 }}>Compare</h1></div>
      <p className="subtitle">Put two products (or two sizes of one product) side by side to see which steps differ and by how much. Steps line up by their shared step / name; a step only one side has is marked.</p>

      <div className="card">
        <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
          <SidePicker side="A" skus={skus} sku={A} color={COL_A} />
          <SidePicker side="B" skus={skus} sku={B} color={COL_B} />
        </div>
        <div className="row" style={{ gap: 14, flexWrap: 'wrap', marginTop: 14 }}>
          <div className="stat" style={{ borderLeftColor: COL_A }}><div className="stat-value">{formatTime(totalA)}</div><div className="stat-label">A · total hands-on</div></div>
          <div className="stat" style={{ borderLeftColor: COL_B }}><div className="stat-value">{formatTime(totalB)}</div><div className="stat-label">B · total hands-on</div></div>
          <div className="stat" style={{ borderLeftColor: '#5c6470' }}><div className="stat-value">{deltaTag(totalB - totalA)}</div><div className="stat-label">difference (B − A)</div></div>
          <div className="stat" style={{ borderLeftColor: '#b3261e' }}><div className="stat-value" style={{ fontSize: 15 }}>{formatTime(critA)} → {formatTime(critB)}</div><div className="stat-label">critical path A → B</div></div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data cmp-table">
          <thead>
            <tr>
              <th style={{ width: '26%' }}>Step</th>
              <th style={{ width: '30%' }}><span className="badge" style={{ background: COL_A, color: '#fff' }}>A</span> {A.detail?.name}{A.activeSize ? ` · ${sizeLabel(A.activeSize)}` : ''}</th>
              <th style={{ width: '30%' }}><span className="badge" style={{ background: COL_B, color: '#fff' }}>B</span> {B.detail?.name}{B.activeSize ? ` · ${sizeLabel(B.activeSize)}` : ''}</th>
              <th style={{ width: '14%' }}>Δ (B − A)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const ta = r.a ? A.timeOf(r.a) : null;
              const tb = r.b ? B.timeOf(r.b) : null;
              const onlyOne = !r.a || !r.b;
              return (
                <tr key={i} className={onlyOne ? 'cmp-only' : ''}>
                  <td>{r.label}{onlyOne && <span className="badge review" style={{ marginLeft: 6 }}>only {r.a ? 'A' : 'B'}</span>}</td>
                  <td>{ta != null ? <Bar t={ta} max={maxTime} color={COL_A} /> : <span className="muted">—</span>}</td>
                  <td>{tb != null ? <Bar t={tb} max={maxTime} color={COL_B} /> : <span className="muted">—</span>}</td>
                  <td>{ta != null && tb != null ? deltaTag(tb - ta) : <span className="muted">—</span>}</td>
                </tr>
              );
            })}
            <tr className="cmp-total">
              <td>Total</td>
              <td><strong>{formatTime(totalA)}</strong></td>
              <td><strong>{formatTime(totalB)}</strong></td>
              <td>{deltaTag(totalB - totalA)}</td>
            </tr>
          </tbody>
        </table>
        {(!A.detail || !B.detail) && <div className="empty">Pick a product for each side.</div>}
      </div>
    </>
  );
}

function Bar({ t, max, color }) {
  return (
    <div className="cmp-cell">
      <div className="cmp-track"><div className="cmp-bar" style={{ width: `${Math.max(2, (t / max) * 100)}%`, background: color }} /></div>
      <span className="time" style={{ minWidth: 52, textAlign: 'right' }}>{formatTime(t)}</span>
    </div>
  );
}
