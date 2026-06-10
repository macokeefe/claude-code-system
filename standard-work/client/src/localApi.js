// Browser-only backend for the standalone single-file build (locked-down
// machines with no Node.js). Implements the same routes as server/index.js
// against IndexedDB, so the page components are identical in both builds.
import ExcelJS from 'exceljs';
import { parseTime, formatTime } from '../../shared/timeParse.js';
import { parseSwiWorkbook } from '../../shared/swiParse.js';
import { buildPrintableHtml, buildSkuWorkbook } from '../../shared/printTemplate.js';
import { seedTags, seedSkus } from '../../shared/seedData.js';

export { formatTime };
export const isLocal = true;

export function formatLong(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  if (min === 0) return `${sec}s`;
  if (min >= 60) return `${Math.floor(min / 60)}h ${min % 60}m`;
  return sec ? `${min}m ${sec}s` : `${min}m`;
}

/* ---------------- IndexedDB ---------------- */

let idb = null;
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('standard-work', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('kv');
      req.result.createObjectStore('blobs');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbGet(store, key) {
  return new Promise((resolve, reject) => {
    const req = idb.transaction(store).objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbPut(store, key, value) {
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
function idbDelete(store, key) {
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
function idbAllEntries(store) {
  return new Promise((resolve, reject) => {
    const out = [];
    const req = idb.transaction(store).objectStore(store).openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (c) { out.push([c.key, c.value]); c.continue(); }
      else resolve(out);
    };
    req.onerror = () => reject(req.error);
  });
}

/* ---------------- State ---------------- */

let state = null;
const blobUrls = new Map(); // photo key -> object URL
let initPromise = null;

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const nextId = () => state.nextId++;

function freshStateFromSeed() {
  const s = { skus: [], tags: [], steps: [], photos: [], history: [], nextId: 1 };
  const tagIds = {};
  for (const t of seedTags) {
    const id = s.nextId++;
    tagIds[t.name] = id;
    s.tags.push({ id, name: t.name, description: t.description, canonical_time_seconds: t.seconds, photo_path: null, created_at: now(), updated_at: now() });
  }
  for (const sku of seedSkus) {
    const skuId = s.nextId++;
    s.skus.push({ id: skuId, sku_number: sku.sku_number, name: sku.name, family: sku.family, description: sku.description, version: 1, status: 'active', photo_path: null, created_at: now(), updated_at: now() });
    sku.steps.forEach((step, i) => {
      s.steps.push({
        id: s.nextId++, sku_id: skuId, sequence: i + 1,
        tag_id: step.tag ? tagIds[step.tag] : null,
        name: step.name || null, description: step.description || null,
        time_seconds: step.seconds ?? null, time_raw_text: step.raw || null,
        override_time_seconds: step.override ?? null,
        station: null, parallel_notes: step.parallel || null,
        photo_path: null, needs_review: step.needsReview ? 1 : 0,
        created_at: now(), updated_at: now(),
      });
    });
  }
  return s;
}

async function ensureInit() {
  if (!initPromise) {
    initPromise = (async () => {
      idb = await openDb();
      state = await idbGet('kv', 'data');
      if (!state) {
        state = freshStateFromSeed();
        await persist();
      }
      for (const [key, blob] of await idbAllEntries('blobs')) {
        blobUrls.set(key, URL.createObjectURL(blob));
      }
    })();
  }
  return initPromise;
}

const persist = () => idbPut('kv', 'data', state);

async function saveBlob(blob, ext) {
  const key = `photo-${state.nextId++}.${ext || 'png'}`;
  await idbPut('blobs', key, blob);
  blobUrls.set(key, URL.createObjectURL(blob));
  return key;
}

export function photoSrc(filePath) {
  return blobUrls.get(filePath) || '';
}

/* ---------------- Query helpers (mirror server SQL) ---------------- */

const tagById = id => state.tags.find(t => t.id === id);
const skuById = id => state.skus.find(s => s.id === Number(id));

function effectiveSeconds(step) {
  if (step.override_time_seconds !== null && step.override_time_seconds !== undefined) return step.override_time_seconds;
  if (step.tag_id) return tagById(step.tag_id)?.canonical_time_seconds ?? null;
  return step.time_seconds;
}

const skuTotal = skuId =>
  state.steps.filter(s => s.sku_id === skuId).reduce((sum, s) => sum + (effectiveSeconds(s) || 0), 0);

function stepRows(skuId) {
  return state.steps
    .filter(s => s.sku_id === skuId)
    .sort((a, b) => a.sequence - b.sequence)
    .map(s => {
      const tag = s.tag_id ? tagById(s.tag_id) : null;
      return {
        ...s,
        tag_name: tag?.name ?? null,
        tag_description: tag?.description ?? null,
        tag_time_seconds: tag?.canonical_time_seconds ?? null,
        effective_seconds: effectiveSeconds(s),
        is_override: !!(s.tag_id && s.override_time_seconds !== null) ? 1 : 0,
        photos: state.photos.filter(p => p.owner_type === 'sku_step' && p.owner_id === s.id)
          .sort((a, b) => a.sort_order - b.sort_order),
      };
    });
}

function tagWithUsage(tag) {
  const usage = state.steps.filter(s => s.tag_id === tag.id).map(s => {
    const sku = skuById(s.sku_id);
    return { id: sku.id, sku_number: sku.sku_number, name: sku.name, override_time_seconds: s.override_time_seconds };
  });
  return { ...tag, usage_count: usage.length, used_by: usage };
}

function timeInput(value) {
  if (value === null || value === undefined || value === '') return { seconds: null, ambiguous: false };
  if (typeof value === 'number') return { seconds: Math.round(value), ambiguous: false };
  return parseTime(value);
}

function httpError(status, payload) {
  const err = new Error(payload.error || 'Request failed');
  err.status = status;
  err.data = payload;
  throw err;
}

function recordHistory(entityType, entityId, oldSeconds, newSeconds, note) {
  if (oldSeconds === newSeconds) return;
  state.history.push({ id: nextId(), entity_type: entityType, entity_id: entityId, old_seconds: oldSeconds, new_seconds: newSeconds, note: note || null, changed_at: now() });
}

/* ---------------- Route handlers ---------------- */

const pendingImports = new Map(); // token -> ExcelJS workbook

async function handle(method, url, body) {
  await ensureInit();
  const u = new URL(url, 'http://local');
  const path = u.pathname;
  let m;

  /* ----- SKUs ----- */
  if (method === 'GET' && path === '/api/skus') {
    return state.skus
      .map(k => ({ ...k, step_count: state.steps.filter(s => s.sku_id === k.id).length, total_seconds: skuTotal(k.id) }))
      .sort((a, b) => (a.family || '').localeCompare(b.family || '') || a.name.localeCompare(b.name));
  }
  if (method === 'POST' && path === '/api/skus') {
    const { sku_number, name, family, description, status } = body;
    if (!sku_number || !name) httpError(400, { error: 'sku_number and name are required' });
    if (state.skus.some(s => s.sku_number === sku_number.trim())) httpError(409, { error: `SKU number "${sku_number}" already exists` });
    const sku = { id: nextId(), sku_number: sku_number.trim(), name: name.trim(), family: family || null, description: description || null, version: 1, status: status || 'active', photo_path: null, created_at: now(), updated_at: now() };
    state.skus.push(sku);
    await persist();
    return sku;
  }
  if ((m = path.match(/^\/api\/skus\/(\d+)$/))) {
    const sku = skuById(m[1]);
    if (!sku) httpError(404, { error: 'SKU not found' });
    if (method === 'GET') return { ...sku, steps: stepRows(sku.id), total_seconds: skuTotal(sku.id) };
    if (method === 'PUT') {
      Object.assign(sku, {
        sku_number: body.sku_number ?? sku.sku_number, name: body.name ?? sku.name,
        family: body.family ?? sku.family, description: body.description ?? sku.description,
        status: body.status ?? sku.status, updated_at: now(),
      });
      await persist();
      return sku;
    }
    if (method === 'DELETE') {
      const stepIds = state.steps.filter(s => s.sku_id === sku.id).map(s => s.id);
      for (const p of state.photos.filter(p =>
        (p.owner_type === 'sku' && p.owner_id === sku.id) ||
        (p.owner_type === 'sku_step' && stepIds.includes(p.owner_id)))) {
        await idbDelete('blobs', p.file_path);
        blobUrls.delete(p.file_path);
      }
      state.photos = state.photos.filter(p =>
        !((p.owner_type === 'sku' && p.owner_id === sku.id) ||
          (p.owner_type === 'sku_step' && stepIds.includes(p.owner_id))));
      state.steps = state.steps.filter(s => s.sku_id !== sku.id);
      state.skus = state.skus.filter(s => s.id !== sku.id);
      await persist();
      return { ok: true };
    }
  }

  /* ----- Steps ----- */
  if (method === 'POST' && (m = path.match(/^\/api\/skus\/(\d+)\/steps$/))) {
    const sku = skuById(m[1]);
    if (!sku) httpError(404, { error: 'SKU not found' });
    const { name, description, time, tag_id, override_time, station, parallel_notes } = body;
    let ownSeconds = null, override = null;
    if (tag_id) {
      if (!tagById(tag_id)) httpError(400, { error: 'Tag not found' });
      if (override_time !== undefined && override_time !== null && override_time !== '') {
        const t = timeInput(override_time);
        if (t.ambiguous) httpError(400, { error: `Could not parse override time "${override_time}"` });
        override = t.seconds;
      }
    } else {
      if (!name) httpError(400, { error: 'Step name is required' });
      const t = timeInput(time);
      if (t.ambiguous) httpError(400, { error: `Could not parse time "${time}" — use formats like 4:30, 12, or "3 minutes 20 seconds"` });
      ownSeconds = t.seconds;
    }
    const seq = Math.max(0, ...state.steps.filter(s => s.sku_id === sku.id).map(s => s.sequence)) + 1;
    const step = { id: nextId(), sku_id: sku.id, sequence: seq, tag_id: tag_id || null, name: name || null, description: description || null, time_seconds: ownSeconds, time_raw_text: null, override_time_seconds: override, station: station || null, parallel_notes: parallel_notes || null, photo_path: null, needs_review: 0, created_at: now(), updated_at: now() };
    state.steps.push(step);
    await persist();
    return { id: step.id, total_seconds: skuTotal(sku.id) };
  }
  if ((m = path.match(/^\/api\/steps\/(\d+)$/))) {
    const step = state.steps.find(s => s.id === Number(m[1]));
    if (!step) httpError(404, { error: 'Step not found' });
    if (method === 'PUT') {
      const { name, description, time, override_time, station, parallel_notes, tag_id, needs_review, note } = body;
      if (time !== undefined) {
        const t = timeInput(time);
        if (t.ambiguous) httpError(400, { error: `Could not parse time "${time}"` });
        if (t.seconds !== step.time_seconds) {
          recordHistory('sku_step', step.id, step.time_seconds, t.seconds, note);
          step.time_seconds = t.seconds;
        }
      }
      if (override_time !== undefined) {
        const t = timeInput(override_time);
        if (t.ambiguous) httpError(400, { error: `Could not parse override time "${override_time}"` });
        if (t.seconds !== step.override_time_seconds) {
          recordHistory('sku_step', step.id, step.override_time_seconds, t.seconds, note || 'override change');
          step.override_time_seconds = t.seconds;
        }
      }
      Object.assign(step, {
        name: name ?? step.name, description: description ?? step.description,
        station: station ?? step.station, parallel_notes: parallel_notes ?? step.parallel_notes,
        tag_id: tag_id !== undefined ? tag_id : step.tag_id,
        needs_review: needs_review !== undefined ? (needs_review ? 1 : 0) : step.needs_review,
        updated_at: now(),
      });
      await persist();
      return { ok: true, total_seconds: skuTotal(step.sku_id) };
    }
    if (method === 'DELETE') {
      state.steps = state.steps.filter(s => s.id !== step.id);
      state.steps.filter(s => s.sku_id === step.sku_id && s.sequence > step.sequence)
        .forEach(s => { s.sequence -= 1; });
      await persist();
      return { ok: true, total_seconds: skuTotal(step.sku_id) };
    }
  }
  if (method === 'POST' && (m = path.match(/^\/api\/skus\/(\d+)\/steps\/reorder$/))) {
    const skuId = Number(m[1]);
    body.orderedIds.forEach((id, i) => {
      const step = state.steps.find(s => s.id === id && s.sku_id === skuId);
      if (step) step.sequence = i + 1;
    });
    await persist();
    return { ok: true };
  }

  /* ----- Tags ----- */
  if (method === 'GET' && path === '/api/tags') {
    const q = (u.searchParams.get('q') || '').toLowerCase();
    return state.tags
      .filter(t => !q || t.name.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(tagWithUsage);
  }
  if (method === 'POST' && path === '/api/tags') {
    const { name, description, time, force } = body;
    if (!name) httpError(400, { error: 'Tag name is required' });
    const t = timeInput(time);
    if (t.ambiguous) httpError(400, { error: `Could not parse time "${time}"` });
    const existing = state.tags.find(x => x.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (existing && !force) {
      httpError(409, {
        error: 'A tag with this name already exists',
        existing: tagWithUsage(existing),
        hint: 'Attach the existing tag instead, or pass force=true to create a separate tag with the same name.',
      });
    }
    const tag = { id: nextId(), name: name.trim(), description: description || null, canonical_time_seconds: t.seconds, photo_path: null, created_at: now(), updated_at: now() };
    state.tags.push(tag);
    await persist();
    return tagWithUsage(tag);
  }
  if ((m = path.match(/^\/api\/tags\/(\d+)\/impact$/)) && method === 'GET') {
    const tag = tagById(Number(m[1]));
    if (!tag) httpError(404, { error: 'Tag not found' });
    const affected = state.steps.filter(s => s.tag_id === tag.id).map(s => {
      const sku = skuById(s.sku_id);
      return {
        id: sku.id, sku_number: sku.sku_number, name: sku.name,
        override_time_seconds: s.override_time_seconds,
        current_total: skuTotal(sku.id),
        will_change: s.override_time_seconds === null,
      };
    });
    return { tag, affected };
  }
  if ((m = path.match(/^\/api\/tags\/(\d+)$/))) {
    const tag = tagById(Number(m[1]));
    if (!tag) httpError(404, { error: 'Tag not found' });
    if (method === 'GET') return tagWithUsage(tag);
    if (method === 'PUT') {
      const { name, description, time, note } = body;
      if (time !== undefined) {
        const t = timeInput(time);
        if (t.ambiguous) httpError(400, { error: `Could not parse time "${time}"` });
        if (t.seconds !== tag.canonical_time_seconds) {
          recordHistory('tag', tag.id, tag.canonical_time_seconds, t.seconds, note);
          tag.canonical_time_seconds = t.seconds;
        }
      }
      Object.assign(tag, { name: name ?? tag.name, description: description ?? tag.description, updated_at: now() });
      await persist();
      const updated = tagWithUsage(tag);
      return { ...updated, affected_skus: updated.used_by.filter(x => x.override_time_seconds === null) };
    }
    if (method === 'DELETE') {
      const links = state.steps.filter(s => s.tag_id === tag.id);
      if (links.length > 0 && u.searchParams.get('detach') !== 'true') {
        httpError(409, {
          error: `Tag is used by ${links.length} step(s)`,
          hint: 'Pass ?detach=true to convert those steps to unique steps (copying the tag definition), or reassign them first.',
          usage: tagWithUsage(tag).used_by,
        });
      }
      for (const s of links) {
        s.name = s.name ?? tag.name;
        s.description = s.description ?? tag.description;
        s.time_seconds = s.override_time_seconds ?? tag.canonical_time_seconds;
        s.override_time_seconds = null;
        s.tag_id = null;
      }
      state.tags = state.tags.filter(t => t.id !== tag.id);
      await persist();
      return { ok: true, detached: links.length };
    }
  }

  /* ----- History & stats ----- */
  if ((m = path.match(/^\/api\/history\/(tag|sku_step)\/(\d+)$/)) && method === 'GET') {
    return state.history
      .filter(h => h.entity_type === m[1] && h.entity_id === Number(m[2]))
      .sort((a, b) => b.changed_at.localeCompare(a.changed_at));
  }
  if (method === 'GET' && path === '/api/stats/tag-impact') {
    return state.tags.map(t => {
      const links = state.steps.filter(s => s.tag_id === t.id);
      const aggregate = links.reduce((sum, s) => sum + (s.override_time_seconds ?? t.canonical_time_seconds ?? 0), 0);
      return { id: t.id, name: t.name, canonical_time_seconds: t.canonical_time_seconds, usage_count: links.length, aggregate_seconds: aggregate };
    }).sort((a, b) => b.aggregate_seconds - a.aggregate_seconds);
  }

  /* ----- Photos ----- */
  if (method === 'POST' && path === '/api/photos') {
    const file = body.get('photo');
    const ownerType = body.get('owner_type');
    const ownerId = Number(body.get('owner_id'));
    if (!file || !['sku', 'tag', 'sku_step'].includes(ownerType)) {
      httpError(400, { error: 'photo file plus owner_type (sku|tag|sku_step) and owner_id required' });
    }
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const key = await saveBlob(file, ext);
    state.photos.push({ id: nextId(), owner_type: ownerType, owner_id: ownerId, file_path: key, sort_order: 0 });
    if (ownerType === 'sku') skuById(ownerId).photo_path = key;
    if (ownerType === 'tag') tagById(ownerId).photo_path = key;
    if (ownerType === 'sku_step') state.steps.find(s => s.id === ownerId).photo_path = key;
    await persist();
    return { file_path: key };
  }

  /* ----- Import ----- */
  if (method === 'POST' && path === '/api/import/dry-run') {
    const file = body.get('file');
    if (!file) httpError(400, { error: 'No file uploaded' });
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(await file.arrayBuffer());
    } catch (e) {
      httpError(400, { error: `Could not read workbook: ${e.message}` });
    }
    let preview;
    try {
      preview = parseSwiWorkbook(workbook, file.name, state.tags);
    } catch (e) {
      httpError(400, { error: e.message });
    }
    const token = `imp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pendingImports.set(token, workbook);
    return { token, ...preview };
  }
  if (method === 'POST' && path === '/api/import/commit') {
    const { token, ...preview } = body;
    const workbook = pendingImports.get(token);
    if (!workbook) httpError(400, { error: 'Import session expired — run the dry-run again' });
    const media = new Map();
    workbook.model.media?.forEach(x => media.set(String(x.index), x));

    if (state.skus.some(s => s.sku_number === (preview.sku.sku_number || '').trim())) {
      httpError(409, { error: `SKU number "${preview.sku.sku_number}" already exists` });
    }
    const sku = { id: nextId(), sku_number: preview.sku.sku_number.trim() || `IMPORT-${Date.now()}`, name: preview.sku.name, family: preview.sku.family || null, description: preview.sku.description || null, version: preview.sku.version || 1, status: 'active', photo_path: null, created_at: now(), updated_at: now() };
    state.skus.push(sku);

    let seq = 0;
    for (const step of preview.steps) {
      if (step.skip) continue;
      seq += 1;
      const tagId = step.attachTagId || null;
      // When attached to a tag whose canonical time differs, keep this SKU's
      // own observed time as an override so nothing is silently changed.
      let override = null;
      let ownTime = step.timeSeconds;
      if (tagId) {
        const tag = tagById(tagId);
        if (step.timeSeconds !== null && tag && tag.canonical_time_seconds !== step.timeSeconds) override = step.timeSeconds;
        ownTime = null;
      }
      const row = { id: nextId(), sku_id: sku.id, sequence: seq, tag_id: tagId, name: step.name, description: step.description, time_seconds: ownTime, time_raw_text: step.timeRaw || null, override_time_seconds: override, station: null, parallel_notes: step.parallelNotes || null, photo_path: null, needs_review: step.timeAmbiguous ? 1 : 0, created_at: now(), updated_at: now() };
      state.steps.push(row);
      let sort = 0;
      for (const imageId of step.imageIds || []) {
        const x = media.get(String(imageId));
        if (!x || !x.buffer) continue;
        const key = await saveBlob(new Blob([x.buffer]), x.extension || 'png');
        state.photos.push({ id: nextId(), owner_type: 'sku_step', owner_id: row.id, file_path: key, sort_order: sort++ });
        if (!row.photo_path) row.photo_path = key;
      }
    }
    pendingImports.delete(token);
    await persist();
    return { skuId: sku.id, totalSeconds: skuTotal(sku.id) };
  }

  httpError(404, { error: `No local handler for ${method} ${path}` });
}

export const api = {
  get: url => handle('GET', url),
  post: (url, body) => handle('POST', url, body),
  put: (url, body) => handle('PUT', url, body),
  del: url => handle('DELETE', url),
};

/* ---------------- Export / print ---------------- */

export async function downloadExcel(skuId) {
  await ensureInit();
  const sku = skuById(skuId);
  const workbook = buildSkuWorkbook(ExcelJS, { sku, steps: stepRows(sku.id), total: skuTotal(sku.id) });
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `SWI - ${sku.name.replace(/[^\w\s-]/g, '')}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

export async function openPrint(skuId) {
  await ensureInit();
  const sku = skuById(skuId);
  const html = buildPrintableHtml({
    sku, steps: stepRows(sku.id), total: skuTotal(sku.id),
    photoUrls: step => step.photos.map(p => photoSrc(p.file_path)).filter(Boolean),
  });
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}

/* ---------------- Backup / restore ---------------- */

export async function backupData() {
  await ensureInit();
  const blobs = [];
  for (const [key, blob] of await idbAllEntries('blobs')) {
    const buf = await blob.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    blobs.push({ key, type: blob.type, base64: btoa(binary) });
  }
  const payload = JSON.stringify({ version: 1, exportedAt: now(), state, blobs });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
  a.download = `standard-work-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

export async function restoreData(file) {
  await ensureInit();
  const data = JSON.parse(await file.text());
  if (!data.state || !Array.isArray(data.blobs)) throw new Error('Not a valid Standard Work backup file');
  for (const [key] of await idbAllEntries('blobs')) await idbDelete('blobs', key);
  for (const b of data.blobs) {
    const binary = atob(b.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    await idbPut('blobs', b.key, new Blob([bytes], { type: b.type || 'image/png' }));
  }
  state = data.state;
  await persist();
  window.location.reload();
}
