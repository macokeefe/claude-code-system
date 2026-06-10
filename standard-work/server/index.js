import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import db, { PHOTOS_DIR, EFFECTIVE_TIME_SQL, getSkuSteps, getSkuTotal, recordTimeHistory } from './db.js';
import { parseTime } from '../shared/timeParse.js';
import { parseWorkbook, commitImport } from './importer.js';
import { exportSkuToExcel, printableHtml } from './exporter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '5mb' }));

const uploadTmp = path.join(os.tmpdir(), 'sw-imports');
fs.mkdirSync(uploadTmp, { recursive: true });
const importUpload = multer({ dest: uploadTmp, limits: { fileSize: 250 * 1024 * 1024 } });
const photoUpload = multer({
  storage: multer.diskStorage({
    destination: PHOTOS_DIR,
    filename: (req, file, cb) => cb(null, `${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// Accepts either raw seconds (number) or a time string like "4:30"
function timeInput(value) {
  if (value === null || value === undefined || value === '') return { seconds: null, ambiguous: false };
  if (typeof value === 'number') return { seconds: Math.round(value), ambiguous: false };
  return parseTime(value);
}

/* ---------------- SKUs ---------------- */

app.get('/api/skus', (req, res) => {
  const skus = db.prepare(`
    SELECT k.*,
      (SELECT COUNT(*) FROM sku_steps s WHERE s.sku_id = k.id) AS step_count,
      (SELECT COALESCE(SUM(${EFFECTIVE_TIME_SQL}), 0)
         FROM sku_steps s LEFT JOIN tags t ON t.id = s.tag_id
        WHERE s.sku_id = k.id) AS total_seconds
    FROM skus k ORDER BY k.family, k.name
  `).all();
  res.json(skus);
});

app.post('/api/skus', (req, res) => {
  const { sku_number, name, family, description, status } = req.body;
  if (!sku_number || !name) return res.status(400).json({ error: 'sku_number and name are required' });
  try {
    const info = db.prepare(`INSERT INTO skus (sku_number, name, family, description, status)
                             VALUES (?, ?, ?, ?, ?)`)
      .run(sku_number.trim(), name.trim(), family || null, description || null, status || 'active');
    res.json(db.prepare('SELECT * FROM skus WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: `SKU number "${sku_number}" already exists` });
    throw e;
  }
});

app.get('/api/skus/:id', (req, res) => {
  const sku = db.prepare('SELECT * FROM skus WHERE id = ?').get(req.params.id);
  if (!sku) return res.status(404).json({ error: 'SKU not found' });
  const steps = getSkuSteps(sku.id).map(s => ({
    ...s,
    photos: db.prepare("SELECT * FROM photos WHERE owner_type = 'sku_step' AND owner_id = ? ORDER BY sort_order").all(s.id),
  }));
  res.json({ ...sku, steps, total_seconds: getSkuTotal(sku.id) });
});

app.put('/api/skus/:id', (req, res) => {
  const sku = db.prepare('SELECT * FROM skus WHERE id = ?').get(req.params.id);
  if (!sku) return res.status(404).json({ error: 'SKU not found' });
  const { sku_number, name, family, description, status } = req.body;
  db.prepare(`UPDATE skus SET sku_number = ?, name = ?, family = ?, description = ?, status = ?,
              updated_at = datetime('now') WHERE id = ?`)
    .run(sku_number ?? sku.sku_number, name ?? sku.name, family ?? sku.family,
         description ?? sku.description, status ?? sku.status, sku.id);
  res.json(db.prepare('SELECT * FROM skus WHERE id = ?').get(sku.id));
});

app.delete('/api/skus/:id', (req, res) => {
  db.prepare('DELETE FROM skus WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------------- Steps ---------------- */

app.post('/api/skus/:id/steps', (req, res) => {
  const sku = db.prepare('SELECT id FROM skus WHERE id = ?').get(req.params.id);
  if (!sku) return res.status(404).json({ error: 'SKU not found' });
  const { name, description, time, tag_id, override_time, quantity, station, parallel_notes } = req.body;

  let ownSeconds = null, override = null;
  if (tag_id) {
    const tag = db.prepare('SELECT id FROM tags WHERE id = ?').get(tag_id);
    if (!tag) return res.status(400).json({ error: 'Tag not found' });
    if (override_time !== undefined && override_time !== null && override_time !== '') {
      const t = timeInput(override_time);
      if (t.ambiguous) return res.status(400).json({ error: `Could not parse override time "${override_time}"` });
      override = t.seconds;
    }
  } else {
    if (!name) return res.status(400).json({ error: 'Step name is required' });
    const t = timeInput(time);
    if (t.ambiguous) return res.status(400).json({ error: `Could not parse time "${time}" — use formats like 4:30, 12, or "3 minutes 20 seconds"` });
    ownSeconds = t.seconds;
  }

  const seq = db.prepare('SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM sku_steps WHERE sku_id = ?').get(sku.id).next;
  const info = db.prepare(`
    INSERT INTO sku_steps (sku_id, sequence, tag_id, name, description, time_seconds, override_time_seconds, quantity, station, parallel_notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(sku.id, seq, tag_id || null, name || null, description || null, ownSeconds, override,
         quantity !== undefined && quantity !== null && quantity !== '' ? Number(quantity) : null,
         station || null, parallel_notes || null);
  res.json({ id: info.lastInsertRowid, total_seconds: getSkuTotal(sku.id) });
});

app.put('/api/steps/:id', (req, res) => {
  const step = db.prepare('SELECT * FROM sku_steps WHERE id = ?').get(req.params.id);
  if (!step) return res.status(404).json({ error: 'Step not found' });
  const { name, description, time, override_time, station, parallel_notes, tag_id, quantity, needs_review, note } = req.body;

  let ownSeconds = step.time_seconds;
  if (time !== undefined) {
    const t = timeInput(time);
    if (t.ambiguous) return res.status(400).json({ error: `Could not parse time "${time}"` });
    if (t.seconds !== step.time_seconds) {
      recordTimeHistory('sku_step', step.id, step.time_seconds, t.seconds, note);
      ownSeconds = t.seconds;
    }
  }
  let override = step.override_time_seconds;
  if (override_time !== undefined) {
    const t = timeInput(override_time);
    if (t.ambiguous) return res.status(400).json({ error: `Could not parse override time "${override_time}"` });
    if (t.seconds !== step.override_time_seconds) {
      recordTimeHistory('sku_step', step.id, step.override_time_seconds, t.seconds, note || 'override change');
      override = t.seconds;
    }
  }

  db.prepare(`UPDATE sku_steps SET name = ?, description = ?, time_seconds = ?, override_time_seconds = ?,
              station = ?, parallel_notes = ?, tag_id = ?, quantity = ?, needs_review = ?, updated_at = datetime('now')
              WHERE id = ?`)
    .run(name ?? step.name, description ?? step.description, ownSeconds, override,
         station ?? step.station, parallel_notes ?? step.parallel_notes,
         tag_id !== undefined ? tag_id : step.tag_id,
         quantity !== undefined ? (quantity === null || quantity === '' ? null : Number(quantity)) : step.quantity,
         needs_review !== undefined ? (needs_review ? 1 : 0) : step.needs_review, step.id);
  res.json({ ok: true, total_seconds: getSkuTotal(step.sku_id) });
});

app.delete('/api/steps/:id', (req, res) => {
  const step = db.prepare('SELECT * FROM sku_steps WHERE id = ?').get(req.params.id);
  if (!step) return res.status(404).json({ error: 'Step not found' });
  db.transaction(() => {
    db.prepare('DELETE FROM sku_steps WHERE id = ?').run(step.id);
    db.prepare('UPDATE sku_steps SET sequence = sequence - 1 WHERE sku_id = ? AND sequence > ?')
      .run(step.sku_id, step.sequence);
  })();
  res.json({ ok: true, total_seconds: getSkuTotal(step.sku_id) });
});

// Convert an existing unique step into a new shared step (tag), keeping the
// step linked to it. Duplicate tag names warn (409) unless force is set.
app.post('/api/steps/:id/make-tag', (req, res) => {
  const step = db.prepare(`
    SELECT s.*, ${EFFECTIVE_TIME_SQL} AS effective_seconds
    FROM sku_steps s LEFT JOIN tags t ON t.id = s.tag_id WHERE s.id = ?
  `).get(req.params.id);
  if (!step) return res.status(404).json({ error: 'Step not found' });
  if (step.tag_id) return res.status(400).json({ error: 'Step is already attached to a shared step' });
  if (!step.name) return res.status(400).json({ error: 'Step needs a name before it can become a shared step' });

  const existing = db.prepare('SELECT * FROM tags WHERE lower(trim(name)) = lower(trim(?))').get(step.name);
  if (existing && !req.body?.force) {
    const usage = db.prepare(`SELECT k.id, k.sku_number, k.name FROM sku_steps s JOIN skus k ON k.id = s.sku_id WHERE s.tag_id = ?`).all(existing.id);
    return res.status(409).json({
      error: 'A shared step with this name already exists',
      existing: { ...existing, usage_count: usage.length, used_by: usage },
    });
  }
  const info = db.prepare('INSERT INTO tags (name, description, canonical_time_seconds) VALUES (?, ?, ?)')
    .run(step.name.trim(), step.description || null, step.time_seconds);
  db.prepare(`UPDATE sku_steps SET tag_id = ?, time_seconds = NULL, updated_at = datetime('now') WHERE id = ?`)
    .run(info.lastInsertRowid, step.id);
  res.json({ ok: true, tag_id: info.lastInsertRowid });
});

// Attach an existing tag to an existing step. If the step's own time differs
// from the canonical time, it is kept as a per-SKU override.
app.post('/api/steps/:id/attach-tag', (req, res) => {
  const step = db.prepare('SELECT * FROM sku_steps WHERE id = ?').get(req.params.id);
  if (!step) return res.status(404).json({ error: 'Step not found' });
  if (step.tag_id) return res.status(400).json({ error: 'Step is already attached to a shared step' });
  const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(req.body?.tag_id);
  if (!tag) return res.status(400).json({ error: 'Tag not found' });
  const quantity = req.body?.quantity !== undefined && req.body.quantity !== null && req.body.quantity !== ''
    ? Number(req.body.quantity) : null;
  // With a quantity on a per-unit tag, the time comes from quantity × unit
  // time; otherwise keep the step's own time as an override if it differs.
  const usesQuantity = tag.unit_seconds !== null && quantity !== null;
  const override = (!usesQuantity && step.time_seconds !== null && step.time_seconds !== tag.canonical_time_seconds)
    ? step.time_seconds : null;
  db.prepare(`UPDATE sku_steps SET tag_id = ?, time_seconds = NULL, override_time_seconds = ?, quantity = ?,
              updated_at = datetime('now') WHERE id = ?`).run(tag.id, override, quantity, step.id);
  res.json({ ok: true, became_override: override !== null });
});

// Detach a step from its tag: the step keeps a copy of the effective
// definition and time as a unique step.
app.post('/api/steps/:id/detach-tag', (req, res) => {
  const step = db.prepare('SELECT * FROM sku_steps WHERE id = ?').get(req.params.id);
  if (!step) return res.status(404).json({ error: 'Step not found' });
  if (!step.tag_id) return res.status(400).json({ error: 'Step is not attached to a shared step' });
  // The step keeps whatever its effective time was (override, quantity × unit, or canonical)
  const effective = db.prepare(`
    SELECT ${EFFECTIVE_TIME_SQL} AS eff FROM sku_steps s LEFT JOIN tags t ON t.id = s.tag_id WHERE s.id = ?
  `).get(step.id).eff;
  const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(step.tag_id);
  db.prepare(`UPDATE sku_steps SET tag_id = NULL,
              name = COALESCE(name, ?), description = COALESCE(description, ?),
              time_seconds = ?, override_time_seconds = NULL, quantity = NULL,
              updated_at = datetime('now') WHERE id = ?`)
    .run(tag?.name ?? null, tag?.description ?? null, effective, step.id);
  res.json({ ok: true });
});

app.post('/api/skus/:id/steps/reorder', (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds array required' });
  const update = db.prepare('UPDATE sku_steps SET sequence = ? WHERE id = ? AND sku_id = ?');
  db.transaction(() => {
    orderedIds.forEach((id, i) => update.run(i + 1, id, req.params.id));
  })();
  res.json({ ok: true });
});

/* ---------------- Tags ---------------- */

function tagWithUsage(tag) {
  const usage = db.prepare(`
    SELECT k.id, k.sku_number, k.name, s.override_time_seconds, s.quantity
    FROM sku_steps s JOIN skus k ON k.id = s.sku_id WHERE s.tag_id = ?`).all(tag.id);
  return { ...tag, usage_count: usage.length, used_by: usage };
}

app.get('/api/tags', (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  let tags = db.prepare('SELECT * FROM tags ORDER BY name').all();
  if (q) tags = tags.filter(t => t.name.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q));
  res.json(tags.map(tagWithUsage));
});

app.post('/api/tags', (req, res) => {
  const { name, description, time, unit_time, unit_label, force } = req.body;
  if (!name) return res.status(400).json({ error: 'Tag name is required' });
  const t = timeInput(time);
  if (t.ambiguous) return res.status(400).json({ error: `Could not parse time "${time}"` });
  const u = timeInput(unit_time);
  if (u.ambiguous) return res.status(400).json({ error: `Could not parse per-unit time "${unit_time}"` });

  // Same-name guard: suggest the existing tag, allow creating anyway with force
  const existing = db.prepare('SELECT * FROM tags WHERE lower(trim(name)) = lower(trim(?))').get(name);
  if (existing && !force) {
    return res.status(409).json({
      error: 'A tag with this name already exists',
      existing: tagWithUsage(existing),
      hint: 'Attach the existing tag instead, or pass force=true to create a separate tag with the same name.',
    });
  }
  const info = db.prepare('INSERT INTO tags (name, description, canonical_time_seconds, unit_seconds, unit_label) VALUES (?, ?, ?, ?, ?)')
    .run(name.trim(), description || null, t.seconds, u.seconds, unit_label || null);
  res.json(tagWithUsage(db.prepare('SELECT * FROM tags WHERE id = ?').get(info.lastInsertRowid)));
});

app.get('/api/tags/:id', (req, res) => {
  const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(req.params.id);
  if (!tag) return res.status(404).json({ error: 'Tag not found' });
  res.json(tagWithUsage(tag));
});

// Preview which SKUs a canonical-time change would affect (for the confirmation dialog)
app.get('/api/tags/:id/impact', (req, res) => {
  const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(req.params.id);
  if (!tag) return res.status(404).json({ error: 'Tag not found' });
  const affected = db.prepare(`
    SELECT k.id, k.sku_number, k.name, s.override_time_seconds,
      (SELECT COALESCE(SUM(${EFFECTIVE_TIME_SQL}), 0)
         FROM sku_steps s LEFT JOIN tags t ON t.id = s.tag_id WHERE s.sku_id = k.id) AS current_total
    FROM sku_steps s JOIN skus k ON k.id = s.sku_id WHERE s.tag_id = ?`).all(tag.id);
  res.json({
    tag,
    affected: affected.map(a => ({
      ...a,
      // overridden links don't move when the canonical time changes
      will_change: a.override_time_seconds === null,
    })),
  });
});

app.put('/api/tags/:id', (req, res) => {
  const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(req.params.id);
  if (!tag) return res.status(404).json({ error: 'Tag not found' });
  const { name, description, time, unit_time, unit_label, note } = req.body;
  let seconds = tag.canonical_time_seconds;
  if (time !== undefined) {
    const t = timeInput(time);
    if (t.ambiguous) return res.status(400).json({ error: `Could not parse time "${time}"` });
    if (t.seconds !== tag.canonical_time_seconds) {
      recordTimeHistory('tag', tag.id, tag.canonical_time_seconds, t.seconds, note);
      seconds = t.seconds;
    }
  }
  let unitSeconds = tag.unit_seconds;
  if (unit_time !== undefined) {
    const u = timeInput(unit_time);
    if (u.ambiguous) return res.status(400).json({ error: `Could not parse per-unit time "${unit_time}"` });
    if (u.seconds !== tag.unit_seconds) {
      recordTimeHistory('tag', tag.id, tag.unit_seconds, u.seconds,
        `${note ? note + ' ' : ''}[per-unit time]`);
      unitSeconds = u.seconds;
    }
  }
  db.prepare(`UPDATE tags SET name = ?, description = ?, canonical_time_seconds = ?,
              unit_seconds = ?, unit_label = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(name ?? tag.name, description ?? tag.description, seconds,
         unitSeconds, unit_label !== undefined ? (unit_label || null) : tag.unit_label, tag.id);
  const updated = tagWithUsage(db.prepare('SELECT * FROM tags WHERE id = ?').get(tag.id));
  res.json({ ...updated, affected_skus: updated.used_by.filter(u => u.override_time_seconds === null) });
});

// Deleting an in-use tag is blocked unless steps are detached (each keeps a
// copy of the canonical definition as its own unique step).
app.delete('/api/tags/:id', (req, res) => {
  const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(req.params.id);
  if (!tag) return res.status(404).json({ error: 'Tag not found' });
  const inUse = db.prepare('SELECT COUNT(*) AS n FROM sku_steps WHERE tag_id = ?').get(tag.id).n;
  if (inUse > 0 && req.query.detach !== 'true') {
    return res.status(409).json({
      error: `Tag is used by ${inUse} step(s)`,
      hint: 'Pass ?detach=true to convert those steps to unique steps (copying the tag definition), or reassign them first.',
      usage: tagWithUsage(tag).used_by,
    });
  }
  db.transaction(() => {
    db.prepare(`
      UPDATE sku_steps SET
        name = COALESCE(name, ?), description = COALESCE(description, ?),
        time_seconds = COALESCE(override_time_seconds, ?),
        override_time_seconds = NULL, tag_id = NULL
      WHERE tag_id = ?`).run(tag.name, tag.description, tag.canonical_time_seconds, tag.id);
    db.prepare('DELETE FROM tags WHERE id = ?').run(tag.id);
  })();
  res.json({ ok: true, detached: inUse });
});

/* ---------------- History & stats ---------------- */

app.get('/api/history/:entityType/:id', (req, res) => {
  res.json(db.prepare('SELECT * FROM time_history WHERE entity_type = ? AND entity_id = ? ORDER BY changed_at DESC')
    .all(req.params.entityType, req.params.id));
});

// Aggregate labor time per tag across all SKUs — the best-improvement-target view
app.get('/api/stats/tag-impact', (req, res) => {
  res.json(db.prepare(`
    SELECT t.id, t.name, t.canonical_time_seconds, t.unit_seconds, t.unit_label,
           COUNT(s.id) AS usage_count,
           COALESCE(SUM(COALESCE(s.override_time_seconds,
             CASE WHEN t.unit_seconds IS NOT NULL AND s.quantity IS NOT NULL
                  THEN CAST(ROUND(t.unit_seconds * s.quantity) AS INTEGER)
                  ELSE t.canonical_time_seconds END)), 0) AS aggregate_seconds
    FROM tags t LEFT JOIN sku_steps s ON s.tag_id = t.id
    GROUP BY t.id ORDER BY aggregate_seconds DESC
  `).all());
});

/* ---------------- Photos ---------------- */

app.post('/api/photos', photoUpload.single('photo'), (req, res) => {
  const { owner_type, owner_id } = req.body;
  if (!req.file || !['sku', 'tag', 'sku_step'].includes(owner_type)) {
    return res.status(400).json({ error: 'photo file plus owner_type (sku|tag|sku_step) and owner_id required' });
  }
  db.prepare('INSERT INTO photos (owner_type, owner_id, file_path) VALUES (?, ?, ?)')
    .run(owner_type, owner_id, req.file.filename);
  if (owner_type === 'sku') db.prepare('UPDATE skus SET photo_path = ? WHERE id = ?').run(req.file.filename, owner_id);
  if (owner_type === 'tag') db.prepare('UPDATE tags SET photo_path = ? WHERE id = ?').run(req.file.filename, owner_id);
  if (owner_type === 'sku_step') db.prepare('UPDATE sku_steps SET photo_path = ? WHERE id = ?').run(req.file.filename, owner_id);
  res.json({ file_path: req.file.filename });
});

/* ---------------- Import / export ---------------- */

// Dry-run previews are kept on disk keyed by token so commit can reuse the
// uploaded workbook (for image extraction) without re-uploading.
const pendingImports = new Map();

app.post('/api/import/dry-run', importUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const preview = await parseWorkbook(req.file.path, req.file.originalname);
    const token = crypto.randomBytes(8).toString('hex');
    pendingImports.set(token, req.file.path);
    res.json({ token, ...preview });
  } catch (e) {
    fs.unlink(req.file.path, () => {});
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/import/commit', async (req, res) => {
  const { token, ...preview } = req.body;
  const filePath = pendingImports.get(token);
  if (!filePath) return res.status(400).json({ error: 'Import session expired — run the dry-run again' });
  try {
    const result = await commitImport(preview, filePath);
    pendingImports.delete(token);
    fs.unlink(filePath, () => {});
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/skus/:id/export.xlsx', async (req, res) => {
  const workbook = await exportSkuToExcel(req.params.id);
  if (!workbook) return res.status(404).json({ error: 'SKU not found' });
  const sku = db.prepare('SELECT name FROM skus WHERE id = ?').get(req.params.id);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="SWI - ${sku.name.replace(/[^\w\s-]/g, '')}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

app.get('/api/skus/:id/print', (req, res) => {
  const html = printableHtml(req.params.id);
  if (!html) return res.status(404).send('SKU not found');
  res.send(html);
});

/* ---------------- Static ---------------- */

app.use('/photos', express.static(PHOTOS_DIR));
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api|\/photos).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Standard Work running at http://localhost:${PORT}`);
  if (!fs.existsSync(clientDist)) console.log('(client not built yet — run "npm run setup" once, or "npm run dev" for development)');
});
