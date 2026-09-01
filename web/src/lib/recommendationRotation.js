const ROTATION_KEY = 'gamedeck_for_you_rotation_v1'
const REFRESH_BUCKET_MS = 10 * 60 * 1000

export function localDayKey(now = Date.now()) {
  const date = new Date(now)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function browserStorage() {
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

export function dailyRecommendationBatch(now = Date.now(), batchNumber = 0) {
  const batch = Math.max(0, Number(batchNumber) || 0)
  return `daily-${localDayKey(now)}-b${batch}`
}

// Refreshes inside the same ten-minute window share one learning opportunity.
// The visible deck can still rotate again, but repeated pulls do not manufacture
// a streak of negative evidence before the user has had time to evaluate it.
export function refreshRecommendationBatch(now = Date.now()) {
  const bucket = Math.floor(now / REFRESH_BUCKET_MS)
  return `refresh-${localDayKey(now)}-${bucket.toString(36)}`
}

export function loadRotationExclusions(now = Date.now(), storage = browserStorage()) {
  if (!storage) return new Set()
  try {
    const value = JSON.parse(storage.getItem(ROTATION_KEY) || 'null')
    if (!value || value.day !== localDayKey(now) || !Array.isArray(value.ids)) return new Set()
    return new Set(value.ids.map(String))
  } catch {
    return new Set()
  }
}

export function rememberRotationExclusions(ids, now = Date.now(), storage = browserStorage()) {
  const next = loadRotationExclusions(now, storage)
  for (const id of ids || []) {
    if (id != null) next.add(String(id))
  }
  if (storage) {
    try {
      storage.setItem(ROTATION_KEY, JSON.stringify({ day: localDayKey(now), ids: [...next] }))
    } catch {
      // Storage is an optimization. The in-memory Set still rotates this view.
    }
  }
  return next
}
