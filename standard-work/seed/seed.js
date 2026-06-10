// Seeds the SQLite database from shared/seedData.js (the data extracted from
// the two Sola Lounge SWI workbooks). The standalone browser build seeds
// itself from the same module on first run.
import db, { getSkuTotal } from '../server/db.js';
import { seedTags, seedSkus } from '../shared/seedData.js';

const existing = db.prepare('SELECT COUNT(*) AS n FROM skus').get().n;
if (existing > 0) {
  console.log(`Database already has ${existing} SKU(s) — seed skipped. Delete data/standard-work.db to reseed.`);
  process.exit(0);
}

const insertTag = db.prepare('INSERT INTO tags (name, description, canonical_time_seconds, unit_seconds, unit_label) VALUES (?, ?, ?, ?, ?)');
const insertSku = db.prepare('INSERT INTO skus (sku_number, name, family, description, version) VALUES (?, ?, ?, ?, ?)');
const insertStep = db.prepare(`
  INSERT INTO sku_steps (sku_id, sequence, tag_id, name, description, time_seconds, time_raw_text,
                         override_time_seconds, quantity, parallel_notes, needs_review)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

db.transaction(() => {
  const tagIds = {};
  for (const tag of seedTags) {
    tagIds[tag.name] = insertTag.run(tag.name, tag.description, tag.seconds,
      tag.unitSeconds ?? null, tag.unitLabel ?? null).lastInsertRowid;
  }

  for (const sku of seedSkus) {
    const skuId = insertSku.run(sku.sku_number, sku.name, sku.family, sku.description, 1).lastInsertRowid;
    sku.steps.forEach((step, i) => {
      insertStep.run(skuId, i + 1,
        step.tag ? tagIds[step.tag] : null,
        step.name || null, step.description || null,
        step.seconds ?? null, step.raw || null,
        step.override ?? null, step.quantity ?? null, step.parallel || null,
        step.needsReview ? 1 : 0);
    });
  }

  console.log('Seeded:');
  for (const sku of db.prepare('SELECT * FROM skus').all()) {
    const total = getSkuTotal(sku.id);
    console.log(`  ${sku.sku_number}  ${sku.name}  — total ${Math.floor(total / 60)}m ${total % 60}s`);
  }
  console.log(`  ${db.prepare('SELECT COUNT(*) AS n FROM tags').get().n} shared tags`);
})();
