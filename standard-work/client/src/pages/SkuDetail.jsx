import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { api, formatTime, formatLong, photoSrc, downloadExcel, openPrint } from '@backend';

function TagSearch({ onSelect, autoFocus }) {
  const [q, setQ] = useState('');
  const [tags, setTags] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => api.get(`/api/tags?q=${encodeURIComponent(q)}`).then(setTags), 150);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="dropdown">
      <input placeholder="Search shared steps by name or description…" autoFocus={autoFocus}
        value={q} onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} />
      {open && tags.length > 0 && (
        <div className="dropdown-menu">
          {tags.map(t => (
            <div key={t.id} className="dropdown-item" onClick={() => { onSelect(t); setOpen(false); setQ(''); }}>
              <strong>{t.name}</strong>{' '}
              <span className="time">
                {t.unit_seconds != null
                  ? `${formatTime(t.unit_seconds)} / ${t.unit_label || 'unit'}`
                  : formatTime(t.canonical_time_seconds)}
              </span>{' '}
              <span className="muted">· used by {t.usage_count} SKU(s)</span>
              <div className="desc">{t.description}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Click-to-edit single-line value (time, quantity). */
function InlineValue({ display, hint, placeholder, initial, onSave, width = 90 }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await onSave(val);
      setEditing(false);
      setError('');
    } catch (err) { setError(err.message); }
    setSaving(false);
  }

  if (!editing) {
    return (
      <button className="ghost inline-edit" title={hint || 'Click to edit'}
        onClick={() => { setVal(initial ?? ''); setError(''); setEditing(true); }}>
        {display}<span className="pencil">✎</span>
      </button>
    );
  }
  return (
    <span className="inline-form">
      <input style={{ width }} autoFocus value={val} placeholder={placeholder}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') setEditing(false); }} />
      <button className="small primary" disabled={saving} onClick={save}>✓</button>
      <button className="ghost small" onClick={() => setEditing(false)}>✕</button>
      {error && <span className="inline-error">{error}</span>}
    </span>
  );
}

/* Click-to-edit multi-line text (name + description together). */
function InlineStepText({ step, isTagged, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const displayName = isTagged ? step.tag_name : step.name;
  const displayDesc = isTagged ? step.tag_description : step.description;

  async function save() {
    setSaving(true);
    try {
      if (isTagged) {
        await api.put(`/api/tags/${step.tag_id}`, { name, description: desc });
      } else {
        await api.put(`/api/steps/${step.id}`, { name, description: desc });
      }
      setEditing(false);
      setError('');
      onSaved();
    } catch (err) { setError(err.message); }
    setSaving(false);
  }

  if (!editing) {
    return (
      <div className="step-text" title="Click to edit" onClick={() => {
        setName(displayName || ''); setDesc(displayDesc || ''); setError(''); setEditing(true);
      }}>
        <strong>{displayName}</strong>{' '}
        {isTagged ? <span className="badge tag">shared</span> : null}{' '}
        {step.is_override ? <span className="badge override" title={`Tag time is ${formatTime(step.tag_time_seconds)}; this SKU uses ${formatTime(step.override_time_seconds)}`}>override</span> : null}{' '}
        {step.needs_review ? <span className="badge review">needs review</span> : null}
        <span className="pencil">✎</span>
        <div className="step-desc">{displayDesc}</div>
      </div>
    );
  }
  return (
    <div>
      {isTagged && (
        <div className="alert warn" style={{ padding: '6px 10px', marginBottom: 8 }}>
          Shared step — saving updates it on <strong>every SKU</strong> that uses it.
        </div>
      )}
      {error && <div className="alert error" style={{ padding: '6px 10px', marginBottom: 8 }}>{error}</div>}
      <input style={{ fontWeight: 600, marginBottom: 6 }} value={name} onChange={e => setName(e.target.value)} placeholder="Step name" />
      <textarea rows={4} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description" />
      <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
        <button className="small primary" disabled={saving} onClick={save}>Save</button>
        <button className="ghost small" onClick={() => setEditing(false)}>Cancel</button>
      </div>
    </div>
  );
}

/* Size-dependent times editor (e.g. rivnut: 3.5 / 4.5–6.5 / 7.5). */
function SizeCell({ step, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  function open() {
    setRows(Object.entries(step.size_times).map(([label, secs]) => ({ label, time: formatTime(secs) })));
    setError('');
    setEditing(true);
  }
  async function save() {
    const obj = {};
    for (const r of rows) if (r.label.trim()) obj[r.label.trim()] = r.time;
    try {
      await api.put(`/api/steps/${step.id}`, { size_times: Object.keys(obj).length ? obj : null });
      setEditing(false);
      onSaved();
    } catch (err) { setError(err.message); }
  }

  if (!editing) {
    return (
      <div>
        <div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>varies by size:</div>
        {Object.entries(step.size_times).map(([label, secs]) => (
          <div key={label} style={{ fontSize: 13 }}><strong>{label}</strong> <span className="time">{formatTime(secs)}</span></div>
        ))}
        <button className="ghost small" onClick={open}>edit sizes</button>
      </div>
    );
  }
  return (
    <div className="inline-form" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      {error && <div className="inline-error">{error}</div>}
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          <input style={{ width: 80 }} placeholder="size" value={r.label}
            onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
          <input style={{ width: 70 }} placeholder="m:ss" value={r.time}
            onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, time: e.target.value } : x))} />
          <button className="ghost small" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="ghost small" onClick={() => setRows([...rows, { label: '', time: '' }])}>+ size</button>
        <button className="small primary" onClick={save}>Save</button>
        <button className="ghost small" onClick={() => setEditing(false)}>Cancel</button>
      </div>
    </div>
  );
}

/* Time / quantity cell: edits the right thing depending on the step kind. */
function TimeCell({ step, onSaved }) {
  const isTagged = !!step.tag_id;
  const usesQuantity = isTagged && step.tag_unit_seconds != null;

  if (!isTagged && step.size_times) return <SizeCell step={step} onSaved={onSaved} />;

  if (usesQuantity) {
    const label = step.tag_unit_label || 'unit';
    return (
      <div>
        <div className="time">{formatTime(step.effective_seconds)}</div>
        <InlineValue
          display={<span className="muted">{step.quantity ?? '—'} {label}{step.quantity === 1 ? '' : 's'} × {formatTime(step.tag_unit_seconds)}</span>}
          hint={`Edit the ${label} count for this SKU`}
          placeholder={`# of ${label}s`}
          width={70}
          initial={step.quantity ?? ''}
          onSave={async v => {
            const n = v === '' ? null : Number(v);
            if (v !== '' && (!Number.isFinite(n) || n < 0)) throw new Error('Enter a number');
            await api.put(`/api/steps/${step.id}`, { quantity: n });
            onSaved();
          }} />
        {step.is_override && (
          <button className="ghost small" title="Remove the manual override and use quantity × unit time"
            onClick={async () => { await api.put(`/api/steps/${step.id}`, { override_time: '' }); onSaved(); }}>
            clear override
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <InlineValue
        display={<span className="time">{formatTime(step.effective_seconds) || '—'}</span>}
        hint={isTagged ? 'Sets an override time for this SKU only' : 'Edit observed time'}
        placeholder="e.g. 4:30"
        initial={step.effective_seconds != null ? formatTime(step.effective_seconds) : ''}
        onSave={async v => {
          await api.put(`/api/steps/${step.id}`, isTagged ? { override_time: v } : { time: v, needs_review: false });
          onSaved();
        }} />
      {isTagged && !step.is_override && <div className="muted" style={{ fontSize: 11 }}>from tag</div>}
      {step.is_override && (
        <button className="ghost small" title={`Remove the override and inherit the tag time (${formatTime(step.tag_time_seconds)})`}
          onClick={async () => { await api.put(`/api/steps/${step.id}`, { override_time: '' }); onSaved(); }}>
          clear override
        </button>
      )}
      {step.needs_review && step.time_raw_text ? <div className="muted" style={{ fontSize: 11 }}>was: “{step.time_raw_text}”</div> : null}
      {!isTagged && (
        <button className="ghost small" title="Give this step different times per sofa size"
          onClick={async () => {
            const base = step.effective_seconds != null ? formatTime(step.effective_seconds) : '';
            await api.put(`/api/steps/${step.id}`, { size_times: { 'small': base, 'medium': base, 'large': base } });
            onSaved();
          }}>± varies by size</button>
      )}
    </div>
  );
}

/* Per-step tag actions: make shared / attach existing / detach. */
function TagActions({ step, onSaved }) {
  const [attaching, setAttaching] = useState(false);
  const [pendingTag, setPendingTag] = useState(null); // per-unit tag waiting for a quantity
  const [qty, setQty] = useState('');
  const [error, setError] = useState('');

  async function makeShared() {
    setError('');
    try {
      await api.post(`/api/steps/${step.id}/make-tag`, {});
      onSaved();
    } catch (err) {
      if (err.status === 409 && err.data?.existing) {
        const t = err.data.existing;
        const timeStr = t.unit_seconds != null ? `${formatTime(t.unit_seconds)}/${t.unit_label || 'unit'}` : formatTime(t.canonical_time_seconds);
        if (window.confirm(`A shared step named "${t.name}" already exists (${timeStr}, used by ${t.usage_count} SKU(s)).\n\nOK = attach this step to that existing shared step\nCancel = create a separate one with the same name`)) {
          await attach(t);
        } else {
          await api.post(`/api/steps/${step.id}/make-tag`, { force: true });
          onSaved();
        }
      } else setError(err.message);
    }
  }

  async function attach(tag, quantity) {
    if (tag.unit_seconds != null && quantity === undefined) {
      setPendingTag(tag);
      setQty('');
      setAttaching(false);
      return;
    }
    setError('');
    try {
      await api.post(`/api/steps/${step.id}/attach-tag`, { tag_id: tag.id, quantity });
      setAttaching(false);
      setPendingTag(null);
      onSaved();
    } catch (err) { setError(err.message); }
  }

  if (step.tag_id) {
    return (
      <button className="ghost small" title="Convert back to a unique step (keeps a copy of the description and current time)"
        onClick={async () => { await api.post(`/api/steps/${step.id}/detach-tag`, {}); onSaved(); }}>
        detach from tag
      </button>
    );
  }

  return (
    <div>
      {error && <div className="inline-error">{error}</div>}
      {pendingTag ? (
        <span className="inline-form">
          <span className="muted" style={{ fontSize: 12 }}>How many {pendingTag.unit_label || 'unit'}s on this SKU?</span>
          <input style={{ width: 64 }} autoFocus value={qty} onChange={e => setQty(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); attach(pendingTag, Number(qty)); } }} />
          <button className="small primary" disabled={!qty || !Number.isFinite(Number(qty))}
            onClick={() => attach(pendingTag, Number(qty))}>✓</button>
          <button className="ghost small" onClick={() => setPendingTag(null)}>✕</button>
        </span>
      ) : attaching ? (
        <div style={{ minWidth: 260 }}>
          <TagSearch autoFocus onSelect={attach} />
          <button className="ghost small" onClick={() => setAttaching(false)}>cancel</button>
        </div>
      ) : (
        <>
          <button className="ghost small" title="Create a new shared step from this step and link it" onClick={makeShared}>make shared</button>{' '}
          <button className="ghost small" title="Link this step to an existing shared step" onClick={() => setAttaching(true)}>attach tag</button>
        </>
      )}
    </div>
  );
}

export default function SkuDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sku, setSku] = useState(null);
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
        <h2 style={{ marginTop: 0 }}>Steps <span className="muted" style={{ fontWeight: 400 }}>— click any text or time to edit it in place</span></h2>
        <table className="data">
          <thead><tr><th style={{ width: 70 }}>#</th><th>Step</th><th style={{ width: 160 }}>Time</th><th style={{ width: 150 }}>Shared step</th><th>Photo</th><th style={{ width: 60 }}></th></tr></thead>
          <tbody>
            {sku.steps.map(step => (
              <tr key={step.id}>
                <td>
                  <strong>{step.sequence}</strong>{' '}
                  <button className="ghost" title="Move up" onClick={() => move(step, -1)}>↑</button>
                  <button className="ghost" title="Move down" onClick={() => move(step, 1)}>↓</button>
                </td>
                <td>
                  <InlineStepText step={step} isTagged={!!step.tag_id} onSaved={load} />
                  {step.station && <div className="muted">Station: {step.station}</div>}
                  {step.parallel_notes && <div className="muted">Parallel: {step.parallel_notes}</div>}
                </td>
                <td><TimeCell step={step} onSaved={load} /></td>
                <td><TagActions step={step} onSaved={load} /></td>
                <td>
                  {step.photos?.length
                    ? step.photos.map(p => <img key={p.id} className="photo-thumb" src={photoSrc(p.file_path)} alt="" style={{ marginRight: 4 }} />)
                    : null}
                  <button className="ghost small" onClick={() => { stepPhotoFor.current = step.id; photoInput.current.click(); }}>+ photo</button>
                </td>
                <td><button className="ghost small" onClick={() => removeStep(step)}>Delete</button></td>
              </tr>
            ))}
            {sku.steps.length === 0 && <tr><td colSpan={6} className="empty">No steps yet — add the first one below.</td></tr>}
          </tbody>
        </table>
      </div>

      <AddStepForm skuId={sku.id} onDone={load} />
    </>
  );
}

function AddStepForm({ skuId, onDone }) {
  const [mode, setMode] = useState('unique'); // unique | newtag | attach
  const [form, setForm] = useState({ name: '', description: '', time: '', station: '', parallel_notes: '' });
  const [selectedTag, setSelectedTag] = useState(null);
  const [override, setOverride] = useState('');
  const [quantity, setQuantity] = useState('');
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
          quantity: selectedTag.unit_seconds != null && quantity !== '' ? Number(quantity) : undefined,
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
      setSelectedTag(null); setOverride(''); setQuantity(''); setSuggestion(null);
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
                <strong>{selectedTag.name}</strong> — {selectedTag.unit_seconds != null
                  ? `${formatTime(selectedTag.unit_seconds)} per ${selectedTag.unit_label || 'unit'}`
                  : formatTime(selectedTag.canonical_time_seconds)}
                {' '}<button type="button" className="small" onClick={() => setSelectedTag(null)}>change</button>
              </div>
            ) : <TagSearch onSelect={setSelectedTag} />}
          </div>
          {selectedTag?.unit_seconds != null ? (
            <div className="field">
              <label>Quantity for this SKU (number of {selectedTag.unit_label || 'unit'}s) *</label>
              <input required value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="e.g. 16" />
            </div>
          ) : (
            <div className="field">
              <label>Time override for this SKU only (optional, e.g. 4:30)</label>
              <input value={override} onChange={e => setOverride(e.target.value)}
                placeholder={selectedTag ? `leave blank to inherit ${formatTime(selectedTag.canonical_time_seconds)}` : 'leave blank to inherit the tag time'} />
            </div>
          )}
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
