import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatTime } from '@backend';

function EditTagModal({ tag, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: tag.name, description: tag.description || '',
    time: tag.canonical_time_seconds !== null ? formatTime(tag.canonical_time_seconds) : '',
    unit_time: tag.unit_seconds != null ? formatTime(tag.unit_seconds) : '',
    unit_label: tag.unit_label || '',
    note: '',
  });
  const [impact, setImpact] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { api.get(`/api/tags/${tag.id}/impact`).then(setImpact); }, [tag.id]);

  const timeChanged =
    form.time !== (tag.canonical_time_seconds !== null ? formatTime(tag.canonical_time_seconds) : '') ||
    form.unit_time !== (tag.unit_seconds != null ? formatTime(tag.unit_seconds) : '');

  async function save(e) {
    e.preventDefault();
    // Canonical time changes ripple to every SKU using the tag — require an
    // explicit confirmation pass that shows exactly which SKUs move.
    if (timeChanged && !confirming && impact?.affected.some(a => a.will_change)) {
      setConfirming(true);
      return;
    }
    try {
      const result = await api.put(`/api/tags/${tag.id}`, form);
      onSaved(result);
    } catch (err) { setError(err.message); setConfirming(false); }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>Edit shared step</h3>
        {error && <div className="alert error">{error}</div>}
        <form onSubmit={save}>
          <div className="row">
            <div className="field">
              <label>Name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label>Fixed time (e.g. 4:30)</label>
              <input value={form.time} onChange={e => { setForm({ ...form, time: e.target.value }); setConfirming(false); }}
                placeholder={form.unit_time ? 'not used — per-unit time is set' : ''} />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>Per-unit time (e.g. 0:50 per connector)</label>
              <input value={form.unit_time} onChange={e => { setForm({ ...form, unit_time: e.target.value }); setConfirming(false); }}
                placeholder="leave blank for a fixed time" />
            </div>
            <div className="field">
              <label>Unit name</label>
              <input value={form.unit_label} onChange={e => setForm({ ...form, unit_label: e.target.value })} placeholder="e.g. connector" />
            </div>
          </div>
          {form.unit_time && (
            <div className="alert info" style={{ padding: '6px 10px' }}>
              With a per-unit time, each SKU sets its own quantity on the step — its time becomes quantity × {form.unit_time || 'unit time'}.
            </div>
          )}
          <div className="field">
            <label>Description</label>
            <textarea rows={5} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          {timeChanged && (
            <div className="field">
              <label>Reason for time change (kept in history)</label>
              <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="e.g. re-studied after new fixture installed" />
            </div>
          )}
          {confirming && impact && (
            <div className="alert warn">
              <strong>Confirm: this time change will update:</strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {impact.affected.map(a => (
                  <li key={a.id}>
                    {a.sku_number} — {a.name}
                    {a.will_change
                      ? <> (current total {formatTime(a.current_total)})</>
                      : <> — <em>not affected, has an override of {formatTime(a.override_time_seconds)}</em></>}
                  </li>
                ))}
              </ul>
              Submit again to apply.
            </div>
          )}
          <div className="actions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary">{confirming ? 'Yes, apply to all' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function HistoryModal({ tag, onClose }) {
  const [history, setHistory] = useState([]);
  useEffect(() => { api.get(`/api/history/tag/${tag.id}`).then(setHistory); }, [tag.id]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>Time history — {tag.name}</h3>
        {history.length === 0 ? <p className="muted">No time changes recorded yet.</p> : (
          <table className="data">
            <thead><tr><th>When</th><th>From</th><th>To</th><th>Change</th><th>Note</th></tr></thead>
            <tbody>
              {history.map(h => {
                const delta = (h.new_seconds ?? 0) - (h.old_seconds ?? 0);
                return (
                  <tr key={h.id}>
                    <td>{h.changed_at}</td>
                    <td className="time">{formatTime(h.old_seconds)}</td>
                    <td className="time">{formatTime(h.new_seconds)}</td>
                    <td className="time" style={{ color: delta < 0 ? 'var(--ok)' : 'var(--danger)' }}>
                      {delta < 0 ? '▼' : '▲'} {formatTime(Math.abs(delta))}
                    </td>
                    <td>{h.note || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="actions"><button onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

export default function Tags() {
  const [tags, setTags] = useState([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [history, setHistory] = useState(null);
  const [savedMsg, setSavedMsg] = useState('');

  const load = useCallback(() => api.get('/api/tags').then(setTags), []);
  useEffect(() => { load(); }, [load]);

  const filtered = tags.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.description || '').toLowerCase().includes(search.toLowerCase()));

  async function remove(tag) {
    try {
      await api.del(`/api/tags/${tag.id}`);
      load();
    } catch (err) {
      if (err.status === 409) {
        const names = (err.data.usage || []).map(u => `• ${u.sku_number} — ${u.name}`).join('\n');
        if (window.confirm(`${err.data.error}:\n${names}\n\nDetach these steps (each keeps a copy of the step definition and time as a unique step) and delete the tag?`)) {
          await api.del(`/api/tags/${tag.id}?detach=true`);
          load();
        }
      } else alert(err.message);
    }
  }

  return (
    <>
      <h1>Shared Steps (Tags)</h1>
      <p className="subtitle">Single source of truth for steps that repeat across SKUs. Editing a canonical time updates every SKU that inherits it.</p>

      {savedMsg && <div className="alert info">{savedMsg}</div>}

      <div className="toolbar">
        <input style={{ maxWidth: 320 }} placeholder="Search shared steps…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card">
        <table className="data">
          <thead><tr><th>Shared step</th><th>Canonical time</th><th>Used by</th><th style={{ width: 200 }}></th></tr></thead>
          <tbody>
            {filtered.map(t => (
              <tr key={t.id}>
                <td>
                  <strong>{t.name}</strong>
                  <div className="step-desc">{t.description}</div>
                </td>
                <td className="time">
                  {t.unit_seconds != null
                    ? <>{formatTime(t.unit_seconds)}<span className="muted" style={{ fontWeight: 400 }}> / {t.unit_label || 'unit'}</span></>
                    : formatTime(t.canonical_time_seconds)}
                </td>
                <td>
                  {t.usage_count === 0 ? <span className="muted">unused</span> : t.used_by.map(u => (
                    <div key={`${u.id}-${u.override_time_seconds}`}>
                      <Link to={`/skus/${u.id}`}>{u.sku_number}</Link>
                      {t.unit_seconds != null && u.quantity != null && (
                        <span className="muted"> · {u.quantity} {t.unit_label || 'unit'}{u.quantity === 1 ? '' : 's'} = {formatTime(Math.round(t.unit_seconds * u.quantity))}</span>
                      )}
                      {u.override_time_seconds !== null && (
                        <> <span className="badge override">override {formatTime(u.override_time_seconds)}</span></>
                      )}
                    </div>
                  ))}
                </td>
                <td>
                  <button className="small" onClick={() => setEditing(t)}>Edit</button>{' '}
                  <button className="small" onClick={() => setHistory(t)}>History</button>{' '}
                  <button className="ghost small" onClick={() => remove(t)}>Delete</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={4} className="empty">No shared steps yet — create one while adding steps to a SKU.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditTagModal tag={editing} onClose={() => setEditing(null)}
          onSaved={result => {
            setEditing(null);
            load();
            if (result.affected_skus?.length) {
              setSavedMsg(`Updated "${result.name}" — new time applied to: ${result.affected_skus.map(a => a.sku_number).join(', ')}`);
              setTimeout(() => setSavedMsg(''), 8000);
            }
          }} />
      )}
      {history && <HistoryModal tag={history} onClose={() => setHistory(null)} />}
    </>
  );
}
