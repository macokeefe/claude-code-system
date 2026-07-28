// Pure SWI-workbook parsing shared by the server importer and the standalone
// (browser) build. Takes an already-loaded ExcelJS workbook; no fs/db access.
//
// The SWI workbooks have a header block (title, Process, Version, PPE, Tool
// List) followed by a step table. Columns are located by header text, not
// position, so minor layout drift between files is tolerated.
import { parseTime } from './timeParse.js';

const HEADER_MATCHERS = {
  stepNo: /process\s*step/i,
  time: /time\s*\(min/i,
  symbol: /^symbol/i,
  description: /operation\s*step/i,
  pictures: /picture/i,
  parallel: /parallel/i,
};

export function normalize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Step name convention in the spreadsheets: lead-in phrase before the first
// colon ("Rivet nut installation: ...").
export function deriveStepName(description) {
  const text = String(description || '').trim();
  const colon = text.indexOf(':');
  if (colon > 0 && colon <= 60) return text.slice(0, colon).trim();
  return text.length > 50 ? text.slice(0, 50).trim() + '…' : text;
}

function cellText(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(r => r.text).join('');
    if (v.text) return v.text;
    if (v.result !== undefined) return String(v.result);
  }
  return String(v);
}

export function parseSwiWorkbook(workbook, originalName, existingTags = []) {
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('Workbook has no sheets');

  // Locate the step-table header row
  let headerRow = null;
  const cols = {};
  sheet.eachRow((row, rowNumber) => {
    if (headerRow) return;
    let matched = 0;
    row.eachCell((cell, colNumber) => {
      const text = cellText(cell);
      for (const [key, re] of Object.entries(HEADER_MATCHERS)) {
        if (re.test(text) && cols[key] === undefined) { cols[key] = colNumber; matched++; }
      }
    });
    if (matched >= 3 && cols.description !== undefined) headerRow = rowNumber;
    else if (!headerRow) Object.keys(cols).forEach(k => delete cols[k]);
  });
  if (!headerRow) throw new Error('Could not find the step table header row (looking for "Process Step" / "Operation Step" columns)');

  // Header-block metadata: workbook title cell and Version field
  let title = '';
  let version = 1;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber >= headerRow) return;
    row.eachCell(cell => {
      const text = cellText(cell).trim();
      if (!title && /standard work instruction/i.test(text)) title = text;
      const vm = text.match(/version\s*:?\s*(\d+)/i);
      if (vm) version = parseInt(vm[1], 10);
    });
  });

  // Images, grouped by anchor row so they can be attached to steps
  const imagesByRow = new Map();
  for (const img of sheet.getImages()) {
    const row = Math.floor(img.range.tl.nativeRow) + 1;
    if (!imagesByRow.has(row)) imagesByRow.set(row, []);
    imagesByRow.get(row).push(img.imageId);
  }

  const steps = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow) return;
    const description = cellText(row.getCell(cols.description)).trim();
    if (!description) return;
    const timeRaw = cols.time ? cellText(row.getCell(cols.time)).trim() : '';
    const parsed = parseTime(timeRaw);
    steps.push({
      rowNumber,
      sheetStepNo: cols.stepNo ? cellText(row.getCell(cols.stepNo)).trim() : '',
      name: deriveStepName(description),
      description,
      timeRaw: parsed.raw,
      timeSeconds: parsed.seconds,
      timeAmbiguous: parsed.ambiguous,
      parallelNotes: cols.parallel ? cellText(row.getCell(cols.parallel)).trim() : '',
      imageIds: imagesByRow.get(rowNumber) || [],
    });
  });

  // Sequence is row order; flag where the typed step numbers disagree
  // (the source files contain duplicate and out-of-order numbers).
  const warnings = [];
  steps.forEach((step, i) => {
    const typed = parseInt(step.sheetStepNo, 10);
    if (!Number.isNaN(typed) && typed !== i + 1) {
      warnings.push(`Row ${step.rowNumber}: sheet says step ${typed}, importing as step ${i + 1} (row order)`);
    }
    if (step.timeAmbiguous) {
      warnings.push(`Step ${i + 1} "${step.name}": time "${step.timeRaw}" is ambiguous — imported without a time, marked for review`);
    } else if (step.timeSeconds === null) {
      warnings.push(`Step ${i + 1} "${step.name}": no time recorded`);
    }
  });

  // Suggest existing tags whose name or description closely matches
  for (const step of steps) {
    const stepNorm = normalize(step.name);
    const descNorm = normalize(step.description);
    const match = existingTags.find(t =>
      normalize(t.name) === stepNorm || (t.description && normalize(t.description) === descNorm));
    if (match) {
      step.suggestedTag = {
        id: match.id, name: match.name, time_seconds: match.canonical_time_seconds,
        timeMatches: match.canonical_time_seconds === step.timeSeconds,
      };
    }
  }

  const skuName = String(originalName || '').replace(/\.xlsx?$/i, '').trim() || 'Imported SKU';
  return {
    sku: { name: skuName, sku_number: '', family: title.replace(/standard work instruction/i, '').replace(/[()]/g, '').trim() || null, version },
    steps,
    warnings,
    imageCount: sheet.getImages().length,
  };
}
