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
    size_times: s.size_times ? JSON.parse(s.size_times) : null,
    depends_on: s.depends_on ? JSON.parse(s.depends_on) : [],
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
  const { name, description, time, override_time, station, parallel_notes, tag_id, quantity, size_times, depends_on, needs_review, note } = req.body;

  // depends_on: array of step ids that must finish first. Guard self-ref and
  // cycles using the SKU's current graph.
  let dependsJson = step.depends_on;
  if (depends_on !== undefined) {
    const sibs = db.prepare('SELECT id, depends_on FROM sku_steps WHERE sku_id = ?').get
      ? db.prepare('SELECT id, depends_on FROM sku_steps WHERE sku_id = ?').all(step.sku_id)
      : [];
    const graph = sibs.map(r => ({ id: r.id, depends_on: r.depends_on ? JSON.parse(r.depends_on) : [] }));
    const clean = [...new Set((depends_on || []).map(Number))].filter(d => d !== step.id && graph.some(g => g.id === d));
    // Apply tentatively and check for cycles from this step.
    const gById = new Map(graph.map(g => [g.id, g]));
    if (gById.has(step.id)) gById.get(step.id).depends_on = clean;
    const reaches = (from, target) => {
      const seen = new Set(); const stack = [...((gById.get(from)?.depends_on) || [])];
      while (stack.length) { const c = stack.pop(); if (c === target) return true; if (seen.has(c)) continue; seen.add(c); stack.push(...((gById.get(c)?.depends_on) || [])); }
      return false;
    };
    if (reaches(step.id, step.id)) return res.status(400).json({ error: 'That dependency would create a cycle' });
    dependsJson = clean.length ? JSON.stringify(clean) : null;
  }

  // size_times: object {label: "m:ss"|seconds} → stored as JSON of integer
  // seconds. A representative size also sets the step's own time_seconds so
  // the stored SKU total stays sensible. null/empty clears it.
  let sizeTimesJson = step.size_times;
  let sizeDefault = null;
  if (size_times !== undefined) {
    if (!size_times || Object.keys(size_times).length === 0) {
      sizeTimesJson = null;
    } else {
      const parsed = {};
      for (const [label, val] of Object.entries(size_times)) {
        const t = timeInput(val);
        if (t.ambiguous) return res.status(400).json({ error: `Could not parse time "${val}" for size "${label}"` });
        if (t.seconds !== null) parsed[label] = t.seconds;
      }
      sizeTimesJson = JSON.stringify(parsed);
      const vals = Object.values(parsed);
      if (vals.length) sizeDefault = vals[Math.floor((vals.length - 1) / 2)]; // middle bucket
    }
  }

  let ownSeconds = step.time_seconds;
  if (size_times !== undefined && sizeDefault !== null && time === undefined) ownSeconds = sizeDefault;
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
              station = ?, parallel_notes = ?, tag_id = ?, quantity = ?, size_times = ?, depends_on = ?, needs_review = ?, updated_at = datetime('now')
              WHERE id = ?`)
    .run(name ?? step.name, description ?? step.description, ownSeconds, override,
         station ?? step.station, parallel_notes ?? step.parallel_notes,
         tag_id !== undefined ? tag_id : step.tag_id,
         quantity !== undefined ? (quantity === null || quantity === '' ? null : Number(quantity)) : step.quantity,
         sizeTimesJson, dependsJson,
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
    // Prune the deleted step from siblings' dependency lists.
    for (const sib of db.prepare('SELECT id, depends_on FROM sku_steps WHERE sku_id = ? AND depends_on IS NOT NULL').all(step.sku_id)) {
      const deps = JSON.parse(sib.depends_on).filter(d => d !== step.id);
      db.prepare('UPDATE sku_steps SET depends_on = ? WHERE id = ?').run(deps.length ? JSON.stringify(deps) : null, sib.id);
    }
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

/* ---------------- Solutions (improvement what-ifs) ---------------- */

function solutionWithTargets(sol) {
  const targets = db.prepare('SELECT * FROM solution_targets WHERE solution_id = ?').all(sol.id).map(t => {
    if (t.target_type === 'tag') {
      const tag = db.prepare('SELECT name, unit_seconds, unit_label, canonical_time_seconds FROM tags WHERE id = ?').get(t.target_id);
      return { ...t, label: tag ? tag.name : '(deleted tag)', is_unit: !!tag?.unit_seconds };
    }
    const step = db.prepare(`
      SELECT s.name, s.sku_id, t.name AS tag_name, k.sku_number FROM sku_steps s
      LEFT JOIN tags t ON t.id = s.tag_id JOIN skus k ON k.id = s.sku_id WHERE s.id = ?`).get(t.target_id);
    return { ...t, label: step ? `${step.tag_name || step.name} (${step.sku_number})` : '(deleted step)' };
  });
  return { ...sol, targets };
}

app.get('/api/solutions', (req, res) => {
  res.json(db.prepare('SELECT * FROM solutions ORDER BY id DESC').all().map(solutionWithTargets));
});

app.post('/api/solutions', (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Solution name is required' });
  const info = db.prepare('INSERT INTO solutions (name, description) VALUES (?, ?)').run(name.trim(), description || null);
  res.json(solutionWithTargets(db.prepare('SELECT * FROM solutions WHERE id = ?').get(info.lastInsertRowid)));
});

app.put('/api/solutions/:id', (req, res) => {
  const sol = db.prepare('SELECT * FROM solutions WHERE id = ?').get(req.params.id);
  if (!sol) return res.status(404).json({ error: 'Solution not found' });
  const { name, description, status } = req.body;
  db.prepare('UPDATE solutions SET name = ?, description = ?, status = ? WHERE id = ?')
    .run(name ?? sol.name, description ?? sol.description, status ?? sol.status, sol.id);
  res.json(solutionWithTargets(db.prepare('SELECT * FROM solutions WHERE id = ?').get(sol.id)));
});

app.delete('/api/solutions/:id', (req, res) => {
  db.prepare('DELETE FROM solutions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/solutions/:id/targets', (req, res) => {
  const sol = db.prepare('SELECT id FROM solutions WHERE id = ?').get(req.params.id);
  if (!sol) return res.status(404).json({ error: 'Solution not found' });
  const { target_type, target_id, mode, value } = req.body;
  if (!['tag', 'sku_step'].includes(target_type) || !['percent', 'seconds'].includes(mode)) {
    return res.status(400).json({ error: 'target_type must be tag|sku_step and mode percent|seconds' });
  }
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return res.status(400).json({ error: 'Savings value must be a positive number' });
  if (mode === 'percent' && v >= 100) return res.status(400).json({ error: 'Percent savings must be under 100' });
  const info = db.prepare('INSERT INTO solution_targets (solution_id, target_type, target_id, mode, value) VALUES (?, ?, ?, ?, ?)')
    .run(sol.id, target_type, Number(target_id), mode, v);
  res.json({ id: info.lastInsertRowid });
});

app.delete('/api/solutions/:sid/targets/:tid', (req, res) => {
  db.prepare('DELETE FROM solution_targets WHERE id = ? AND solution_id = ?').run(req.params.tid, req.params.sid);
  res.json({ ok: true });
});

// Install a solution: write the reduced times into the real data (with
// history entries noting the solution) and mark it installed.
app.post('/api/solutions/:id/apply', (req, res) => {
  const sol = db.prepare('SELECT * FROM solutions WHERE id = ?').get(req.params.id);
  if (!sol) return res.status(404).json({ error: 'Solution not found' });
  const targets = db.prepare('SELECT * FROM solution_targets WHERE solution_id = ?').all(sol.id);
  const note = `solution installed: ${sol.name}`;
  const cut = (secs, t) => secs == null ? null
    : Math.max(0, t.mode === 'percent' ? Math.round(secs * (1 - t.value / 100)) : Math.round(secs - t.value));

  db.transaction(() => {
    for (const t of targets) {
      if (t.target_type === 'tag') {
        const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(t.target_id);
        if (!tag) continue;
        // Per-unit tags: 'seconds' savings are per unit; fixed tags: off the canonical.
        const newUnit = tag.unit_seconds != null ? cut(tag.unit_seconds, t) : tag.unit_seconds;
        const newCanon = tag.unit_seconds == null ? cut(tag.canonical_time_seconds, t) : tag.canonical_time_seconds;
        if (newUnit !== tag.unit_seconds) recordTimeHistory('tag', tag.id, tag.unit_seconds, newUnit, `${note} [per-unit time]`);
        if (newCanon !== tag.canonical_time_seconds) recordTimeHistory('tag', tag.id, tag.canonical_time_seconds, newCanon, note);
        db.prepare('UPDATE tags SET unit_seconds = ?, canonical_time_seconds = ?, updated_at = datetime(\'now\') WHERE id = ?')
          .run(newUnit, newCanon, tag.id);
      } else {
        const step = db.prepare('SELECT * FROM sku_steps WHERE id = ?').get(t.target_id);
        if (!step) continue;
        if (step.tag_id && step.override_time_seconds == null) continue; // inherits a tag; target the tag instead
        const field = step.tag_id ? 'override_time_seconds' : 'time_seconds';
        const oldV = step[field];
        const newV = cut(oldV, t);
        if (newV !== oldV) recordTimeHistory('sku_step', step.id, oldV, newV, note);
        let sizeTimes = step.size_times;
        if (sizeTimes) {
          const parsed = JSON.parse(sizeTimes);
          for (const k of Object.keys(parsed)) parsed[k] = cut(parsed[k], t);
          sizeTimes = JSON.stringify(parsed);
        }
        db.prepare(`UPDATE sku_steps SET ${field} = ?, size_times = ?, updated_at = datetime('now') WHERE id = ?`)
          .run(newV, sizeTimes, step.id);
      }
    }
    db.prepare("UPDATE solutions SET status = 'installed' WHERE id = ?").run(sol.id);
  })();
  res.json({ ok: true });
});

/* ---------------- Operators ---------------- */

app.get('/api/operators', (req, res) => {
  res.json(db.prepare('SELECT * FROM operators ORDER BY sort_order, id').all());
});

app.post('/api/operators', (req, res) => {
  const { name, skills } = req.body;
  if (!name) return res.status(400).json({ error: 'Operator name is required' });
  const next = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM operators').get().n;
  const info = db.prepare('INSERT INTO operators (name, skills, sort_order) VALUES (?, ?, ?)')
    .run(name.trim(), skills || null, next);
  res.json(db.prepare('SELECT * FROM operators WHERE id = ?').get(info.lastInsertRowid));
});

app.put('/api/operators/:id', (req, res) => {
  const op = db.prepare('SELECT * FROM operators WHERE id = ?').get(req.params.id);
  if (!op) return res.status(404).json({ error: 'Operator not found' });
  const { name, skills, active } = req.body;
  db.prepare('UPDATE operators SET name = ?, skills = ?, active = ? WHERE id = ?')
    .run(name ?? op.name, skills !== undefined ? (skills || null) : op.skills,
         active !== undefined ? (active ? 1 : 0) : op.active, op.id);
  res.json(db.prepare('SELECT * FROM operators WHERE id = ?').get(op.id));
});

app.delete('/api/operators/:id', (req, res) => {
  db.prepare('DELETE FROM operators WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
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
