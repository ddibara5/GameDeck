/**
 * Sample one representative colour out of a game's art, clamped into a range
 * that is safe to put text on.
 *
 * WHY A SAMPLED COLOUR RATHER THAN THE IMAGE ITSELF. The sheet used to paint a
 * blurred screenshot behind a veil, and the veil had to be opaque enough to
 * protect the body text against the worst art a game can have: a blown-out
 * white screenshot. At the opacity that needs, the art contributes almost
 * nothing - measured, a typical dark screenshot moved the sheet by ONE rgb
 * unit. The image and the text were fighting over the same pixels and the text
 * had to win.
 *
 * A sampled colour breaks the fight. Clamping lightness and saturation means
 * the ground the text sits on is KNOWN, whatever the art looks like, so the
 * tint can be strong enough to see and the contrast is still computable. The
 * blurred art stays as the hero band at the top; this is what the rest of the
 * card is painted with.
 *
 * Sampled from the COVER, not from a screenshot: the cover is already on screen
 * (it is the thing you tapped) and already in the browser cache, so the colour
 * resolves on the first frame instead of after the IGDB media fetch.
 */

// Small enough that the decode is free and the average is not dominated by one
// bright highlight. 8x8 downscaling is done by the browser's own filter, which
// is a box average over the whole image - exactly what we want.
const GRID = 8

// Anything at or below this alpha is transparent padding, not art.
const MIN_ALPHA = 200

// Lightness the tint is squeezed into, per theme. This is the whole safety
// argument: whatever the cover looks like, the card lands inside this band, so
// the contrast of every piece of text on it can be computed once instead of
// measured per game.
//
// The bounds were SOLVED, not picked, by sweeping all 360 hues at every
// saturation the clamp below allows, against the weakest text the card carries.
// That text is --text, because the sheet's own body copy and meta row were
// moved off --muted for exactly this reason: --muted bound the band so tightly
// that a pale cover in light mode produced a card 8 rgb units from the untinted
// one, which is the invisible tint this feature already shipped once.
//
//   dark  L 0.19 -> 8.04:1     light L 0.83 -> 8.39:1
//   dark  L 0.22 -> 6.80:1     light L 0.85 -> 9.07:1
//
// So the bands below hold roughly 8:1 at their worst hue, and a warm pale cover
// - the case that disappeared before - now lands 31 rgb units off the surface.
const LIGHT_RANGE = { dark: [0.13, 0.2], light: [0.83, 0.88] }

// Covers are often near-monochrome; without a floor the tint reads as grey and
// the whole feature is invisible again. Without a ceiling a saturated key art
// paints the card in neon.
const SAT_RANGE = [0.18, 0.42]

// Below this the source has no hue to preserve - a greyscale or near-black
// cover. Forcing the saturation floor onto one invents a colour: rgb(128,128,128)
// came out of the clamp as rgb(60,42,42), a red-brown card for a grey cover,
// because a fully desaturated colour reports hue 0. Those stay neutral.
const ACHROMATIC = 0.05

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [h, s, l]
}

function hslToRgb(h, s, l) {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v] }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue = (t) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)].map((v) => Math.round(v * 255))
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

/**
 * Squeeze an arbitrary sampled colour into the safe band for a theme.
 * Hue is kept exactly; only lightness and saturation move.
 */
export function clampTint(rgb, theme = 'dark') {
  if (!rgb) return null
  const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2])
  const [lo, hi] = LIGHT_RANGE[theme === 'light' ? 'light' : 'dark']
  const ll = clamp(l, lo, hi)
  if (s < ACHROMATIC) return hslToRgb(0, 0, ll)
  return hslToRgb(h, clamp(s, SAT_RANGE[0], SAT_RANGE[1]), ll)
}

/**
 * Average colour of an image, or null if it cannot be read.
 *
 * Returns null rather than throwing on a cross-origin image the CDN did not
 * mark: `crossOrigin = 'anonymous'` makes such an image fail to LOAD, and a
 * canvas that did somehow get tainted throws on getImageData. Both land on the
 * same fallback, which is the untinted surface the card had before.
 */
export function sampleImage(url) {
  return new Promise((resolve) => {
    if (!url || typeof document === 'undefined') return resolve(null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    let settled = false
    const done = (v) => { if (!settled) { settled = true; resolve(v) } }
    img.onerror = () => done(null)
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = GRID; c.height = GRID
        const ctx = c.getContext('2d', { willReadFrequently: false })
        ctx.drawImage(img, 0, 0, GRID, GRID)
        const d = ctx.getImageData(0, 0, GRID, GRID).data
        let r = 0, g = 0, b = 0, n = 0
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < MIN_ALPHA) continue
          r += d[i]; g += d[i + 1]; b += d[i + 2]; n++
        }
        done(n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : null)
      } catch {
        done(null) // tainted canvas
      }
    }
    img.src = url
    // A cover already in the cache decodes synchronously enough that `complete`
    // is true before onload would fire; calling it directly avoids a frame.
    if (img.complete && img.naturalWidth) img.onload()
  })
}

/**
 * Sample and clamp in one call. Resolves to a css rgb() string, or null.
 *
 * This used to hand back a data url of the picture as well, on the reasoning
 * that a CSS background-image is fetched without crossOrigin and could not
 * share a cache entry with this read. **That reasoning was wrong**, and the
 * measurement that seemed to confirm it was taken under Playwright's
 * page.route, which bypasses the HTTP cache and so reports two fetches whatever
 * the truth is.
 *
 * Measured properly, with no interception, on this origin: the second request
 * for the same url transfers 300 bytes against the first one's 5611, whether it
 * is an <img> or a CSS background. Chromium keys the cache by url, not by CORS
 * mode, and /api/tint is same-origin and immutable. One fetch, reused.
 *
 * So the data url was solving a problem that did not exist, and it cost real
 * work: at the 90px cover the re-encode was free, but at 569px key art it was
 * ~40KB of base64 built on the main thread on every open. The backdrop is a
 * plain <img> now.
 */
export async function coverLook(url, theme = 'dark') {
  const t = clampTint(await sampleImage(url), theme)
  return t ? `rgb(${t[0]}, ${t[1]}, ${t[2]})` : null
}

/* ---------------------------------------------------------------- the accent

   clampTint solves the OPPOSITE problem to this one. There, the sampled colour
   becomes a surface and text goes on top, so it is squeezed towards the theme's
   background. An accent is used both ways at once - as a fill with knockout
   --bg text on it (the tab pill, the segmented control's active chip, a primary
   button) and as text on --surface (values, links, the progress arc) - so it has
   to be FAR from the neutrals in both directions, not near them.

   The bands are not constants here, and that is the whole difference from
   clampTint. Every colour theme ships its own --bg / --surface / --surface-2,
   and an art-derived accent sits on whichever one the user has selected, so a
   band solved against one palette is wrong on the other four. This walks the
   lightness away from the neutrals until the composite clears, against the
   grounds READ OFF THE PAGE. It is the same shape as ground.js's veilFor and for
   the same reason: inverting the sRGB curve is a page of algebra that would need
   its own test, and 60 steps of a two-line loop is nothing on a once-per-load
   path.

   It cannot fail to terminate: dark walks up to 0.96 and light down to 0.06,
   and both ends clear 4.5 against any neutral either theme ships. */
const ACCENT_SAT = [0.22, 0.55]
const ACCENT_STEP = 0.015
const ACCENT_LIMIT = { dark: 0.96, light: 0.06 }
const AA = 4.5

const srgbC = (c) => {
  const x = c / 255
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}
const lumOf = ([r, g, b]) => 0.2126 * srgbC(r) + 0.7152 * srgbC(g) + 0.0722 * srgbC(b)
const contrastOf = (a, b) => {
  const x = lumOf(a)
  const y = lumOf(b)
  const hi = Math.max(x, y)
  const lo = Math.min(x, y)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Squeeze a sampled colour into an accent that clears AA against every ground it
 * will touch. `grounds` is a list of rgb triples - the theme's --bg, --surface
 * and --surface-2, resolved by the caller.
 *
 * Hue is kept exactly. Saturation is clamped: below the floor an art accent
 * reads as grey and the feature is invisible, above the ceiling a saturated key
 * art paints the whole app in neon.
 */
export function clampAccent(rgb, theme = 'dark', grounds = []) {
  if (!rgb || !grounds.length) return null
  const [h, s0, l0] = rgbToHsl(rgb[0], rgb[1], rgb[2])
  // An achromatic sample has no hue to keep - forcing the saturation floor onto
  // one invents a colour, exactly as it does in clampTint - so it stays neutral
  // and only its lightness moves.
  const s = s0 < ACHROMATIC ? 0 : clamp(s0, ACCENT_SAT[0], ACCENT_SAT[1])
  const up = theme !== 'light'
  const limit = up ? ACCENT_LIMIT.dark : ACCENT_LIMIT.light
  const clears = (l) => {
    const c = hslToRgb(h, s, l)
    return grounds.every((g) => contrastOf(c, g) >= AA) ? c : null
  }
  // Start where the picture actually is, so a colour that already clears keeps
  // its own lightness rather than being pushed to a band's edge.
  for (let l = clamp(l0, 0.06, 0.96); up ? l <= limit : l >= limit; l += up ? ACCENT_STEP : -ACCENT_STEP) {
    const hit = clears(l)
    if (hit) return hit
  }
  return hslToRgb(h, s, limit)
}
