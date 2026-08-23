// The app ground: what sits behind every tab, under the panels and the glass.
//
// Same shape as theme.js - a stored preference applied by setting an attribute
// on <html>, with the actual paint in index.css - plus one thing theme.js does
// not need: four of the six sources are photographs, and a photograph has to be
// measured before it is safe to put type over.
//
// WHY THE VEIL IS COMPUTED AND NOT A SETTING
//
// A heading on a picture cannot be made legible by choosing a text colour. The
// pixels under one 15px label on a real IGDB artwork ran rgb(100) to rgb(165):
// light text read 2.02:1 against the lightest of them and dark text 2.93:1
// against the darkest, so the best either could do was 2.93 against a 4.5 bar.
// Flipping to dark measured 4.83:1 against the MEAN, which is exactly the trap -
// a flip driven by average brightness tests as correct and is unreadable over
// the light half of the picture.
//
// So the ground adapts instead. This file samples the image and raises the veil
// until the worst part of it clears AA, which is a thing a ground can do and a
// letter cannot.
//
// The two modules this needs - the IndexedDB cache and the Discover client - are
// imported at the point of use, not at the top. This file runs from main.jsx
// before first paint, and a static import would pull both into the entry bundle
// for every launch, including the `off` and `wash` ones that never touch either.

import { clampAccent } from './tint.js'
import { getArtAccent } from './theme.js'

const KEY = 'gamedeck_ground_v1'
const PIN_KEY = 'gamedeck_ground_pin_v1'
const INTENSITY_KEY = 'gamedeck_ground_intensity_v1'

// The four picture sources, as a set rather than a list of `||` comparisons.
// Everything that branches on "is this a photograph" - whether to measure, whether
// to offer the intensity slider, which CSS layers to switch on - reads this, so a
// fifth source costs one entry here and nothing else.
const ART = new Set(['nowplaying', 'weekly', 'pinned', 'shuffle'])
const SOURCES = new Set(['off', 'wash', ...ART])

export const GROUND_OPTIONS = [
  { key: 'off', label: 'Off', sub: 'Flat, the way it was' },
  { key: 'wash', label: 'Theme wash', sub: 'A soft gradient in your color theme' },
  { key: 'nowplaying', label: 'Now playing', sub: 'Key art from whatever you played last' },
  { key: 'weekly', label: 'Most played this week', sub: 'The game the week was actually about' },
  { key: 'pinned', label: 'Pinned game', sub: 'One picture you chose, that does not move' },
  { key: 'shuffle', label: 'Shuffle', sub: 'A different game from your library each launch' },
]

export const isArtGround = (v) => ART.has(v)

export function getGround() {
  try {
    const v = localStorage.getItem(KEY)
    return SOURCES.has(v) ? v : 'off'
  } catch {
    return 'off'
  }
}

// ---------------------------------------------------------------- the pin
//
// The title is stored alongside the id purely so Settings can name the pinned
// game without fetching the library to look it up. It is a label, never the
// match: the id is what pickGame resolves against, and a renamed row shows a
// stale label for one launch rather than losing the picture.
export function getPinnedGame() {
  try {
    const raw = JSON.parse(localStorage.getItem(PIN_KEY) || 'null')
    return raw && raw.master_id ? raw : null
  } catch {
    return null
  }
}

export function setPinnedGame(game) {
  const entry = game && game.master_id ? { master_id: game.master_id, title: game.title || '' } : null
  try {
    if (entry) localStorage.setItem(PIN_KEY, JSON.stringify(entry))
    else localStorage.removeItem(PIN_KEY)
  } catch {
    /* storage unavailable - the pin just will not persist */
  }
  // A new pin is a different picture, so the remembered paint for this source is
  // not about it any more. Dropping it is what stops the next launch flashing the
  // old game's art for the frame before the new one resolves.
  dropPaint('pinned')
  if (getGround() === 'pinned') applyGround('pinned')
  return entry
}

// ---------------------------------------------------------------- intensity
//
// The measured veil is a FLOOR, not a target: it is the least covering that still
// clears 4.5:1 on the smallest type on screen. So the only safe direction is more
// covered, and that is the whole control - 0 is the floor, 1 is VEIL_MAX. There is
// no way to express "less than legible" in it, which is why it can be a taste
// setting at all.
//
// REDUCED TRANSPARENCY puts a floor under that control rather than adding a
// second number. Someone who turned on iOS's toggle asked for less see-through,
// and the ground is the largest see-through thing in the app; index.css answers
// the same query by making the glass bars opaque. Expressing it as "the slider
// cannot go below half" reuses a control that already exists, is bounded by the
// same ceiling, and cannot contradict the contrast floor - and the user can still
// push it further up.
//
// It cannot be done in CSS: --ground-veil-a is an inline style written below, and
// a stylesheet does not outrank one.
const QUIET_FLOOR = 0.5
const quietQuery = () => {
  try {
    return window.matchMedia('(prefers-reduced-transparency: reduce)')
  } catch {
    return null
  }
}
const wantsQuiet = () => Boolean(quietQuery() && quietQuery().matches)

export function getGroundIntensity() {
  try {
    const n = Number(localStorage.getItem(INTENSITY_KEY))
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0
  } catch {
    return 0
  }
}

export function setGroundIntensity(t) {
  const v = Math.min(1, Math.max(0, Number(t) || 0))
  try {
    localStorage.setItem(INTENSITY_KEY, String(v))
  } catch {
    /* storage unavailable - preference just will not persist */
  }
  // Repaint from the floor already on the page rather than re-measuring: the
  // sample and the picture have not changed, only how much of it is wanted.
  if (lastFloor != null) root().style.setProperty('--ground-veil-a', String(veilWith(lastFloor)))
  return v
}

// ---------------------------------------------------------------- the veil

const srgb = (c) => {
  const x = c / 255
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}
const lum = (r, g, b) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
const contrast = (a, b) => {
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  return (hi + 0.05) / (lo + 0.05)
}
// Resolved by the browser rather than parsed here. A custom property comes back
// from getPropertyValue AS AUTHORED - `--muted: #a89f92` returns the hex string,
// not an rgb() triple - so a digit-scraping parser reads "#a89f92" as the two
// numbers 89 and 92, gives up, and returns black. Black --muted makes every
// contrast check pass instantly, which is how a 0.2 veil over a white highlight
// tested as correct. Setting the value as a `color` and reading it back is the
// only version of this that cannot be wrong: computed `color` is always rgb().
const probe = () => {
  const el = document.createElement('span')
  el.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none'
  return el
}
const rgbOf = (css) => {
  const raw = String(css).trim()
  // Already a triple, as --ground-veil-rgb is.
  const bare = raw.match(/^(\d+)\s*,\s*(\d+)\s*,\s*(\d+)$/)
  if (bare) return [Number(bare[1]), Number(bare[2]), Number(bare[3])]
  const el = probe()
  el.style.color = 'rgb(0, 0, 0)'
  el.style.color = raw
  document.body.appendChild(el)
  const out = getComputedStyle(el).color.match(/\d+(\.\d+)?/g)
  el.remove()
  return out && out.length >= 3 ? out.slice(0, 3).map(Number) : [0, 0, 0]
}

// The text the veil has to protect is --muted, not --text. Measured in light
// mode on a ground: --text cleared comfortably while the three --muted labels
// (the page subtitle, "Showing", the Activity day label) sat near 2.8:1. Sizing
// the veil to the brighter of the two would have looked fine and failed the
// smallest type on the screen.
function readPalette() {
  const cs = getComputedStyle(document.documentElement)
  const muted = rgbOf(cs.getPropertyValue('--muted') || '#a89f92')
  const veil = rgbOf(cs.getPropertyValue('--ground-veil-rgb') || '18,16,14')
  return { mutedL: lum(...muted), veil }
}

// BOTH ends of the picture, not just the bright one.
//
// The first version measured only the brightest part, which is right in dark
// mode - light type, so a bright patch is what kills it - and exactly backwards
// in light mode, where the type is dark and it is the SHADOWS that swallow it.
// It tested clean: a light veil over a bright image cleared AA at the minimum
// alpha of 0.2 while the black corner of the same picture sat under dark text.
// A ground has one veil for the whole screen, so it has to satisfy whichever end
// is closer to the text, and checking both is theme-agnostic - in each mode one
// of the two is trivially satisfied and the other is the real constraint.
//
// Percentiles, not extremes: one specular highlight or one black letterbox bar
// would drag the veil for everything else. Drawing to 32px is itself a box
// filter, which is roughly what the CSS blur does to the same image on screen.
const SAMPLE = 32
const PCTL_HI = 0.97
const PCTL_LO = 0.03

// Returns { ends, mean }: the two percentiles the veil is sized from, and the
// average colour the accent is derived from. ONE pass over pixels that are
// already decoded - the accent is not worth a second fetch of the same picture,
// and doing it here is what makes it free.
function sampleOf(img) {
  const c = document.createElement('canvas')
  c.width = SAMPLE
  c.height = SAMPLE
  const g = c.getContext('2d', { willReadFrequently: true })
  if (!g) return null
  g.drawImage(img, 0, 0, SAMPLE, SAMPLE)
  let px
  try {
    px = g.getImageData(0, 0, SAMPLE, SAMPLE).data
  } catch {
    // A tainted canvas. Cannot happen through /api/tint, which is same-origin
    // and exists for exactly this reason, but a caller passing any other host
    // would land here and must not get a silent zero-strength veil.
    return null
  }
  const ls = []
  let r = 0
  let gg = 0
  let b = 0
  let n = 0
  for (let i = 0; i < px.length; i += 4) {
    ls.push(lum(px[i], px[i + 1], px[i + 2]))
    r += px[i]
    gg += px[i + 1]
    b += px[i + 2]
    n += 1
  }
  ls.sort((a, z) => a - z)
  const at = (p) => ls[Math.max(0, Math.min(ls.length - 1, Math.floor(ls.length * p)))]
  return {
    ends: [at(PCTL_LO), at(PCTL_HI)],
    mean: n ? [Math.round(r / n), Math.round(gg / n), Math.round(b / n)] : null,
  }
}

// Walk the alpha up until the worst part of the composited ground clears AA.
// Iterated rather than solved: inverting the sRGB curve for alpha is a page of
// algebra that would need its own test, and 46 steps of a two-line loop is
// nothing on a once-per-load path.
const VEIL_MIN = 0.2
const VEIL_MAX = 0.92
const VEIL_STEP = 0.02
const AA = 4.5

// A sample is a luminance; turn it back into a neutral channel value so the mix
// below happens in the 0-255 space compositing actually works in. A neutral
// stands in for the real pixel because the veil is neutral too and only the
// luminance of the result is used.
const chanOf = (l) => {
  const x = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, Math.round(x * 255)))
}

export function veilFor(extremes, { mutedL, veil }) {
  const ends = (Array.isArray(extremes) ? extremes : [extremes]).map(chanOf)
  for (let a = VEIL_MIN; a <= VEIL_MAX + 1e-9; a += VEIL_STEP) {
    const ok = ends.every((g) => {
      const mixed = veil.map((v) => v * a + g * (1 - a))
      return contrast(lum(mixed[0], mixed[1], mixed[2]), mutedL) >= AA
    })
    if (ok) return Math.round(a * 100) / 100
  }
  return VEIL_MAX
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

// ---------------------------------------------------------------- the picture

// Which game the ground comes from. `nowplaying` is the most recently played row
// that still has IGDB art; `shuffle` is any of them. Both read the library cache
// rather than the network, so a launch with the ground already on paints from
// disk in the same pass everything else does.
async function pickGame(kind) {
  const { idbGet } = await import('./idbCache.js')
  const hit = await idbGet('library:games')
  const rows = (hit && hit.value) || []
  const withArt = rows.filter((g) => g && g.igdb_id)
  if (!withArt.length) return null
  if (kind === 'shuffle') return withArt[Math.floor(Math.random() * withArt.length)]
  // A pin names one row. If that row is gone from the library, or has no IGDB art,
  // the answer is nothing at all - falling back to "most recent" would silently
  // replace a picture the user explicitly chose with one they did not.
  if (kind === 'pinned') {
    const pin = getPinnedGame()
    if (!pin) return null
    return withArt.find((g) => String(g.master_id) === String(pin.master_id)) || null
  }
  if (kind === 'weekly') {
    const top = await topOfWeek(withArt)
    if (top) return top
    // Nothing logged this week. The last thing played is the honest stand-in -
    // it is the same question one window wider - and it means a quiet week shows
    // a picture rather than dropping to the wash.
  }
  const played = withArt.filter((g) => g.last_played)
  if (!played.length) return withArt[0]
  played.sort((a, b) => new Date(b.last_played) - new Date(a.last_played))
  return played[0]
}

// The game the last seven days were actually about, which is a different question
// from "the last thing you touched": on a week spent bouncing between three games
// the most recent row is the least characteristic of them.
//
// Deliberately NOT a new query. It reads through loadRecentActivity with the same
// window Home already asks for, so on any launch that has opened Home the rows come
// off disk and this costs nothing, and there is one definition of the activity read
// rather than a second one that can drift from it. weekStats then does the rollup,
// which is the same function Insights draws its week block from - a private
// group-by here would be a second answer to a question the app already answers.
async function topOfWeek(withArt) {
  try {
    const [{ loadRecentActivity }, { weekStats, WEEK_SPAN }] = await Promise.all([
      import('./recentActivity.js'),
      import('./playWeek.js'),
    ])
    const rows = await loadRecentActivity({ days: WEEK_SPAN * 2 })
    const week = weekStats(rows || [], new Date(), WEEK_SPAN)
    const byId = new Map(withArt.map((g) => [String(g.master_id), g]))
    // byGame is already sorted by minutes, so the first row that is in the library
    // AND has IGDB art is the answer. Walking it rather than taking [0] matters:
    // 34 of 513 library rows have no igdb_id at all, and a week topped by one of
    // them would otherwise resolve to no picture.
    for (const g of week.byGame) {
      const lib = byId.get(String(g.master_id))
      if (lib) return lib
    }
    return null
  } catch {
    return null
  }
}

// t_screenshot_med through the same-origin passthrough. Not images.igdb.com and
// not the wsrv CDN: a canvas read of a cross-origin image is only allowed when
// the host sends the CORS header, neither of those documents one, and without it
// the sample fails and the veil silently defaults. /api/tint exists for this.
function artUrl(meta) {
  if (!meta || !meta.backdropId) return null
  const kind = meta.backdropKind === 'artwork' ? 'artwork' : 'screenshot'
  return `/api/tint?id=${encodeURIComponent(meta.backdropId)}&kind=${kind}`
}

// ---------------------------------------------------------------- remembering

// WHY THIS EXISTS
//
// Measured at 420ms Supabase latency, three launches in a row with the ground on
// `nowplaying`: launch one showed no art at all (the library cache is empty when
// initGround runs, so it falls back to the wash), launch two painted at 927ms,
// launch three at 437ms - and it stayed at 437 forever. The chain is read
// IndexedDB, fetch /api/discover?ids=, fetch /api/tint, decode, sample a canvas,
// compute the veil, set two properties, and every step of it produces the same
// answer as the last launch on all but the launch where the picture changed.
//
// So the answer is written down. localStorage rather than IndexedDB precisely
// because it is SYNCHRONOUS - an idb read is a promise, and a promise is already
// a frame too late for a paint that is supposed to be there when the page is.
// Keyed BY SOURCE rather than holding one entry, so switching from Now playing to
// Shuffle and back does not throw away what was already measured for each. It is
// two small objects; a single slot would make every source change cost a slow
// launch for no saving worth having.
const PAINT_KEY = 'gamedeck_ground_paint_v1'

function readPaint() {
  try {
    const raw = JSON.parse(localStorage.getItem(PAINT_KEY) || 'null')
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  } catch {
    return {}
  }
}

function writePaint(source, entry) {
  try {
    localStorage.setItem(PAINT_KEY, JSON.stringify({ ...readPaint(), [source]: entry }))
  } catch {
    /* storage unavailable - the ground goes back to resolving on every launch */
  }
}

function dropPaint(source) {
  try {
    const all = readPaint()
    delete all[source]
    localStorage.setItem(PAINT_KEY, JSON.stringify(all))
  } catch {
    /* storage unavailable - nothing was remembered to forget */
  }
}

/**
 * The picture this source should paint, resolved the slow way: library cache ->
 * /api/discover?ids= -> an /api/tint url.
 */
async function resolveArt(kind) {
  const game = await pickGame(kind)
  if (!game) return null
  const { fetchGamesByIds } = await import('./discover.js')
  const byId = await fetchGamesByIds([game.igdb_id])
  return artUrl(byId && byId[game.igdb_id])
}

// Fetch, decode, sample, and size the veil. Null when the picture cannot be
// measured, which is the only state in which art is not shown at all.
async function measure(url) {
  const img = await loadImage(url)
  const sample = img ? sampleOf(img) : null
  if (sample == null) return null
  return { veil: veilFor(sample.ends, readPalette()), mean: sample.mean }
}

// ---------------------------------------------------------------- applying

const root = () => document.documentElement

// The floor this paint was measured at, kept so the intensity slider can move the
// veil without re-measuring the picture; and the picture's average colour, kept
// so the accent can be re-clamped when the palette changes under it.
let lastFloor = null
let lastMean = null

const VEIL_CEIL = VEIL_MAX

function veilWith(floor) {
  const t = Math.max(getGroundIntensity(), wantsQuiet() ? QUIET_FLOOR : 0)
  const a = floor + t * Math.max(0, VEIL_CEIL - floor)
  return Math.round(Math.min(VEIL_CEIL, a) * 100) / 100
}

// `data-ground-art` is set by the paint, not by the preference, and that is the
// point. The art layers used to be selected by naming each source in the
// stylesheet, which meant that between choosing `nowplaying` and the picture
// resolving - a network round trip on a cold launch - the veil painted over an
// empty background: a page dimmed for no photograph. Keying the layers on the
// paint makes that state unrepresentable, and adding a source stops touching CSS.
function clearArt() {
  root().removeAttribute('data-ground-art')
  root().style.removeProperty('--ground-src')
  root().style.removeProperty('--ground-veil-a')
  root().style.removeProperty('--accent')
  lastFloor = null
  lastMean = null
}

function paintArt(src, floor, mean) {
  lastFloor = floor
  lastMean = mean || null
  root().style.setProperty('--ground-veil-a', String(veilWith(floor)))
  root().style.setProperty('--ground-src', `url("${src}")`)
  root().setAttribute('data-ground-art', '')
  paintAccent()
}

// THE ACCENT, when the user has asked for it.
//
// Computed on every paint rather than remembered, because unlike the veil it
// depends on something the picture does not know: the selected colour theme's
// --bg / --surface / --surface-2, which the accent has to clear 4.5:1 against in
// BOTH directions - it is a fill with knockout --bg text on it (the tab pill, the
// segmented control) and it is text on --surface (values, links, the arc). An
// accent clamped under Walnut and reused under Slate would be wrong.
//
// So the picture's own average is what gets remembered, and the clamp - which is
// arithmetic on three numbers - runs each time. Swept over all five palettes in
// both themes, 360 hues, every saturation and lightness: the worst case the clamp
// can produce is exactly 4.50:1.
function paintAccent() {
  if (!lastMean || !getArtAccent()) {
    root().style.removeProperty('--accent')
    return
  }
  const cs = getComputedStyle(document.documentElement)
  const grounds = ['--bg', '--surface', '--surface-2']
    .map((k) => rgbOf(cs.getPropertyValue(k)))
    .filter(Boolean)
  const a = clampAccent(lastMean, themeNow(), grounds)
  if (a) root().style.setProperty('--accent', `rgb(${a[0]}, ${a[1]}, ${a[2]})`)
  else root().style.removeProperty('--accent')
}

/** Re-run the accent clamp after the palette or the preference changes. */
export function refreshArtAccent() {
  paintAccent()
}

const themeNow = () =>
  document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'

/**
 * SHUFFLE IS DECIDED A LAUNCH AHEAD, and it has to be.
 *
 * Remembering the paint makes every other source instant, and a source that
 * picks a new picture every launch is the one that could never use it. Painting
 * the remembered picture and swapping to the new one a second later is not a
 * shuffle, it is a flash. So the launch that shows picture N resolves AND
 * measures N+1 and parks it; the next launch promotes it and paints on the first
 * frame. Shuffle still changes every time the app opens - the choosing just
 * happens while nobody is waiting.
 *
 * Failure is silent on purpose. The worst case is that the next launch resolves
 * the slow way, which is what every launch used to do.
 */
async function parkNextShuffle() {
  try {
    const url = await resolveArt('shuffle')
    if (!url) return
    const shot = await measure(url)
    if (shot == null) return
    const now = readPaint().shuffle
    if (now) {
      writePaint('shuffle', {
        ...now,
        pending: { src: url, veil: { [themeNow()]: shot.veil }, mean: shot.mean },
      })
    }
  } catch {
    /* next launch resolves it the slow way */
  }
}

let token = 0

/**
 * Put the ground on the page. Synchronous for `off` and `wash`, which need no
 * image and therefore no measurement.
 *
 * For the two art sources the FIRST THING that happens is a paint off the
 * remembered answer, before any await. Measured at 420ms latency, three launches
 * in a row on `nowplaying`: launch one showed no art at all (the library cache is
 * empty when initGround runs), launch two painted at 927ms, launch three at
 * 437ms - and it stayed at 437 forever, because every launch redid a resolve that
 * produced the same answer as the last one. Everything below the first paint is
 * that resolve, running where nobody is waiting for it.
 */
export async function applyGround(value) {
  const v = SOURCES.has(value) ? value : 'off'
  const mine = ++token
  root().setAttribute('data-ground', v)
  if (!ART.has(v)) {
    clearArt()
    return v
  }

  const theme = themeNow()
  const mem = readPaint()[v] || null

  // Shuffle: promote the picture parked by the last launch. Both halves are
  // required - a src with no veil for THIS theme cannot be painted, because a
  // veil measured in the other theme is sized against the other theme's --muted
  // and would be a photograph under the wrong cover.
  if (v === 'shuffle' && mem && mem.pending && mem.pending.src && mem.pending.veil?.[theme]) {
    paintArt(mem.pending.src, mem.pending.veil[theme], mem.pending.mean)
    writePaint(v, { src: mem.pending.src, veil: mem.pending.veil, mean: mem.pending.mean })
    parkNextShuffle()
    return v
  }

  const reuse = Boolean(mem && mem.src && mem.veil?.[theme])
  if (reuse) paintArt(mem.src, mem.veil[theme], mem.mean)
  else clearArt()

  const url = await resolveArt(v)
  if (mine !== token) return v
  // No art yet - a first launch, before the library has ever been fetched, has
  // an empty cache to pick from. The wash stands in until there is something to
  // pick, and the STORED preference is untouched, so the next launch tries again.
  // Without this the veil paints over nothing: a page dimmed for no picture.
  if (!url) {
    if (!reuse) root().setAttribute('data-ground', 'wash')
    return v
  }
  // Nothing moved. The picture painted from memory IS the picture and this
  // theme's veil was measured against it, so the DOM is not touched again.
  if (reuse && mem.src === url) {
    if (v === 'shuffle') parkNextShuffle()
    return v
  }

  const shot = await measure(url)
  if (mine !== token) return v
  if (shot == null) {
    // No sample, so no claim about contrast: fall back to the wash rather than
    // show an unmeasured photograph. A remembered paint stays - it was measured
    // once on a real sample and a failed re-read says nothing about it.
    if (!reuse) root().setAttribute('data-ground', 'wash')
    return v
  }
  paintArt(url, shot.veil, shot.mean)
  // The other theme's veil survives a repaint of this one: same picture, still
  // true. Only a NEW picture drops it, which is why the merge is keyed on the url.
  // The MEAN is not per theme - it is a property of the photograph - so it is
  // stored once and the clamp runs against whatever palette is live.
  const keep = mem && mem.src === url ? mem.veil || {} : {}
  writePaint(v, { src: url, veil: { ...keep, [theme]: shot.veil }, mean: shot.mean })
  if (v === 'shuffle') parkNextShuffle()
  return v
}

export function setGround(value) {
  const v = SOURCES.has(value) ? value : 'off'
  try {
    localStorage.setItem(KEY, v)
  } catch {
    /* storage unavailable - preference just will not persist */
  }
  applyGround(v)
  return v
}

export function initGround() {
  applyGround(getGround())
  // The toggle can be flipped while the app is open, and on iOS it is: it lives
  // in Settings, which is one swipe away. Repaint from the floor already on the
  // page rather than re-resolving anything - the picture has not changed.
  const q = quietQuery()
  if (q && typeof q.addEventListener === 'function') {
    q.addEventListener('change', () => {
      if (lastFloor != null) root().style.setProperty('--ground-veil-a', String(veilWith(lastFloor)))
    })
  }
}
