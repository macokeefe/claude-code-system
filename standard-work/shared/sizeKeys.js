// There are exactly three sofa sizes. Every spelling that's ever been used
// for them collapses to one canonical key, so the size picker can never show
// duplicates (e.g. both "small" and "3.5").
const CANON = {
  '3.5': '3.5', 'small': '3.5', 's': '3.5',
  '4.5–6.5': '4.5–6.5', '4.5-6.5': '4.5–6.5', '4.5 - 6.5': '4.5–6.5',
  'medium': '4.5–6.5', 'm': '4.5–6.5', '4.5,5.5,6.5': '4.5–6.5',
  '7.5': '7.5', 'large': '7.5', 'l': '7.5',
};

export function canonicalSizeKey(label) {
  return CANON[String(label).trim().toLowerCase()] || String(label).trim();
}

// Normalize a size_times object's keys; later duplicates win (most recent
// edit). Returns null when empty.
export function normalizeSizeTimes(sizeTimes) {
  if (!sizeTimes) return null;
  const out = {};
  for (const [k, v] of Object.entries(sizeTimes)) out[canonicalSizeKey(k)] = v;
  return Object.keys(out).length ? out : null;
}
