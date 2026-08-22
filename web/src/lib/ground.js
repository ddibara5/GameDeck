// The app ground: what sits behind every tab, under the panels and the glass.
//
// Same shape as theme.js - a stored preference applied by setting an attribute
// on <html>, with the actual paint in index.css - plus one thing theme.js does
// not need: two of the four sources are photographs, and a photograph has to be
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

const KEY = 'gamedeck_ground_v1'
const SOURCES = new Set(['off', 'wash', 'nowplaying', 'shuffle'])

export const GROUND_OPTIONS = [
  { key: 'off', label: 'Off', sub: 'Flat, the way it was' },
  { key: 'wash', label: 'Theme wash', sub: 'A soft gradient in your color theme' },
  { key: 'nowplaying', label: 'Now playing', sub: 'Key art from whatever you played last' },
  { key: 'shuffle', label: 'Shuffle', sub: 'A different game from your library each launch' },
]

export function getGround() {
  try {
    const v = localStorage.getItem(KEY)
    return SOURCES.has(v) ? v : 'off'
  } catch {
    return 'off'
  }
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

function extremesOf(img) {
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
  for (let i = 0; i < px.length; i += 4) ls.push(lum(px[i], px[i + 1], px[i + 2]))
  ls.sort((a, b) => a - b)
  const at = (p) => ls[Math.max(0, Math.min(ls.length - 1, Math.floor(ls.length * p)))]
  return [at(PCTL_LO), at(PCTL_HI)]
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
  const played = withArt.filter((g) => g.last_played)
  if (!played.length) return withArt[0]
  played.sort((a, b) => new Date(b.last_played) - new Date(a.last_played))
  return played[0]
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

async function resolveArt(kind) {
  const game = await pickGame(kind)
  if (!game) return null
  const { fetchGamesByIds } = await import('./discover.js')
  const byId = await fetchGamesByIds([game.igdb_id])
  return artUrl(byId && byId[game.igdb_id])
}

// ---------------------------------------------------------------- applying

const root = () => document.documentElement

function clearArt() {
  root().style.removeProperty('--ground-src')
  root().style.removeProperty('--ground-veil-a')
}

let token = 0

/**
 * Put the ground on the page. Synchronous for `off` and `wash`, which need no
 * image and therefore no measurement; the two art sources resolve in the
 * background and paint when they land.
 */
export async function applyGround(value) {
  const v = SOURCES.has(value) ? value : 'off'
  const mine = ++token
  root().setAttribute('data-ground', v)
  if (v === 'off' || v === 'wash') {
    clearArt()
    return v
  }
  // Held back until both the picture and its veil are known. Painting the art
  // first and the veil a frame later is a flash of unveiled photograph directly
  // under the type, which is the one state this whole feature exists to avoid.
  clearArt()
  const url = await resolveArt(v)
  if (mine !== token) return v
  // No art yet - a first launch, before the library has ever been fetched, has
  // an empty cache to pick from. The wash stands in until there is something to
  // pick, and the STORED preference is untouched, so the next launch tries again.
  // Without this the veil paints over nothing: a page dimmed for no picture.
  if (!url) {
    root().setAttribute('data-ground', 'wash')
    return v
  }
  const img = await loadImage(url)
  if (mine !== token) return v
  const ends = img ? extremesOf(img) : null
  if (ends == null) {
    // No sample, so no claim about contrast: fall back to the wash rather than
    // showing an unmeasured photograph.
    root().setAttribute('data-ground', 'wash')
    return v
  }
  root().style.setProperty('--ground-veil-a', String(veilFor(ends, readPalette())))
  root().style.setProperty('--ground-src', `url("${url}")`)
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
}
