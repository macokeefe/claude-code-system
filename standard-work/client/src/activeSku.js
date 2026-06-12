// Remember which piece of furniture the user is looking at, so moving from the
// Process Map (where prerequisites are defined) to the optimizer keeps the same
// product selected. Stored per browser.
const KEY = 'sw-active-sku';
export const getActiveSku = () => {
  const v = Number(localStorage.getItem(KEY));
  return Number.isFinite(v) && v > 0 ? v : null;
};
export const setActiveSku = id => { try { if (id != null) localStorage.setItem(KEY, String(id)); } catch {} };
