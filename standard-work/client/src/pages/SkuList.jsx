import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatTime, photoSrc } from '@backend';

export default function SkuList() {
  const [skus, setSkus] = useState([]);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ sku_number: '', name: '', family: '', description: '' });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => { api.get('/api/skus').then(setSkus); }, []);

  const filtered = skus.filter(s =>
    !search ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.sku_number.toLowerCase().includes(search.toLowerCase()) ||
    (s.family || '').toLowerCase().includes(search.toLowerCase()));

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      const sku = await api.post('/api/skus', form);
      navigate(`/skus/${sku.id}`);
    } catch (err) { setError(err.message); }
  }

  return (
    <>
      <h1>SKUs</h1>
      <p className="subtitle">Look up a SKU to see its full step breakdown, or create a new one.</p>

      <div className="toolbar">
        <input style={{ maxWidth: 320 }} placeholder="Search by SKU number, name, or family…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <div className="spacer" />
        <button className="primary" onClick={() => setCreating(true)}>+ New SKU</button>
      </div>

      <div className="card">
        <table className="data">
          <thead><tr><th>Photo</th><th>SKU</th><th>Name</th><th>Family</th><th>Status</th><th>Steps</th><th>Total time</th></tr></thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id} className="clickable" onClick={() => navigate(`/skus/${s.id}`)}>
                <td>{s.photo_path ? <img className="photo-thumb" src={photoSrc(s.photo_path)} alt="" /> : <span className="muted">—</span>}</td>
                <td>{s.sku_number}</td>
                <td><Link to={`/skus/${s.id}`} onClick={e => e.stopPropagation()}>{s.name}</Link></td>
                <td>{s.family || '—'}</td>
                <td><span className={`badge ${s.status === 'active' ? 'ok' : 'tag'}`}>{s.status}</span></td>
                <td>{s.step_count}</td>
                <td className="time">{formatTime(s.total_seconds)}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={7} className="empty">No SKUs found.</td></tr>}
          </tbody>
        </table>
      </div>

      {creating && (
        <div className="modal-backdrop" onClick={() => setCreating(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>New SKU</h3>
            {error && <div className="alert error">{error}</div>}
            <form onSubmit={create}>
              <div className="row">
                <div className="field">
                  <label>SKU number *</label>
                  <input required value={form.sku_number} onChange={e => setForm({ ...form, sku_number: e.target.value })} />
                </div>
                <div className="field">
                  <label>Family</label>
                  <input value={form.family} onChange={e => setForm({ ...form, family: e.target.value })} placeholder="e.g. Sola Lounge" />
                </div>
              </div>
              <div className="field">
                <label>Name *</label>
                <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="field">
                <label>Description</label>
                <textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <p className="muted">You can add the product photo and steps on the next screen.</p>
              <div className="actions">
                <button type="button" onClick={() => setCreating(false)}>Cancel</button>
                <button type="submit" className="primary">Create & add steps</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
