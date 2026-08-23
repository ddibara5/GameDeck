/**
 * repro/logo.mjs - the brand mark, when the accent comes from the artwork.
 *
 * The mark is seven flat polygons whose fills are --logo-1..7, and it reads as a
 * stack of slabs only because those seven sit at seven separated LIGHTNESSES.
 * Every palette ramp the app ships spans oklab L 0.33 to 0.83 with an even step
 * between neighbours, and that band is a property of the MARK, not of the
 * palette: walnut, slate, sage, plum and graphite all have it.
 *
 * The first art-accent ramp derived the seven by mixing the accent toward black
 * at fixed percentages, which makes every step a fraction of whatever lightness
 * the clamp happened to land on. In light mode the clamp DARKENS the accent
 * until it clears AA against a near-white ground; measured on the shipping
 * build it landed at L 0.31, so the seven ran 0.108 to 0.265 - the whole mark
 * below walnut's own DARKEST slab at 0.334. It rendered as a black blob, and
 * that is how it was reported.
 *
 * There was a second bug underneath it that nobody could see. The ramp was a
 * stylesheet rule on `:root[data-accent-art]`, specificity 0,2,0, and so is
 * `:root[data-accent="slate"]`, which defines the same seven tokens and sits
 * later in index.css. Slate, Sage, Plum and Graphite therefore kept their own
 * ramp with the flag on, and never had the feature at all.
 *
 * Those two are why this file measures what it measures, and how:
 *
 *   1. AS ARITHMETIC. artLogoRamp and artAmber are pure, so both are swept over
 *      every hue at every saturation at every lightness the clamp can produce,
 *      in both themes, taken through clampAccent itself rather than invented.
 *      That is the only evidence that covers artwork nobody has looked at.
 *   2. AS RENDERED FILLS, read off the POLYGONS rather than off the tokens. A
 *      token check reads what the stylesheet says, and for four of five palettes
 *      the stylesheet was not what was on screen. Four palette/theme
 *      combinations, against a deliberately dark and nearly grey picture, which
 *      is the case that collapsed.
 *
 * Run: PW_CHROME=... BASE=http://127.0.0.1:4173 node repro/logo.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://127.0.0.1:4173'
const results = []
const check = (name, pass, got) => {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${got !== undefined ? `  ::  ${got}` : ''}`)
}

/* ---------------------------------------------------------------- oklab */
const lin = (c) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) }
function oklab([r, g, b]) {
  const R = lin(r), G = lin(g), B = lin(b)
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ]
}
const okL = (rgb) => oklab(rgb)[0]
const okC = (rgb) => { const o = oklab(rgb); return Math.hypot(o[1], o[2]) }

/* THE BAND THE FIVE SHIPPED RAMPS ACTUALLY OCCUPY, measured rather than chosen:
 *
 *   walnut    0.334 .. 0.784      sage     0.379 .. 0.823
 *   slate     0.343 .. 0.757      plum     0.331 .. 0.778
 *   graphite  0.348 .. 0.831
 *
 * The bars below are the loosest reading of that: the darkest slab must not be
 * darker than any shipped one by more than a little, the lightest must not be
 * duller, and the step between neighbours has to stay big enough to see.
 *
 * STEP_MIN is 0.030 because WALNUT's own ramp has a 0.035 step between slabs 4
 * and 5. A bar the shipped art fails is a bar about my taste rather than about
 * the mark, so it is set below the tightest pair the designer actually drew. */
const DARKEST_MIN = 0.30
const LIGHTEST_MIN = 0.72
const STEP_MIN = 0.030
const SPREAD_MIN = 0.38

function judge(ramp) {
  const L = ramp.map(okL)
  const steps = L.slice(1).map((v, i) => v - L[i])
  return {
    L,
    darkest: L[0],
    lightest: L[6],
    spread: L[6] - L[0],
    minStep: Math.min(...steps),
    monotone: steps.every((d) => d > 0),
  }
}

/* ------------------------------------------- 1. the sweep, as pure arithmetic */
{
  const mod = await import('../web/src/lib/tint.js')
  const { artLogoRamp, clampAccent } = mod
  if (typeof artLogoRamp !== 'function') {
    check('the ramp holds its band for every accent the clamp can produce', false, 'artLogoRamp is not exported')
  } else {
    const hsl = (h, sat, l) => {
      if (sat === 0) { const v = Math.round(l * 255); return [v, v, v] }
      const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat
      const p2 = 2 * l - q
      const hue = (t) => {
        if (t < 0) t += 1
        if (t > 1) t -= 1
        if (t < 1 / 6) return p2 + (q - p2) * 6 * t
        if (t < 1 / 2) return q
        if (t < 2 / 3) return p2 + (q - p2) * (2 / 3 - t) * 6
        return p2
      }
      return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)].map((v) => Math.round(v * 255))
    }
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
    // The two extremes of what the clamp is allowed to hand over, taken through
    // the clamp itself rather than invented, so the sweep covers exactly the
    // colours that can reach the ramp in the shipping app.
    const GROUNDS = {
      dark: ['#1a1917', '#232120', '#2b2825'].map(hex),
      light: ['#efe8dd', '#f6f1e9', '#fdfaf4'].map(hex),
    }
    let worst = { spread: 9, minStep: 9, darkest: 9, lightest: 9 }
    let where = { spread: '', minStep: '', darkest: '', lightest: '' }
    let broke = 0
    let tried = 0
    for (const theme of ['dark', 'light']) {
      for (let h = 0; h < 360; h += 3) {
        for (let sat = 0; sat <= 1.0001; sat += 0.1) {
          for (let l = 0.05; l <= 0.95; l += 0.05) {
            const acc = clampAccent(hsl(h / 360, sat, l), theme, GROUNDS[theme])
            const r = artLogoRamp(acc)
            const j = judge(r)
            tried += 1
            if (!j.monotone) broke += 1
            const at = `${theme} h${h} s${sat.toFixed(1)} l${l.toFixed(2)}`
            for (const k of ['spread', 'minStep', 'darkest']) {
              if (j[k] < worst[k]) { worst[k] = j[k]; where[k] = at }
            }
            if (j.lightest < worst.lightest) { worst.lightest = j.lightest; where.lightest = at }
          }
        }
      }
    }
    console.log(`note   swept ${tried.toLocaleString()} clamped accents through the ramp`)
    check('every step is lighter than the one below it', broke === 0, `${broke} inversions of ${tried}`)
    check('the darkest slab never collapses toward black',
      worst.darkest >= DARKEST_MIN, `worst L ${worst.darkest.toFixed(3)} vs ${DARKEST_MIN}, at ${where.darkest}`)
    check('the lightest slab stays the light end of the stack',
      worst.lightest >= LIGHTEST_MIN, `worst L ${worst.lightest.toFixed(3)} vs ${LIGHTEST_MIN}, at ${where.lightest}`)
    check('the stack keeps its full depth',
      worst.spread >= SPREAD_MIN, `worst ${worst.spread.toFixed(3)} vs ${SPREAD_MIN}, at ${where.spread}`)
    check('no two neighbouring slabs read as one',
      worst.minStep >= STEP_MIN, `worst step ${worst.minStep.toFixed(3)} vs ${STEP_MIN}, at ${where.minStep}`)

    // The ramp must still be the PICTURE's colour, or it is just a grey stack
    // that happens to be legible. A saturated blue sample has to come back blue.
    const blue = clampAccent([47, 127, 184], 'light', GROUNDS.light)
    const bramp = artLogoRamp(blue)
    check('a coloured picture gives a coloured stack',
      bramp.every((c) => c[2] > c[0]), bramp.map((c) => `rgb(${c})`).join(' '))
    check('...and it keeps chroma at the dark end rather than fading to grey',
      okC(bramp[0]) >= okC(bramp[6]) * 0.5, `C ${okC(bramp[0]).toFixed(3)} vs ${okC(bramp[6]).toFixed(3)}`)

    // An achromatic picture must NOT be given a hue it does not have - the same
    // abstention clampAccent makes.
    const grey = clampAccent([120, 120, 120], 'dark', GROUNDS.dark)
    const gramp = artLogoRamp(grey)
    check('a grey picture stays grey',
      gramp.every((c) => Math.max(...c) - Math.min(...c) <= 6), gramp.map((c) => `rgb(${c})`).join(' '))
    check('...and a grey stack is still a stack', judge(gramp).spread >= SPREAD_MIN, judge(gramp).spread.toFixed(3))

    /* --amber is TEXT in fifteen places, so the mix that derives it from the art
       accent has to clear AA on every ground the app paints behind text. The
       argument for why it must - the mix sits between the accent, which already
       clears, and --text, which is further from the ground on the same side -
       is exactly the kind of reasoning this file exists to stop trusting. */
    const { artAmber } = mod
    if (typeof artAmber !== 'function') {
      check('the second accent clears AA wherever it is used as text', false, 'artAmber is not exported')
    } else {
      const TEXT = { dark: hex('#f2ece4'), light: hex('#232830') }
      const srgbc = (c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) }
      const lum = ([r, g, b]) => 0.2126 * srgbc(r) + 0.7152 * srgbc(g) + 0.0722 * srgbc(b)
      const ratio = (a, b) => {
        const x = lum(a), y = lum(b), hi = Math.max(x, y), lo = Math.min(x, y)
        return (hi + 0.05) / (lo + 0.05)
      }
      let aWorst = 99
      let aAt = ''
      let aTried = 0
      for (const theme of ['dark', 'light']) {
        for (let h = 0; h < 360; h += 3) {
          for (let sat = 0; sat <= 1.0001; sat += 0.1) {
            for (let l = 0.05; l <= 0.95; l += 0.05) {
              const acc = clampAccent(hsl(h / 360, sat, l), theme, GROUNDS[theme])
              const am = artAmber(acc, TEXT[theme])
              aTried += 1
              for (const g of GROUNDS[theme]) {
                const r = ratio(am, g)
                if (r < aWorst) { aWorst = r; aAt = `${theme} h${h} s${sat.toFixed(1)} l${l.toFixed(2)}` }
              }
            }
          }
        }
      }
      check('the second accent clears AA wherever it is used as text',
        aWorst >= 4.5 - 1e-9, `worst ${aWorst.toFixed(2)} over ${aTried.toLocaleString()} accents, at ${aAt}`)
    }
  }
}

/* ------------------------------------------------------- 2. the rendered mark */
const games = [1, 2, 3, 4].map((i) => ({
  master_id: i, title: `Game ${i}`, environment: 'xbox', playtime_minutes: 600, playtime_label: '10h',
  last_played: new Date(Date.now() - i * 3600000).toISOString(), earned_awards: 5, total_awards: 20,
  percent: 25, cover_igdb: 'coclf1', igdb_id: 100 + i, igdb_rating: 85, release_year: 2025,
  genre: 'Role-playing (RPG)', length_minutes: 3000, keywords: [], platforms: ['Xbox'], franchises: [],
}))
// DARK AND NEARLY GREY, which is the case that collapsed: the clamp has the
// least room to work with, so the accent lands near the end of its travel.
const ART = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">
  <rect width="640" height="360" fill="#2a2c31"/>
  <circle cx="200" cy="140" r="150" fill="#3a3f47"/></svg>`
const PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
// The discover rows the ground resolves a backdrop from. Their ids MUST match
// the library games' igdb_id: the first run of this harness reported
// data-accent-art false everywhere because they did not, so nothing was sampled
// and every ramp measured was the palette's own. A fixture that quietly supplies
// no artwork makes an art-accent harness pass by measuring nothing.
const disc = [0, 1, 2, 3].map((i) => ({
  id: 100 + i, name: `Game ${i}`, summary: 'A game.', cover: null, coverId: 'coclf1', year: 2026,
  rating: 88, genres: [], keywords: [], themes: [], platforms: [], companies: [],
  backdropId: 'arart' + i, backdropKind: 'artwork',
  release: { ts: 1790000000, precision: 'day', label: 'Sep 24, 2026' },
}))

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME })

async function open(theme, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1,
    serviceWorkers: 'block', timezoneId: 'America/New_York' })
  const page = await ctx.newPage()
  const json = (r, b) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) })
  await page.route('**/rest/v1/**', (r) => json(r, r.request().url().includes('/games') ? games : []))
  await page.route('**/api/**', (r) => {
    const u = r.request().url()
    if (u.includes('/api/tint')) return r.fallback()
    const keyed = (p, w) => {
      const m = new RegExp(`[?&]${p}=([^&]*)`).exec(u)
      if (!m) return null
      const o = {}
      for (const k of decodeURIComponent(m[1]).split(',')) o[k] = disc
      return { [w]: o }
    }
    return json(r, keyed('home', 'rails') || keyed('lanes', 'lanes') || { games: disc })
  })
  // Registered LAST so it wins: Playwright matches route handlers newest first.
  await page.route('**/api/tint**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: opts.art || ART }))
  const png = (r) => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(PX, 'base64') })
  await page.route('**images.igdb.com/**', png)
  await page.route('**wsrv.nl/**', png)
  await page.addInitScript((o) => {
    try {
      localStorage.setItem('gamedeck_theme_v1', o.t)
      localStorage.setItem('gamedeck_accent_v1', o.a)
      localStorage.setItem('gamedeck_ground_v1', 'nowplaying')
      if (o.art) localStorage.setItem('gamedeck_accent_art_v1', '1')
    } catch { /* ignore */ }
  }, { t: theme, a: opts.accent || 'walnut', art: opts.on !== false })
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2200)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2600)
  return { ctx, page }
}

// The fills as PAINTED, read off the polygons rather than off the tokens: the
// tokens are what a stylesheet says and the fills are what the mark is, and the
// two came apart once already, when a later palette block outranked the art
// ramp at equal specificity and the art ramp silently never applied.
const amberOf = (page) => page.evaluate(() => {
  const el = document.createElement('span')
  el.style.cssText = 'position:absolute;visibility:hidden'
  el.style.color = getComputedStyle(document.documentElement).getPropertyValue('--amber')
  document.body.appendChild(el)
  const out = getComputedStyle(el).color.match(/\d+/g).slice(0, 3).map(Number)
  el.remove()
  return out
})

const fills = (page) => page.evaluate(() => {
  const out = []
  for (let i = 1; i <= 7; i += 1) {
    const el = document.querySelector(`.gd-logo .l${i}`)
    if (!el) return null
    out.push(getComputedStyle(el).fill.match(/\d+/g).slice(0, 3).map(Number))
  }
  return out
})

for (const accent of ['walnut', 'slate']) {
  for (const theme of ['dark', 'light']) {
    const { ctx, page } = await open(theme, { accent })
    const applied = await page.evaluate(() => document.documentElement.hasAttribute('data-accent-art'))
    const f = await fills(page)
    if (!f) { check(`${accent}/${theme}: the mark rendered`, false, 'no polygons'); await ctx.close(); continue }
    const j = judge(f)
    check(`${accent}/${theme}: the art accent is applied at all`, applied, String(applied))
    console.log(`note   ${accent}/${theme} L: ${j.L.map((x) => x.toFixed(2)).join(' ')}`)
    check(`${accent}/${theme}: the painted slabs run dark to light`, j.monotone, j.L.map((x) => x.toFixed(2)).join(' '))
    check(`${accent}/${theme}: the darkest painted slab is not black`,
      j.darkest >= DARKEST_MIN, `L ${j.darkest.toFixed(3)} vs ${DARKEST_MIN}`)
    check(`${accent}/${theme}: the painted stack keeps its depth`,
      j.spread >= SPREAD_MIN, `${j.spread.toFixed(3)} vs ${SPREAD_MIN}`)
    check(`${accent}/${theme}: no two painted slabs read as one`,
      j.minStep >= STEP_MIN, `${j.minStep.toFixed(3)} vs ${STEP_MIN}`)
    // The palette ambers, both themes, so "it followed the art" is falsifiable
    // rather than a value that happens to be set. slate/light is the case that
    // was broken: its 0,3,0 rule outranked the art rule outright.
    const PALETTE_AMBER = {
      'walnut/dark': [224, 135, 26], 'walnut/light': [194, 112, 15],
      'slate/dark': [127, 176, 224], 'slate/light': [63, 116, 171],
    }
    const am = await amberOf(page)
    const was = PALETTE_AMBER[`${accent}/${theme}`]
    check(`${accent}/${theme}: the second accent followed the picture too`,
      am.some((v, i) => Math.abs(v - was[i]) > 6), `rgb(${am}) vs palette rgb(${was})`)
    await ctx.close()
  }
}

// With the flag off the mark must be the palette's own ramp, untouched. This is
// the abstention: the feature is a flag over the palette, not a replacement.
{
  const { ctx, page } = await open('dark', { accent: 'slate', on: false })
  const f = await fills(page)
  check('with the flag off, slate keeps its own ramp',
    f && f[6][2] > f[6][0] && Math.abs(f[6][0] - 0x86) <= 2, f ? `rgb(${f[6]})` : 'no polygons')
  await ctx.close()
}

await browser.close()
const pass = results.filter(Boolean).length
console.log(`\n${pass}/${results.length} passed`)
process.exit(pass === results.length ? 0 : 1)
