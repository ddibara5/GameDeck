// Pure colour utilities retained for the optional artwork-derived logo accent
// audit. Game sheets no longer import this module, read image pixels, or derive
// their surface from artwork.
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

/* ---------------------------------------------------------------- the accent

   An accent is used both ways at once - as a fill with knockout
   --bg text on it (the tab pill, the segmented control's active chip, a primary
   button) and as text on --surface (values, links, the progress arc) - so it has
   to be FAR from the neutrals in both directions, not near them.

   The bands are not constants here, and that is the whole difference from
   a surface treatment. Every colour theme ships its own --bg / --surface / --surface-2,
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
/* ---------- The brand mark's ramp, from the picture ----------

   The lockup is seven flat polygons whose fills are --logo-1..7, and it reads as
   a stack of slabs only because those seven sit at seven separated LIGHTNESSES.
   Measured off the five ramps the app ships, in oklab L:

     walnut    0.334 0.402 0.479 0.565 0.599 0.666 0.784
     slate     0.343 0.410 0.480 0.548 0.613 0.688 0.757
     sage      0.379 0.452 0.527 0.600 0.669 0.747 0.823
     plum      0.331 0.396 0.469 0.546 0.621 0.700 0.778
     graphite  0.348 0.419 0.502 0.585 0.672 0.753 0.831

   Five different hues, one band. So the band belongs to the MARK and the hue
   belongs to the palette - and, here, to the picture.

   The first version of this got that backwards. It derived the seven by mixing
   the accent toward black at fixed percentages, which makes every slab a
   fraction of whatever lightness the clamp happened to land on. In light mode
   the clamp darkens the accent until it clears AA against a near-white ground,
   so it lands around L 0.31, and 35% of that is 0.11. The whole mark rendered
   below walnut's DARKEST slab: a black blob, which is exactly what it was
   reported as. Mixing toward black also scales chroma by the same factor, so the
   dark slabs lost their colour as well as their light.

   This keeps the picture's HUE and SATURATION - the same two things clampAccent
   preserves - and places each slab at the mark's own lightness instead. oklab L
   is monotone in HSL lightness at fixed hue and saturation, so a bisection finds
   the one HSL lightness that lands on each target. HSL is the search space on
   purpose: every point in it is in gamut, so no clipping step is needed, and
   chroma comes out with the natural mid-lightness peak the shipped ramps have
   rather than a straight line.

   Theme-independent, and that matches the shipped design rather than being an
   oversight: the five palettes redefine --accent and --amber in their light
   blocks and leave --logo-1..7 alone, so each palette has ONE ramp. It falls out
   for free here, because clampAccent moves only lightness - the hue and the
   saturation it hands back are the same in both themes. */
const LOGO_L = [0.35, 0.42, 0.49, 0.57, 0.64, 0.71, 0.79]
const LOGO_BISECT = 18

const okChan = (c) => {
  const x = c / 255
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
}

/** oklab lightness only - the forward direction, which is all the search needs. */
function okLight([r, g, b]) {
  const R = okChan(r)
  const G = okChan(g)
  const B = okChan(b)
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
}

function okChanBack(x) {
  const v = x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, Math.round(v * 255)))
}

/** Full oklab, both directions - only artAmber needs the round trip. */
function toOklab([r, g, b]) {
  const R = okChan(r)
  const G = okChan(g)
  const B = okChan(b)
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ]
}

function fromOklab([L, A, B]) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3
  return [
    okChanBack(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    okChanBack(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    okChanBack(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ]
}

const AMBER_MIX = 0.72

/**
 * The palette's SECOND accent, when the first one came from artwork.
 *
 * The same mix index.css used to do - 72% of the accent, 28% of the body text
 * colour, in oklab - moved into JS for the same reason the logo ramp was: as a
 * stylesheet rule it was `:root[data-accent-art]` at specificity 0,2,0, and
 * `:root[data-accent="slate"][data-theme="light"]` is 0,3,0, so the light theme
 * of every non-default palette outranked it and kept its own amber. Source order
 * could not fix that one. An inline custom property cannot be outranked at all,
 * so everything the art accent owns is now set the same way, in one place.
 *
 * Mixing TOWARD --text is what keeps this safe to use as text, which it is in
 * fifteen places. --text is the far end from every ground and the accent already
 * clears AA in that same direction, so the mix sits between two colours on one
 * side of the ground and can only gain contrast, never lose it.
 *
 * @param {number[]} accent the clamped accent
 * @param {number[]} text the live --text, so this follows the theme
 */
export function artAmber(accent, text) {
  if (!accent || !text) return null
  const a = toOklab(accent)
  const t = toOklab(text)
  return fromOklab(a.map((v, i) => v * AMBER_MIX + t[i] * (1 - AMBER_MIX)))
}

/**
 * The seven logo fills for an accent taken from artwork, darkest first.
 *
 * @param {number[]} rgb the CLAMPED accent, as clampAccent returns it
 * @returns {number[][]|null} seven rgb triples, or null with no accent
 */
export function artLogoRamp(rgb) {
  if (!rgb) return null
  const [h, s] = rgbToHsl(rgb[0], rgb[1], rgb[2])
  return LOGO_L.map((want) => {
    let lo = 0
    let hi = 1
    for (let i = 0; i < LOGO_BISECT; i += 1) {
      const mid = (lo + hi) / 2
      if (okLight(hslToRgb(h, s, mid)) < want) lo = mid
      else hi = mid
    }
    return hslToRgb(h, s, (lo + hi) / 2)
  })
}

export function clampAccent(rgb, theme = 'dark', grounds = []) {
  if (!rgb || !grounds.length) return null
  const [h, s0, l0] = rgbToHsl(rgb[0], rgb[1], rgb[2])
  // An achromatic sample has no hue to keep - forcing the saturation floor onto
  // one invents a colour, so it stays neutral
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
