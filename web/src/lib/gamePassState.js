export const GAMEPASS_STALE_MS = 36 * 60 * 60 * 1000

export function gamePassCatalogAvailable(count, updatedAt, now = Date.now()) {
  const updatedMs = updatedAt ? Date.parse(updatedAt) : NaN
  return Number(count) > 0
    && Number.isFinite(updatedMs)
    && now - updatedMs <= GAMEPASS_STALE_MS
}

export function normalizeGamePassState(value) {
  if (Array.isArray(value)) {
    return { rows: value, available: value.length > 0, updatedAt: null }
  }
  return value || { rows: [], available: false, updatedAt: null }
}
