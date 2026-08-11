// Formatting helpers shared across GameDeck's components.

/**
 * Convert a minute count into a compact "14h 15m" style label.
 * Returns "0m" for falsy/zero input.
 */
export function minutesToHhm(mins) {
  const total = Math.max(0, Math.round(mins || 0))
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (hours <= 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

/**
 * Format an ISO date/timestamp string as "Aug 5, 2026".
 * Returns a fallback string for null/invalid input.
 */
export function formatDate(value, fallback = 'Never played') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Format an ISO date/timestamp as a relative label for the Activity feed:
 * "Today", "Yesterday", or "Aug 5, 2026".
 */
export function formatRelativeDay(value) {
  if (!value) return 'Unknown date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'

  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const today = startOfDay(new Date())
  const target = startOfDay(date)
  const diffDays = Math.round((today - target) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return formatDate(value)
}

/**
 * Compact release timing for Discover cards, from an IGDB first_release_date
 * (unix SECONDS). Returns { label, tone } only when a game is near its release,
 * so older catalog rows show nothing (and fall back to just the rating).
 *   tone 'amber'  -> upcoming (counting down)
 *   tone 'fresh'  -> released within the last ~10 days
 *   tone 'muted'  -> released 11-30 days ago
 * Windows: up to 120 days before release, up to 30 days after.
 */
export function releaseTiming(released) {
  const ts = Number(released)
  if (!ts) return null
  const DAY = 86400
  const diff = ts - Date.now() / 1000 // >0 upcoming, <0 already out
  const days = Math.abs(diff) / DAY

  if (diff >= 0) {
    if (days > 120) return null
    let label
    if (diff < 2 * DAY) {
      const h = Math.max(1, Math.round(diff / 3600))
      label = h >= 24 ? 'Tomorrow' : `in ${h}h`
    } else if (days < 14) {
      label = `in ${Math.round(days)}d`
    } else {
      label = `in ${Math.round(days / 7)}w`
    }
    return { label, tone: 'amber' }
  }

  if (days > 30) return null
  let label
  if (days < 1) label = 'Today'
  else if (days < 14) label = `${Math.round(days)}d ago`
  else label = `${Math.round(days / 7)}w ago`
  return { label, tone: days <= 10 ? 'fresh' : 'muted' }
}

/**
 * Build an IGDB cover URL from a stored image_id, at a given size preset.
 * Sizes: 't_cover_small' (90x128), 't_cover_big' (264x374), 't_720p', 't_1080p'.
 * Returns null when no image_id (so callers can fall back to the Exophase cover).
 */
export function igdbCover(imageId, size = 't_cover_big') {
  if (!imageId) return null
  return `https://images.igdb.com/igdb/image/upload/${size}/${imageId}.jpg`
}

const PLATFORM_META = {
  xbox: { label: 'Xbox', color: 'var(--xbox)' },
  psn: { label: 'PlayStation', color: 'var(--psn)' },
  steam: { label: 'Steam', color: 'var(--steam)' },
}

/**
 * Map an `environment` value ('xbox' | 'psn' | 'steam') to a display label
 * and dot color. Unknown values fall back to a muted neutral dot.
 */
export function platformMeta(env) {
  const key = String(env || '').toLowerCase()
  return PLATFORM_META[key] || { label: env || 'Unknown', color: 'var(--muted)' }
}
