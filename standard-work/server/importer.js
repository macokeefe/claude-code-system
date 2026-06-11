import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import db, { PHOTOS_DIR, getSkuTotal } from './db.js';
import { parseSwiWorkbook, normalize } from '../shared/swiParse.js';

export async function parseWorkbook(filePath, originalName) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const tags = db.prepare('SELECT id, name, description, canonical_time_seconds FROM tags').all();
  return parseSwiWorkbook(workbook, originalName || path.basename(filePath), tags);
}

// Commit a (possibly user-edited) dry-run preview. `filePath` is the temp
// upload kept around between dry-run and commit so images can be extracted.
export async function commitImport(preview, filePath) {
  const workbook = new ExcelJS.Workbook();
  let media = new Map();
  if (filePath && fs.existsSync(filePath)) {
    await workbook.xlsx.readFile(filePath);
    workbook.model.media?.forEach(m => media.set(String(m.index), m));
  }

  const saveImage = (imageId, label) => {
    const m = media.get(String(imageId));
    if (!m || !m.buffer) return null;
    const ext = m.extension || 'png';
    const name = `${label}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(PHOTOS_DIR, name), m.buffer);
    return name;
  };

  const insertSku = db.prepare(`INSERT INTO skus (sku_number, name, family, description, version) VALUES (?, ?, ?, ?, ?)`);
  const insertStep = db.prepare(`
    INSERT INTO sku_steps (sku_id, sequence, tag_id, name, description, time_seconds,
                           time_raw_text, override_time_seconds, parallel_notes, photo_path, needs_review)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertPhoto = db.prepare(`INSERT INTO photos (owner_type, owner_id, file_path, sort_order) VALUES (?, ?, ?, ?)`);

  const result = db.transaction(() => {
    const skuNumber = preview.sku.sku_number?.trim() || `IMPORT-${Date.now()}`;
    const info = insertSku.run(skuNumber, preview.sku.name, preview.sku.family || null,
      preview.sku.description || null, preview.sku.version || 1);
    const skuId = info.lastInsertRowid;

    preview.steps.forEach((step, i) => {
      if (step.skip) return;
      const tagId = step.attachTagId || null;
      // When attached to a tag whose canonical time differs, keep this SKU's
      // own observed time as an override so nothing is silently changed.
      let override = null;
      let ownTime = step.timeSeconds;
      if (tagId) {
        const tag = db.prepare('SELECT canonical_time_seconds FROM tags WHERE id = ?').get(tagId);
        if (step.timeSeconds !== null && tag && tag.canonical_time_seconds !== step.timeSeconds) {
          override = step.timeSeconds;
        }
        ownTime = null;
      }
      const stepInfo = insertStep.run(skuId, i + 1, tagId, step.name, step.description,
        ownTime, step.timeRaw || null, override, step.parallelNotes || null, null,
        step.timeAmbiguous ? 1 : 0);
      const stepId = stepInfo.lastInsertRowid;
      (step.imageIds || []).forEach((imageId, j) => {
        const file = saveImage(imageId, `step-${skuId}-${i + 1}`);
        if (file) {
          insertPhoto.run('sku_step', stepId, file, j);
          if (j === 0) db.prepare('UPDATE sku_steps SET photo_path = ? WHERE id = ?').run(file, stepId);
        }
      });
    });
    return skuId;
  })();

  return { skuId: result, totalSeconds: getSkuTotal(result) };
}

// Extract the embedded step photos from a workbook and attach them to an
// existing SKU's steps — matched by step name, falling back to row order.
// Does NOT create a SKU or change times. Returns a per-step report.
export async function attachPhotosToSku(skuId, filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const parsed = parseSwiWorkbook(workbook, '', []);
  const media = new Map();
  workbook.model.media?.forEach(m => media.set(String(m.index), m));

  const existing = db.prepare(`
    SELECT s.id, s.sequence, s.name, t.name AS tag_name
    FROM sku_steps s LEFT JOIN tags t ON t.id = s.tag_id
    WHERE s.sku_id = ? ORDER BY s.sequence`).all(skuId);

  const saveImage = (imageId, label) => {
    const m = media.get(String(imageId));
    if (!m || !m.buffer) return null;
    const ext = m.extension || 'png';
    const name = `${label}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(PHOTOS_DIR, name), m.buffer);
    return name;
  };
  const insertPhoto = db.prepare('INSERT INTO photos (owner_type, owner_id, file_path, sort_order) VALUES (?, ?, ?, ?)');

  const used = new Set();
  const report = [];
  let attached = 0;
  const withImages = parsed.steps.filter(p => p.imageIds && p.imageIds.length);

  db.transaction(() => {
    withImages.forEach((ps, idx) => {
      const pn = normalize(ps.name);
      let target = existing.find(e => !used.has(e.id) && normalize(e.tag_name || e.name) === pn)
        || existing.find((e, i) => !used.has(e.id) && i === idx)
        || existing.find(e => !used.has(e.id));
      if (!target) return;
      used.add(target.id);
      let first = true;
      const start = db.prepare("SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM photos WHERE owner_type='sku_step' AND owner_id=?").get(target.id).n;
      ps.imageIds.forEach((imageId, j) => {
        const file = saveImage(imageId, `step-${skuId}-${target.sequence}`);
        if (!file) return;
        insertPhoto.run('sku_step', target.id, file, start + j);
        if (first) { db.prepare('UPDATE sku_steps SET photo_path = COALESCE(photo_path, ?) WHERE id = ?').run(file, target.id); first = false; }
        attached++;
      });
      report.push({ sequence: target.sequence, name: target.tag_name || target.name, count: ps.imageIds.length });
    });
  })();

  return { attached, report, imageCount: parsed.imageCount };
}
