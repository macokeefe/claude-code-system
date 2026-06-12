import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { normalizeSizeTimes } from '../shared/sizeKeys.js';
import { seedDeps, PRECEDENCE_VERSION } from '../shared/seedData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, '..', 'data');
export const PHOTOS_DIR = path.join(DATA_DIR, 'photos');
fs.mkdirSync(PHOTOS_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'standard-work.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS skus (
  id INTEGER PRIMARY KEY,
  sku_number TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  family TEXT,
  description TEXT,
  version INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active',
  photo_path TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  canonical_time_seconds INTEGER,
  unit_seconds INTEGER,
  unit_label TEXT,
  photo_path TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sku_steps (
  id INTEGER PRIMARY KEY,
  sku_id INTEGER NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  tag_id INTEGER REFERENCES tags(id),
  name TEXT,
  description TEXT,
  time_seconds INTEGER,
  time_raw_text TEXT,
  override_time_seconds INTEGER,
  quantity REAL,
  station TEXT,
  parallel_notes TEXT,
  photo_path TEXT,
  needs_review INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('sku','tag','sku_step')),
  owner_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS time_history (
  id INTEGER PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('tag','sku_step')),
  entity_id INTEGER NOT NULL,
  old_seconds INTEGER,
  new_seconds INTEGER,
  note TEXT,
  changed_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS solutions (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'idea',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS solution_targets (
  id INTEGER PRIMARY KEY,
  solution_id INTEGER NOT NULL REFERENCES solutions(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('tag','sku_step')),
  target_id INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('percent','seconds')),
  value REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS operators (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  skills TEXT,
  active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workflows (
  id INTEGER PRIMARY KEY,
  sku_id INTEGER NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  size TEXT,
  deps TEXT,
  line TEXT,
  metrics TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_steps_sku ON sku_steps(sku_id, sequence);
CREATE INDEX IF NOT EXISTS idx_steps_tag ON sku_steps(tag_id);
CREATE INDEX IF NOT EXISTS idx_history ON time_history(entity_type, entity_id);
`);

// Older databases predate the quantity/per-unit columns — add them in place.
for (const stmt of [
  'ALTER TABLE tags ADD COLUMN unit_seconds INTEGER',
  'ALTER TABLE tags ADD COLUMN unit_label TEXT',
  'ALTER TABLE sku_steps ADD COLUMN quantity REAL',
  'ALTER TABLE sku_steps ADD COLUMN size_times TEXT',
  'ALTER TABLE sku_steps ADD COLUMN depends_on TEXT',
  'ALTER TABLE sku_steps ADD COLUMN helpable INTEGER DEFAULT 0',
  'ALTER TABLE sku_steps ADD COLUMN help_seconds INTEGER',
]) {
  try { db.exec(stmt); } catch { /* column already exists */ }
}

// Re-apply corrected build-order precedence to seeded Sola SKUs once.
if (db.pragma('user_version', { simple: true }) < PRECEDENCE_VERSION) {
  for (const [skuNumber, map] of Object.entries(seedDeps)) {
    const sku = db.prepare('SELECT id FROM skus WHERE sku_number = ?').get(skuNumber);
    if (!sku) continue;
    const steps = db.prepare('SELECT id, sequence FROM sku_steps WHERE sku_id = ?').all(sku.id);
    const seqToId = {}; steps.forEach(s => { seqToId[s.sequence] = s.id; });
    for (const s of steps) {
      const ids = (map[s.sequence] || []).map(q => seqToId[q]).filter(Boolean);
      db.prepare('UPDATE sku_steps SET depends_on = ? WHERE id = ?').run(ids.length ? JSON.stringify(ids) : null, s.id);
    }
  }
  db.pragma(`user_version = ${PRECEDENCE_VERSION}`);
}

// One-time cleanup: collapse legacy size labels (small/medium/large, hyphen
// variants) to the three canonical keys so pickers never show duplicates.
for (const row of db.prepare('SELECT id, size_times FROM sku_steps WHERE size_times IS NOT NULL').all()) {
  const normalized = normalizeSizeTimes(JSON.parse(row.size_times));
  const json = normalized ? JSON.stringify(normalized) : null;
  if (json !== row.size_times) db.prepare('UPDATE sku_steps SET size_times = ? WHERE id = ?').run(json, row.id);
}

// Effective time for a step:
//   per-SKU override → quantity × tag unit time → tag canonical → own time.
export const EFFECTIVE_TIME_SQL = `
  COALESCE(s.override_time_seconds,
           CASE WHEN s.tag_id IS NOT NULL THEN
             CASE WHEN t.unit_seconds IS NOT NULL AND s.quantity IS NOT NULL
                  THEN CAST(ROUND(t.unit_seconds * s.quantity) AS INTEGER)
                  ELSE t.canonical_time_seconds END
           ELSE s.time_seconds END)
`;

export function getSkuSteps(skuId) {
  return db.prepare(`
    SELECT s.*, t.name AS tag_name, t.description AS tag_description,
           t.canonical_time_seconds AS tag_time_seconds,
           t.unit_seconds AS tag_unit_seconds, t.unit_label AS tag_unit_label,
           ${EFFECTIVE_TIME_SQL} AS effective_seconds,
           (s.tag_id IS NOT NULL AND s.override_time_seconds IS NOT NULL) AS is_override
    FROM sku_steps s LEFT JOIN tags t ON t.id = s.tag_id
    WHERE s.sku_id = ? ORDER BY s.sequence
  `).all(skuId);
}

export function getSkuTotal(skuId) {
  return db.prepare(`
    SELECT COALESCE(SUM(${EFFECTIVE_TIME_SQL}), 0) AS total
    FROM sku_steps s LEFT JOIN tags t ON t.id = s.tag_id
    WHERE s.sku_id = ?
  `).get(skuId).total;
}

export function recordTimeHistory(entityType, entityId, oldSeconds, newSeconds, note) {
  if (oldSeconds === newSeconds) return;
  db.prepare(`INSERT INTO time_history (entity_type, entity_id, old_seconds, new_seconds, note)
              VALUES (?, ?, ?, ?, ?)`).run(entityType, entityId, oldSeconds, newSeconds, note || null);
}

export default db;
