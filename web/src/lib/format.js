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
 * Whole days between today and an IGDB first_release_date (unix SECONDS).
 * Negative = already out, 0 = out today, positive = still to come.
 * Returns null when there is no usable timestamp.
 *
 * This is the single date basis every release-aware surface shares: the card
 * label, the "coming soon" predicate, and the wishlist rails. They used to each
 * roll their own, which is how one game could be counted as unreleased by a rail
 * and labelled "Today" by the card sitting inside it.
 *
 * Dates are compared as CALENDAR DATES, not as instants. IGDB stores
 * first_release_date as UTC midnight, which means "this calendar day", not "this
 * moment". Comparing it against a raw Date.now() made a game releasing today read
 * "in 1h" in upcoming amber until UTC midnight passed, because the diff >= 0
 * branch won at the boundary. It also put the released/upcoming flip at UTC
 * midnight rather than the reader's own, which is up to 14 hours out.
 */
export function releaseDayDelta(released) {
  const ts = Number(released)
  if (!ts) return null

  // The game's date, read in UTC (the timezone IGDB stamped it in).
  const g = new Date(ts * 1000)
  if (Number.isNaN(g.getTime())) return null
  const gameDay = Date.UTC(g.getUTCFullYear(), g.getUTCMonth(), g.getUTCDate())
  // Today, read in the reader's own timezone.
  const n = new Date()
  const today = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())

  return Math.round((gameDay - today) / 86400000)
}

/**
 * Compact release timing for Discover cards, from an IGDB first_release_date
 * (unix SECONDS). Returns { label, tone } only when a game is near its release,
 * so older catalog rows show nothing (and fall back to just the rating).
 *   tone 'amber'  -> upcoming (counting down)
 *   tone 'fresh'  -> released today or within the last ~10 days
 *   tone 'muted'  -> released 11-120 days ago
 * Windows: up to 120 days either side of release.
 *
 * The backward window matches the "Recently released" rail, which selects games
 * from the last 120 days. It used to stop at 30, so most of that rail carried no
 * timing at all - the one place a "3w ago" is most worth reading.
 */
export function releaseTiming(released) {
  const days = releaseDayDelta(released)
  if (days === null) return null
  if (Math.abs(days) > 120) return null

  if (days === 0) return { label: 'Today', tone: 'fresh' }

  if (days > 0) {
    let label
    if (days === 1) label = 'Tomorrow'
    else if (days < 14) label = `in ${days}d`
    else label = `in ${Math.round(days / 7)}w`
    return { label, tone: 'amber' }
  }

  const ago = Math.abs(days)
  let label
  if (ago === 1) label = 'Yesterday'
  else if (ago < 14) label = `${ago}d ago`
  else if (ago < 56) label = `${Math.round(ago / 7)}w ago`
  // Past ~8 weeks "14w ago" stops being readable at a glance; months are easier
  // to place, and 120 days never rounds past 4.
  else label = `${Math.round(ago / 30)}mo ago`
  return { label, tone: ago <= 10 ? 'fresh' : 'muted' }
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
 * Fallback text for a Discover card's meta line, used only when the card has
 * nothing else to put there: no release countdown and no rating.
 *
 * That combination is common and looks broken. "Most anticipated" is sorted by
 * hype, so it fills with games six-plus months out - past the countdown window,
 * and unreleased so they have no rating either. Wishlist cards carry only a
 * year. Both rendered an empty row under the title.
 *
 * A date is more use than a countdown would be at that range ("2027" beats
 * "in 14mo"), and precision is respected, so a game IGDB only knows the quarter
 * of shows "Q2 2027" rather than an invented day.
 *
 * Returns null when the card already has something to say, so callers can
 * render it unconditionally.
 */
export function shelfMetaDate(game, timing) {
  if (!game || timing || game.rating) return null
  return releaseLabel(game.release, game.year)
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
