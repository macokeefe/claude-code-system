async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: options.body && !(options.body instanceof FormData)
      ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
    body: options.body && !(options.body instanceof FormData)
      ? JSON.stringify(options.body) : options.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: url => request(url),
  post: (url, body) => request(url, { method: 'POST', body }),
  put: (url, body) => request(url, { method: 'PUT', body }),
  del: url => request(url, { method: 'DELETE' }),
};

export function formatTime(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const min = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

export function formatLong(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  if (min === 0) return `${sec}s`;
  if (min >= 60) return `${Math.floor(min / 60)}h ${min % 60}m`;
  return sec ? `${min}m ${sec}s` : `${min}m`;
}

// Same interface as localApi.js (the standalone browser backend) so pages
// can import either via the @backend alias.
export const isLocal = false;
export const photoSrc = filePath => `/photos/${encodeURIComponent(filePath)}`;
export const downloadExcel = skuId => { window.location.href = `/api/skus/${skuId}/export.xlsx`; };
export const openPrint = skuId => { window.open(`/api/skus/${skuId}/print`, '_blank'); };
export const backupData = null;
export const restoreData = null;
