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
 *   tone 'muted'  -> released 11-120 days ago
 * Windows: up to 120 days either side of release.
 *
 * The backward window matches the "Recently released" rail, which selects games
 * from the last 120 days. It used to stop at 30, so most of that rail carried no
 * timing at all - the one place a "3w ago" is most worth reading.
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

  if (days > 120) return null
  let label
  if (days < 1) label = 'Today'
  else if (days < 2) label = 'Yesterday'
  else if (days < 14) label = `${Math.round(days)}d ago`
  else if (days < 56) label = `${Math.round(days / 7)}w ago`
  // Past ~8 weeks "14w ago" stops being readable at a glance; months are easier
  // to place, and 120 days never rounds past 4.
  else label = `${Math.round(days / 30)}mo ago`
  return { label, tone: days <= 10 ? 'fresh' : 'muted' }
}

const RELEASE_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * Full release date for the game sheet, honouring how precise IGDB actually is.
 * Takes the normalized { ts, precision, label } the /api/discover proxy builds
 * (precision: 'day' | 'month' | 'quarter' | 'year' | 'tba').
 *
 *   day     -> "Aug 5, 2026"
 *   month   -> "August 2026"
 *   quarter -> "Q3 2026"
 *   year    -> "2026"
 *   tba     -> IGDB's own wording, else "TBA"
 *
 * Never invents a day for a game IGDB only knows the month or year of, which is
 * the whole reason precision is carried through from the API. Falls back to the
 * bare year when there's no release object at all (older cached rows).
 */
export function releaseLabel(release, fallbackYear = null) {
  const year = fallbackYear != null ? String(fallbackYear) : null
  if (!release || typeof release !== 'object') return year
  const { ts, precision } = release
  const human = release.label || null

  if (precision === 'tba') return human || 'TBA'
  if (!ts) return human || year

  // IGDB timestamps are UTC midnight; format in UTC so the day never slips by
  // one for anyone west of Greenwich.
  const d = new Date(Number(ts) * 1000)
  if (Number.isNaN(d.getTime())) return human || year

  const y = d.getUTCFullYear()
  if (precision === 'year') return String(y)
  if (precision === 'quarter') return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${y}`
  if (precision === 'month') return `${RELEASE_MONTHS[d.getUTCMonth()]} ${y}`
  return d.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
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

// Native pixel width of each IGDB size bucket, so we never ask the CDN to upscale
// past the source (upscaling is the only thing that would make an image blurry).
const IGDB_BUCKET_W = {
  t_cover_small: 90,
  t_cover_big: 264,
  t_screenshot_med: 569,
  t_screenshot_big: 889,
  t_720p: 1280,
  t_1080p: 1920,
}

/**
 * Route an IGDB image through the wsrv.nl image CDN: downscaled to the display
 * width and re-encoded to WebP (much smaller than IGDB's JPEG), so first loads
 * are faster. `targetW` is the intended pixel width (pass 2x the CSS size for
 * retina). We cap it at the source bucket's own width, so the CDN can only ever
 * downscale, never enlarge, which keeps images sharp. Non-IGDB URLs (Exophase
 * covers, external news art) pass through untouched.
 */
export function optImg(url, targetW = 240) {
  if (!url || url.indexOf('images.igdb.com') === -1) return url
  const bucket = url.match(/\/(t_[a-z0-9_]+)\//)
  const srcW = (bucket && IGDB_BUCKET_W[bucket[1]]) || 0
  const w = srcW ? Math.min(targetW, srcW) : targetW
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=${w}&output=webp&q=82`
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
