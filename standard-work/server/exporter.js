import ExcelJS from 'exceljs';
import db, { getSkuSteps, getSkuTotal } from './db.js';
import { buildPrintableHtml, buildSkuWorkbook } from '../shared/printTemplate.js';

export async function exportSkuToExcel(skuId) {
  const sku = db.prepare('SELECT * FROM skus WHERE id = ?').get(skuId);
  if (!sku) return null;
  return buildSkuWorkbook(ExcelJS, { sku, steps: getSkuSteps(skuId), total: getSkuTotal(skuId) });
}

export function printableHtml(skuId) {
  const sku = db.prepare('SELECT * FROM skus WHERE id = ?').get(skuId);
  if (!sku) return null;
  const photosFor = db.prepare("SELECT file_path FROM photos WHERE owner_type = 'sku_step' AND owner_id = ? ORDER BY sort_order");
  return buildPrintableHtml({
    sku,
    steps: getSkuSteps(skuId),
    total: getSkuTotal(skuId),
    photoUrls: step => photosFor.all(step.id).map(p => `/photos/${encodeURIComponent(p.file_path)}`),
  });
}
