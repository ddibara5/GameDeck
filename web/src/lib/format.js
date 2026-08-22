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
 * Parse a value that may be either a CALENDAR DAY or an INSTANT.
 *
 * A bare `YYYY-MM-DD` (what Postgres `date` columns like `play_events.event_date`
 * return) means a day, not a moment. `new Date('2026-08-12')` parses it as UTC
 * midnight, and every reader west of UTC then formats that with local getters and
 * gets the evening of the 11th. That is why the whole Activity feed rendered one
 * day early: a session logged on the 12th showed as "Aug 11", and "Today" could
 * never appear at all. Building the Date from the components instead pins it to
 * local midnight on the day the string actually names.
 *
 * Anything carrying a time (a timestamptz such as `last_played`) is a real
 * instant and is parsed normally, so it still renders in the reader's zone.
 */
export function parseDayOrInstant(value) {
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  }
  return new Date(value)
}

/**
 * Format an ISO date/timestamp string as "Aug 5, 2026".
 * Returns a fallback string for null/invalid input.
 */
export function formatDate(value, fallback = 'Never played') {
  if (!value) return fallback
  const date = parseDayOrInstant(value)
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
  const date = parseDayOrInstant(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'

  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const today = startOfDay(new Date())
  const target = startOfDay(date)
  const diffDays = Math.round((today - target) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  // Inside the last week a weekday name is how you actually remember a session
  // ("Sunday", not "Aug 9, 2026"), and it matches the rolling 7-day header above
  // the feed. Bounded to the past: a future date has no "last Tuesday" reading.
  if (diffDays > 1 && diffDays < 7) return date.toLocaleDateString(undefined, { weekday: 'long' })
  // Pass the parsed Date, not the raw string: re-parsing would reintroduce the
  // UTC-midnight shift this function just corrected for.
  return formatDate(date)
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
 * End of the window a release could land in, in ms, given its IGDB precision.
 *
 * A coarse date is not a date. IGDB stores "2026" as 31 Dec 2026, so treating it
 * as an instant claims a game releases on New Year's Eve. Resolving to the END of
 * the period instead means a vague date sorts AFTER every concrete date it
 * overlaps, never before them: "sometime in 2026" cannot outrank "14 Sep 2026".
 *
 * This is why Ocarina of Time (precision `year`, label "2026") sat at the top of
 * Wishlist - coming soon while the Wishlist page, which already modelled this,
 * ranked it last.
 */
export function releaseWindowEndTs(released, precision) {
  const ts = Number(released)
  if (!ts) return null
  const d = new Date(ts * 1000)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  if (precision === 'year') return Date.UTC(y, 11, 31)
  if (precision === 'quarter') return Date.UTC(y, Math.floor(m / 3) * 3 + 3, 0)
  if (precision === 'month') return Date.UTC(y, m + 1, 0)
  return ts * 1000
}

/**
 * Compact release timing for Discover cards, from an IGDB first_release_date
 * (unix SECONDS). Returns { label, tone } only when a game is near its release,
 * so older catalog rows show nothing (and fall back to just the rating).
 *   tone 'amber'  -> upcoming (counting down)
 *   tone 'fresh'  -> released today or within the last ~10 days
 *   tone 'muted'  -> released 11-365 days ago
 * Windows: up to 365 days either side of release.
 *
 * The backward window matches the widest rail that uses it, "Wishlist - out now"
 * at 365 days. It has been widened twice for the same reason: at 30 days, and then
 * at 120, most of the rail carried no timing at all, which is the one place a
 * "3w ago" is most worth reading.
 */
export function releaseTiming(released) {
  const days = releaseDayDelta(released)
  if (days === null) return null
  // A year, matching OUT_NOW_WINDOW_DAYS. At 120 days most of "Wishlist - out now"
  // fell off the end of this and showed a bare date instead of a relative tag,
  // which is the one thing that row is for. Anything older than a year still gets
  // a date, because "17mo ago" stops meaning anything.
  if (Math.abs(days) > 365) return null

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
  // to place, and the 365-day cap never rounds past 12.
  else label = `${Math.round(ago / 30)}mo ago`
  return { label, tone: ago <= 10 ? 'fresh' : 'muted' }
}

// The same timing, split for the cover overlay: a big figure and a word.
//
// Derived from releaseDayDelta, and gated on releaseTiming so the two agree on
// exactly when a game has timing worth showing at all (including the 365-day cap).
//
// The TONE vocabulary is deliberately its own, and much smaller than
// releaseTiming's. On the cover the figure sits on a dark scrim, where plain white
// is the highest-contrast thing available and a tinted amber or green reads as
// weaker, not louder. Only the day a game actually lands is worth a colour, so
// there are two tones: 'today' and 'plain'. releaseTiming's amber/fresh/muted
// scale was built for coloured text on the page background, which is a different
// problem.
export function timingParts(released) {
  const t = releaseTiming(released)
  if (!t) return null
  const days = releaseDayDelta(released)
  if (days === 0) return { big: 'Today', lab: '', tone: 'today' }
  const ahead = days > 0
  const n = Math.abs(days)
  const suffix = ahead ? 'away' : 'ago'
  let v
  let word
  if (n < 14) {
    v = n
    word = 'day'
  } else if (ahead || n < 56) {
    // Upcoming never rolls up to months: releaseTiming caps the future at weeks.
    v = Math.round(n / 7)
    word = 'week'
  } else {
    v = Math.round(n / 30)
    word = 'month'
  }
  return { big: String(v), lab: `${word}${v === 1 ? '' : 's'} ${suffix}`, tone: 'plain' }
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

/**
 * The IGDB image id behind whatever cover a row happens to carry.
 *
 * Owned and wishlist rows store the bare id in `cover_igdb`; Discover entries
 * carry a full CDN URL in `cover`, because that is the shape the IGDB API
 * returns. The game sheet needs the id either way, so this is the one place
 * that knows both shapes. Returns null when there is no cover at all, which is
 * a real case and simply means no tint.
 */
export function coverImageId(game) {
  if (!game) return null
  if (game.cover_igdb) return String(game.cover_igdb)
  let url = game.cover || game.cover_small
  if (!url) return null
  // A cover that has already been through optImg is a wsrv.nl address with the
  // real one percent-encoded inside it. Nothing passes that shape in today, but
  // it costs one line to not return null if something ever does.
  const wrapped = String(url).match(/[?&]url=([^&]+)/)
  if (wrapped) url = decodeURIComponent(wrapped[1])
  const m = String(url).match(/\/upload\/t_[a-z0-9_]+\/([A-Za-z0-9_-]+)\.[a-z]+/)
  return m ? m[1] : null
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

// Labels name the PLATFORM YOU PLAYED ON, not the storefront the row was synced
// from. `steam` reads "PC" for that reason: the environment key stays `steam`
// because that is where the data comes from, but nobody thinks of it as a console
// called Steam. Settings still says "Steam" where it names the sync source, which
// really is Steam.
//
// This is the only definition. The Library filter said "PSN", Discover said
// "PC / Steam" and Insights kept a third private copy, so the same platform had
// three names depending on which screen you were looking at.
const PLATFORM_META = {
  xbox: { label: 'Xbox', color: 'var(--xbox)' },
  psn: { label: 'PlayStation', color: 'var(--psn)' },
  steam: { label: 'PC', color: 'var(--steam)' },
}

/**
 * Map an `environment` value ('xbox' | 'psn' | 'steam') to a display label
 * and dot color. Unknown values fall back to a muted neutral dot.
 */
export function platformMeta(env) {
  const key = String(env || '').toLowerCase()
  return PLATFORM_META[key] || { label: env || 'Unknown', color: 'var(--muted)' }
}
