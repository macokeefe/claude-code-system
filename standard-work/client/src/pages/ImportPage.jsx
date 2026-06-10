import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatTime } from '../api.js';

export default function ImportPage() {
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function dryRun(file) {
    setBusy(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const result = await api.post('/api/import/dry-run', fd);
      // Pre-accept suggested tags whose time matches exactly
      result.steps.forEach(s => { if (s.suggestedTag?.timeMatches) s.attachTagId = s.suggestedTag.id; });
      setPreview(result);
    } catch (err) { setError(err.message); }
    setBusy(false);
  }

  async function commit() {
    setBusy(true); setError('');
    try {
      const result = await api.post('/api/import/commit', preview);
      navigate(`/skus/${result.skuId}`);
    } catch (err) { setError(err.message); setBusy(false); }
  }

  const update = (i, patch) => setPreview(p => ({
    ...p, steps: p.steps.map((s, j) => j === i ? { ...s, ...patch } : s),
  }));

  return (
    <>
      <h1>Import a standard work spreadsheet</h1>
      <p className="subtitle">
        Upload an SWI workbook (.xlsx). Nothing is saved until you review the dry-run preview and commit.
        Step photos embedded in the workbook are extracted automatically on commit.
      </p>

      {error && <div className="alert error">{error}</div>}

      {!preview && (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <input type="file" accept=".xlsx" style={{ maxWidth: 360 }} disabled={busy}
            onChange={e => e.target.files[0] && dryRun(e.target.files[0])} />
          {busy && <p className="muted">Parsing workbook…</p>}
        </div>
      )}

      {preview && (
        <>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Dry-run preview — review before committing</h2>
            <div className="row">
              <div className="field">
                <label>SKU number *</label>
                <input value={preview.sku.sku_number}
                  onChange={e => setPreview({ ...preview, sku: { ...preview.sku, sku_number: e.target.value } })}
                  placeholder="not found in the spreadsheet — enter it" />
              </div>
              <div className="field">
                <label>Name</label>
                <input value={preview.sku.name}
                  onChange={e => setPreview({ ...preview, sku: { ...preview.sku, name: e.target.value } })} />
              </div>
              <div className="field">
                <label>Family</label>
                <input value={preview.sku.family || ''}
                  onChange={e => setPreview({ ...preview, sku: { ...preview.sku, family: e.target.value } })} />
              </div>
            </div>
            <p className="muted">{preview.steps.length} steps · {preview.imageCount} embedded image(s) found</p>
            {preview.warnings.length > 0 && (
              <div className="alert warn">
                <strong>Review flags:</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}
          </div>

          <div className="card">
            <table className="data">
              <thead><tr><th>#</th><th>Step</th><th>Time</th><th>Shared step match</th><th>Skip</th></tr></thead>
              <tbody>
                {preview.steps.map((s, i) => (
                  <tr key={i} style={s.skip ? { opacity: 0.4 } : undefined}>
                    <td>{i + 1}</td>
                    <td>
                      <input value={s.name} onChange={e => update(i, { name: e.target.value })} style={{ fontWeight: 600 }} />
                      <div className="step-desc">{s.description}</div>
                    </td>
                    <td style={{ minWidth: 130 }}>
                      <input value={s.timeSeconds !== null ? formatTime(s.timeSeconds) : ''}
                        placeholder={s.timeAmbiguous ? 'ambiguous' : 'none'}
                        onChange={e => {
                          const m = e.target.value.match(/^(\d+):(\d{2})$/);
                          update(i, { timeSeconds: m ? (+m[1] * 60 + +m[2]) : null, timeAmbiguous: false });
                        }} />
                      {s.timeAmbiguous && <div><span className="badge review" title={s.timeRaw}>was: “{s.timeRaw}”</span></div>}
                    </td>
                    <td>
                      {s.suggestedTag ? (
                        <label style={{ fontWeight: 400, textTransform: 'none' }}>
                          <input type="checkbox" style={{ width: 'auto', marginRight: 6 }}
                            checked={!!s.attachTagId}
                            onChange={e => update(i, { attachTagId: e.target.checked ? s.suggestedTag.id : null })} />
                          Attach “{s.suggestedTag.name}” ({formatTime(s.suggestedTag.time_seconds)})
                          {!s.suggestedTag.timeMatches && s.timeSeconds !== null &&
                            <span className="badge override"> time differs — becomes override</span>}
                        </label>
                      ) : <span className="muted">—</span>}
                    </td>
                    <td><input type="checkbox" style={{ width: 'auto' }} checked={!!s.skip} onChange={e => update(i, { skip: e.target.checked })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="toolbar">
            <button onClick={() => setPreview(null)}>Start over</button>
            <div className="spacer" />
            <button className="primary" disabled={busy || !preview.sku.sku_number.trim()} onClick={commit}>
              {busy ? 'Importing…' : `Commit import (${preview.steps.filter(s => !s.skip).length} steps)`}
            </button>
          </div>
          {!preview.sku.sku_number.trim() && <p className="muted" style={{ textAlign: 'right' }}>Enter a SKU number to enable commit.</p>}
        </>
      )}
    </>
  );
}
