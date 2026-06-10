import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import db, { PHOTOS_DIR, getSkuSteps, getSkuTotal } from './db.js';
import { formatTime } from './timeParse.js';

export async function exportSkuToExcel(skuId) {
  const sku = db.prepare('SELECT * FROM skus WHERE id = ?').get(skuId);
  if (!sku) return null;
  const steps = getSkuSteps(skuId);
  const total = getSkuTotal(skuId);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Standard Work', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  sheet.columns = [
    { header: '#', key: 'seq', width: 5 },
    { header: 'Step', key: 'name', width: 30 },
    { header: 'Operation', key: 'desc', width: 80 },
    { header: 'Time', key: 'time', width: 10 },
    { header: 'Shared', key: 'shared', width: 24 },
    { header: 'Parallel?', key: 'parallel', width: 24 },
  ];

  sheet.spliceRows(1, 0, [], [], []);
  sheet.getCell('A1').value = `Standard Work Instruction — ${sku.name}`;
  sheet.getCell('A1').font = { size: 16, bold: true };
  sheet.getCell('A2').value = `SKU ${sku.sku_number}  ·  ${sku.family || ''}  ·  Version ${sku.version}`;
  sheet.getCell('A3').value = `Total labor time: ${formatTime(total)}`;
  sheet.getCell('A3').font = { bold: true };

  const headerRow = sheet.getRow(4);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };

  for (const step of steps) {
    const row = sheet.addRow({
      seq: step.sequence,
      name: step.tag_id ? (step.tag_name || step.name) : step.name,
      desc: step.tag_id ? (step.tag_description || step.description) : step.description,
      time: formatTime(step.effective_seconds),
      shared: step.tag_id ? (step.is_override ? `Tag: ${step.tag_name} (override)` : `Tag: ${step.tag_name}`) : '',
      parallel: step.parallel_notes || '',
    });
    row.alignment = { vertical: 'top', wrapText: true };
  }
  return workbook;
}

export function printableHtml(skuId) {
  const sku = db.prepare('SELECT * FROM skus WHERE id = ?').get(skuId);
  if (!sku) return null;
  const steps = getSkuSteps(skuId);
  const total = getSkuTotal(skuId);
  const photosFor = db.prepare("SELECT file_path FROM photos WHERE owner_type = 'sku_step' AND owner_id = ? ORDER BY sort_order");

  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const rows = steps.map(step => {
    const name = step.tag_id ? (step.tag_name || step.name) : step.name;
    const desc = step.tag_id ? (step.tag_description || step.description) : step.description;
    const photos = photosFor.all(step.id)
      .map(p => `<img src="/photos/${esc(p.file_path)}" alt="">`).join('');
    const badge = step.tag_id
      ? `<span class="badge${step.is_override ? ' override' : ''}">${step.is_override ? 'shared · override' : 'shared'}</span>` : '';
    return `<tr>
      <td class="seq">${step.sequence}</td>
      <td><strong>${esc(name)}</strong> ${badge}<div class="desc">${esc(desc)}</div></td>
      <td class="time">${formatTime(step.effective_seconds) || '—'}</td>
      <td class="photos">${photos}</td>
    </tr>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8">
<title>SWI — ${esc(sku.name)}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; margin: 32px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: #555; margin-bottom: 4px; }
  .total { font-size: 16px; font-weight: 700; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; vertical-align: top; font-size: 13px; }
  th { background: #f2f2f2; }
  .seq { width: 32px; text-align: center; font-weight: 700; }
  .time { width: 64px; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .desc { margin-top: 4px; white-space: pre-wrap; }
  .photos { width: 220px; } .photos img { max-width: 200px; max-height: 140px; display: block; margin-bottom: 6px; }
  .badge { font-size: 10px; background: #e7f0fe; color: #1a56b0; border-radius: 3px; padding: 1px 6px; vertical-align: middle; }
  .badge.override { background: #fdf0e0; color: #9a5b00; }
  @media print { body { margin: 12px; } button { display: none; } }
</style></head><body>
  <button onclick="window.print()" style="float:right;padding:8px 16px;">Print / Save as PDF</button>
  <h1>Standard Work Instruction — ${esc(sku.name)}</h1>
  <div class="meta">SKU ${esc(sku.sku_number)} · ${esc(sku.family || '')} · Version ${sku.version}</div>
  <div class="total">Total labor time: ${formatTime(total)}</div>
  <table><thead><tr><th>#</th><th>Operation</th><th>Time</th><th>Photos</th></tr></thead>
  <tbody>${rows}</tbody></table>
</body></html>`;
}
