import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { api, formatTime, formatLong, photoSrc, downloadExcel, openPrint } from '@backend';

function TagSearch({ onSelect }) {
  const [q, setQ] = useState('');
  const [tags, setTags] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => api.get(`/api/tags?q=${encodeURIComponent(q)}`).then(setTags), 150);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="dropdown">
      <input placeholder="Search shared steps by name or description…"
        value={q} onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} />
      {open && tags.length > 0 && (
        <div className="dropdown-menu">
          {tags.map(t => (
            <div key={t.id} className="dropdown-item" onClick={() => { onSelect(t); setOpen(false); setQ(''); }}>
              <strong>{t.name}</strong>{' '}
              <span className="time">{formatTime(t.canonical_time_seconds)}</span>{' '}
              <span className="muted">· used by {t.usage_count} SKU(s)</span>
              <div className="desc">{t.description}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddStepForm({ skuId, onDone }) {
  const [mode, setMode] = useState('unique'); // unique | newtag | attach
  const [form, setForm] = useState({ name: '', description: '', time: '', station: '', parallel_notes: '' });
  const [selectedTag, setSelectedTag] = useState(null);
  const [override, setOverride] = useState('');
  const [error, setError] = useState('');
  const [suggestion, setSuggestion] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      if (mode === 'attach') {
        if (!selectedTag) return setError('Pick a shared step to attach.');
        await api.post(`/api/skus/${skuId}/steps`, {
          tag_id: selectedTag.id,
          override_time: override || undefined,
          station: form.station, parallel_notes: form.parallel_notes,
        });
      } else if (mode === 'newtag') {
        // Create the tag first (server warns on duplicate names), then attach it
        let tag;
        try {
          tag = await api.post('/api/tags', { name: form.name, description: form.description, time: form.time, force: suggestion ? true : undefined });
        } catch (err) {
          if (err.status === 409 && err.data?.existing) { setSuggestion(err.data.existing); return; }
          throw err;
        }
        await api.post(`/api/skus/${skuId}/steps`, { tag_id: tag.id, station: form.station, parallel_notes: form.parallel_notes });
      } else {
        await api.post(`/api/skus/${skuId}/steps`, form);
      }
      setForm({ name: '', description: '', time: '', station: '', parallel_notes: '' });
      setSelectedTag(null); setOverride(''); setSuggestion(null);
      onDone();
    } catch (err) { setError(err.message); }
  }

  async function attachSuggested() {
    await api.post(`/api/skus/${skuId}/steps`, {
      tag_id: suggestion.id,
      override_time: form.time && suggestion.canonical_time_seconds !== null ? form.time : undefined,
      station: form.station, parallel_notes: form.parallel_notes,
    });
    setForm({ name: '', description: '', time: '', station: '', parallel_notes: '' });
    setSuggestion(null);
    onDone();
  }

  return (
    <form onSubmit={submit} className="card">
      <h2 style={{ marginTop: 0 }}>Add step</h2>
      <div className="toolbar">
        {[['unique', 'Unique step'], ['newtag', 'New shared step (tag)'], ['attach', 'Attach existing tag']].map(([m, label]) => (
          <button key={m} type="button" className={mode === m ? 'primary' : ''}
            onClick={() => { setMode(m); setError(''); setSuggestion(null); }}>{label}</button>
        ))}
      </div>

      {error && <div className="alert error">{error}</div>}
      {suggestion && (
        <div className="alert warn">
          A shared step named <strong>{suggestion.name}</strong> already exists
          ({formatTime(suggestion.canonical_time_seconds)}, used by {suggestion.usage_count} SKU(s)).
          {' '}<button type="button" className="small" onClick={attachSuggested}>Attach it{form.time ? ' (your time becomes an override)' : ''}</button>
          {' '}or submit again to create a separate tag with the same name.
        </div>
      )}

      {mode === 'attach' ? (
        <>
          <div className="field">
            <label>Shared step</label>
            {selectedTag ? (
              <div className="alert info">
                <strong>{selectedTag.name}</strong> — {formatTime(selectedTag.canonical_time_seconds)}
                {' '}<button type="button" className="small" onClick={() => setSelectedTag(null)}>change</button>
              </div>
            ) : <TagSearch onSelect={setSelectedTag} />}
          </div>
          <div className="field">
            <label>Time override for this SKU only (optional, e.g. 4:30)</label>
            <input value={override} onChange={e => setOverride(e.target.value)}
              placeholder={selectedTag ? `leave blank to inherit ${formatTime(selectedTag.canonical_time_seconds)}` : 'leave blank to inherit the tag time'} />
          </div>
        </>
      ) : (
        <>
          <div className="row">
            <div className="field">
              <label>Step name *</label>
              <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label>Observed time (e.g. 4:30, 12, or "3 minutes 20 seconds")</label>
              <input value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>Description</label>
            <textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
        </>
      )}

      <div className="row">
        <div className="field">
          <label>Workstation (optional)</label>
          <input value={form.station} onChange={e => setForm({ ...form, station: e.target.value })} />
        </div>
        <div className="field">
          <label>Parallel notes (optional)</label>
          <input value={form.parallel_notes} onChange={e => setForm({ ...form, parallel_notes: e.target.value })} />
        </div>
      </div>
      <button className="primary" type="submit">Add step</button>
    </form>
  );
}

function EditStepModal({ step, onClose, onSaved }) {
  const isTagged = !!step.tag_id;
  const [form, setForm] = useState({
    name: step.name || '', description: step.description || '',
    time: step.time_seconds !== null ? formatTime(step.time_seconds) : '',
    override_time: step.override_time_seconds !== null ? formatTime(step.override_time_seconds) : '',
    station: step.station || '', parallel_notes: step.parallel_notes || '',
  });
  const [error, setError] = useState('');

  async function save(e) {
    e.preventDefault();
    try {
      await api.put(`/api/steps/${step.id}`, {
        ...(isTagged ? { override_time: form.override_time } : { name: form.name, description: form.description, time: form.time }),
        station: form.station, parallel_notes: form.parallel_notes, needs_review: false,
      });
      onSaved();
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>Edit step {step.sequence}{isTagged ? ` — shared: ${step.tag_name}` : ''}</h3>
        {error && <div className="alert error">{error}</div>}
        <form onSubmit={save}>
          {isTagged ? (
            <>
              <p className="muted">This step inherits its definition from the shared tag
                (<strong>{formatTime(step.tag_time_seconds)}</strong>). Edit the tag itself on the Shared Steps page;
                here you can only set a per-SKU override.</p>
              <div className="field">
                <label>Override time for this SKU (blank = inherit tag time)</label>
                <input value={form.override_time} onChange={e => setForm({ ...form, override_time: e.target.value })} />
              </div>
            </>
          ) : (
            <>
              <div className="row">
                <div className="field">
                  <label>Name</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="field">
                  <label>Time</label>
                  <input value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} />
                </div>
              </div>
              <div className="field">
                <label>Description</label>
                <textarea rows={5} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
            </>
          )}
          <div className="row">
            <div className="field">
              <label>Workstation</label>
              <input value={form.station} onChange={e => setForm({ ...form, station: e.target.value })} />
            </div>
            <div className="field">
              <label>Parallel notes</label>
              <input value={form.parallel_notes} onChange={e => setForm({ ...form, parallel_notes: e.target.value })} />
            </div>
          </div>
          <div className="actions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SkuDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sku, setSku] = useState(null);
  const [editing, setEditing] = useState(null);
  const photoInput = useRef();
  const stepPhotoFor = useRef(null);

  const load = useCallback(() => api.get(`/api/skus/${id}`).then(setSku), [id]);
  useEffect(() => { load(); }, [load]);

  if (!sku) return null;

  const maxTime = Math.max(...sku.steps.map(s => s.effective_seconds || 0), 1);
  const chartData = sku.steps.map(s => ({
    name: `${s.sequence}. ${(s.tag_id ? s.tag_name : s.name) || ''}`.slice(0, 38),
    minutes: +((s.effective_seconds || 0) / 60).toFixed(1),
    isMax: s.effective_seconds === maxTime,
  }));

  async function move(step, dir) {
    const ids = sku.steps.map(s => s.id);
    const i = ids.indexOf(step.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await api.post(`/api/skus/${sku.id}/steps/reorder`, { orderedIds: ids });
    load();
  }

  async function removeStep(step) {
    if (!window.confirm(`Delete step ${step.sequence} "${(step.tag_id ? step.tag_name : step.name) || ''}"?`)) return;
    await api.del(`/api/steps/${step.id}`);
    load();
  }

  async function removeSku() {
    if (!window.confirm(`Delete SKU ${sku.sku_number} "${sku.name}" and all its steps? This cannot be undone.`)) return;
    await api.del(`/api/skus/${sku.id}`);
    navigate('/skus');
  }

  async function uploadPhoto(file, ownerType, ownerId) {
    const fd = new FormData();
    fd.append('photo', file);
    fd.append('owner_type', ownerType);
    fd.append('owner_id', ownerId);
    await api.post('/api/photos', fd);
    load();
  }

  return (
    <>
      <div className="toolbar">
        <div>
          <h1>{sku.name}</h1>
          <div className="muted">SKU {sku.sku_number} · {sku.family || 'no family'} · v{sku.version}</div>
        </div>
        <div className="spacer" />
        <span className="total-chip">Total: {formatTime(sku.total_seconds)} <span style={{ fontWeight: 400 }}>({formatLong(sku.total_seconds)})</span></span>
      </div>

      <div className="toolbar">
        {sku.photo_path
          ? <img className="photo-thumb" style={{ width: 96, height: 72 }} src={photoSrc(sku.photo_path)} alt="" />
          : null}
        <button className="small" onClick={() => { stepPhotoFor.current = null; photoInput.current.click(); }}>
          {sku.photo_path ? 'Replace product photo' : 'Add product photo'}
        </button>
        <div className="spacer" />
        <button className="small" onClick={() => openPrint(sku.id)}>Print / PDF</button>
        <button className="small" onClick={() => downloadExcel(sku.id)}>Export Excel</button>
        <button className="small danger" onClick={removeSku}>Delete SKU</button>
      </div>
      <input type="file" accept="image/*" hidden ref={photoInput}
        onChange={e => {
          const file = e.target.files[0];
          if (!file) return;
          if (stepPhotoFor.current) uploadPhoto(file, 'sku_step', stepPhotoFor.current);
          else uploadPhoto(file, 'sku', sku.id);
          e.target.value = '';
        }} />

      {sku.steps.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Step times <span className="muted" style={{ fontWeight: 400 }}>(red = longest step / bottleneck)</span></h2>
          <ResponsiveContainer width="100%" height={Math.max(120, chartData.length * 40)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 40, right: 40 }}>
              <XAxis type="number" unit=" min" />
              <YAxis type="category" dataKey="name" width={260} tick={{ fontSize: 12 }} />
              <Tooltip formatter={v => [`${v} min`, 'Time']} />
              <Bar dataKey="minutes" radius={[0, 4, 4, 0]} barSize={20}>
                {chartData.map((d, i) => <Cell key={i} fill={d.isMax ? '#b3261e' : '#1a56b0'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Steps</h2>
        <table className="data">
          <thead><tr><th style={{ width: 70 }}>#</th><th>Step</th><th>Time</th><th>Photo</th><th style={{ width: 170 }}></th></tr></thead>
          <tbody>
            {sku.steps.map(step => {
              const name = step.tag_id ? step.tag_name : step.name;
              const desc = step.tag_id ? step.tag_description : step.description;
              return (
                <tr key={step.id}>
                  <td>
                    <strong>{step.sequence}</strong>{' '}
                    <button className="ghost" title="Move up" onClick={() => move(step, -1)}>↑</button>
                    <button className="ghost" title="Move down" onClick={() => move(step, 1)}>↓</button>
                  </td>
                  <td>
                    <strong>{name}</strong>{' '}
                    {step.tag_id ? <span className="badge tag">shared</span> : null}{' '}
                    {step.is_override ? <span className="badge override" title={`Tag time is ${formatTime(step.tag_time_seconds)}; this SKU uses ${formatTime(step.override_time_seconds)}`}>override</span> : null}{' '}
                    {step.needs_review ? <span className="badge review" title={step.time_raw_text ? `Original time text: ${step.time_raw_text}` : 'Needs review'}>needs review</span> : null}
                    <div className="step-desc">{desc}</div>
                    {step.station && <div className="muted">Station: {step.station}</div>}
                    {step.parallel_notes && <div className="muted">Parallel: {step.parallel_notes}</div>}
                    {step.needs_review && step.time_raw_text ? <div className="muted">Original time text: “{step.time_raw_text}”</div> : null}
                  </td>
                  <td className="time">{formatTime(step.effective_seconds)}</td>
                  <td>
                    {step.photos?.length
                      ? step.photos.map(p => <img key={p.id} className="photo-thumb" src={photoSrc(p.file_path)} alt="" style={{ marginRight: 4 }} />)
                      : null}
                    <button className="ghost small" onClick={() => { stepPhotoFor.current = step.id; photoInput.current.click(); }}>+ photo</button>
                  </td>
                  <td>
                    <button className="small" onClick={() => setEditing(step)}>Edit</button>{' '}
                    <button className="ghost small" onClick={() => removeStep(step)}>Delete</button>
                  </td>
                </tr>
              );
            })}
            {sku.steps.length === 0 && <tr><td colSpan={5} className="empty">No steps yet — add the first one below.</td></tr>}
          </tbody>
        </table>
      </div>

      <AddStepForm skuId={sku.id} onDone={load} />

      {editing && <EditStepModal step={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}
