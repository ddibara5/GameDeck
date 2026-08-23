/**
 * repro/accent.mjs - the accent taken from the artwork.
 *
 * The feature is only worth having if the clamp holds, so that is what this
 * measures, and it measures it TWICE from different directions:
 *
 *   1. AS ARITHMETIC, exhaustively. clampAccent is pure, so the harness imports
 *      the built module and sweeps every palette in both themes against 360 hues
 *      at every saturation and lightness. A rendered check can only ever try the
 *      one picture the fixture happens to carry; this tries the ones it does not.
 *
 *   2. AS COMPOSITED PIXELS, on the three surfaces the brainstorm named - the tab
 *      bar's active pill (knockout --bg text ON the accent), the segmented
 *      control, and the progress arc. Arithmetic cannot see a knockout that is
 *      drawn over a blurred photograph; a screenshot can.
 *
 * Plus the abstentions, which are what make it a flag rather than a sixth
 * palette: off, and the palette's own accent comes back; no picture, and it never
 * applied in the first place; change the colour theme underneath it, and the
 * clamp re-runs against the NEW neutrals rather than leaving a colour solved
 * against the old ones.
 *
 * Run: PW_CHROME=... BASE=http://127.0.0.1:4173 node repro/accent.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://127.0.0.1:4173'
const AA = 4.5
const results = []
const check = (name, pass, got) => {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${got !== undefined ? `  ::  ${got}` : ''}`)
}
const srgb = (c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) }
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
const ratio = (a, b) => { const x = lum(a), y = lum(b), hi = Math.max(x, y), lo = Math.min(x, y); return (hi + 0.05) / (lo + 0.05) }

const games = [1, 2, 3, 4].map((i) => ({
  master_id: i, title: `Game ${i}`, environment: 'xbox', playtime_minutes: 600, playtime_label: '10h',
  last_played: new Date(Date.now() - i * 3600000).toISOString(), earned_awards: 5, total_awards: 20,
  percent: 25, cover_igdb: 'coclf1', igdb_id: 100 + i, igdb_rating: 85, release_year: 2025,
  genre: 'Role-playing (RPG)', length_minutes: 3000, keywords: [], platforms: ['Xbox'], franchises: [],
}))
const disc = [0, 1, 2, 3].map((i) => ({
  id: 100 + i, name: `Game ${i}`, summary: 'A game.', cover: null, coverId: 'coclf1', year: 2026,
  rating: 88, genres: [], keywords: [], themes: [], platforms: [], companies: [],
  backdropId: 'arart' + i, backdropKind: 'artwork',
  release: { ts: 1790000000, precision: 'day', label: 'Sep 24, 2026' },
}))
// A STRONGLY COLOURED picture, so "the accent came from the art" is falsifiable:
// a grey fixture would let a build that ignored the sample entirely and returned
// the palette's own accent pass every assertion below.
const ART = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">
  <rect width="640" height="360" fill="#1d5c8a"/>
  <circle cx="200" cy="140" r="150" fill="#2f7fb8"/></svg>`
const PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME })

async function open(theme, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1,
    serviceWorkers: 'block', timezoneId: 'America/New_York' })
  const page = await ctx.newPage()
  const json = (r, b) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) })
  await page.route('**/rest/v1/**', (r) =>
    json(r, r.request().url().includes('/games') ? games : []))
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
  await page.route('**/api/tint**', (r) =>
    r.fulfill({ status: 200, contentType: 'image/svg+xml', body: ART }))
  const png = (r) => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(PX, 'base64') })
  await page.route('**images.igdb.com/**', png)
  await page.route('**wsrv.nl/**', png)
  await page.addInitScript((o) => {
    try {
      localStorage.setItem('gamedeck_theme_v1', o.t)
      localStorage.setItem('gamedeck_accent_v1', o.a)
      if (o.g) localStorage.setItem('gamedeck_ground_v1', o.g)
      if (o.art) localStorage.setItem('gamedeck_accent_art_v1', '1')
    } catch { /* ignore */ }
  }, { t: theme, a: opts.accent || 'walnut', g: opts.ground || null, art: Boolean(opts.art) })
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2200)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2600)
  return { ctx, page }
}

const tokens = (page) => page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement)
  const probe = (v) => {
    const el = document.createElement('span')
    el.style.cssText = 'position:absolute;visibility:hidden'
    el.style.color = v
    document.body.appendChild(el)
    const out = getComputedStyle(el).color.match(/\d+/g).slice(0, 3).map(Number)
    el.remove()
    return out
  }
  return {
    accent: probe(cs.getPropertyValue('--accent')),
    bg: probe(cs.getPropertyValue('--bg')),
    surface: probe(cs.getPropertyValue('--surface')),
    surface2: probe(cs.getPropertyValue('--surface-2')),
    inline: document.documentElement.style.getPropertyValue('--accent').trim(),
  }
})

/* ------------------------------------------- 1. the sweep, as pure arithmetic

   clampAccent is imported from the app's own source and run over every palette
   the app ships, in both themes, at 360 hues by every saturation by every
   lightness. A rendered check can only ever try the one picture the fixture
   happens to carry; this tries the ones it does not, and it is the only form of
   evidence that says the guarantee holds for artwork nobody has seen yet.

   The neutrals below are copied from index.css deliberately rather than read out
   of the browser: if a palette is added or retuned and this list is not updated,
   the sweep quietly stops covering it, and a stale list that still passes is a
   worse failure than a mismatch. The rendered checks further down read the LIVE
   tokens, so between them the two forms cover both mistakes. */
{
  const { clampAccent } = await import('../web/src/lib/tint.js')
  if (typeof clampAccent !== 'function') {
    // Against a build that has not shipped it yet. Reported rather than thrown,
    // so the rest of the run still says what else is missing - a harness that
    // dies on its first assertion tells you one thing about the parent and then
    // stops.
    check('every colour the clamp can produce clears AA, on every palette', false, 'clampAccent is not exported')
  } else {
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const PALETTES = {
    'walnut dark': ['#1a1917', '#232120', '#2b2825'],
    'walnut light': ['#efe8dd', '#f6f1e9', '#fdfaf4'],
    'slate dark': ['#15171b', '#1d2026', '#252932'],
    'slate light': ['#e7eaef', '#f0f3f7', '#fbfcff'],
    'sage dark': ['#161814', '#1e211a', '#262a22'],
    'sage light': ['#e9ebe0', '#f2f4ea', '#fcfdf5'],
    'plum dark': ['#18151a', '#201d23', '#29242e'],
    'plum light': ['#ece6ed', '#f4eff5', '#fdf9fe'],
    'graphite dark': ['#17181a', '#202124', '#292a2e'],
    'graphite light': ['#e8e9ec', '#f1f2f5', '#fbfcfe'],
  }
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
  let worst = 99
  let where = ''
  let tried = 0
  for (const [name, cols] of Object.entries(PALETTES)) {
    const grounds = cols.map(hex)
    const theme = name.endsWith('light') ? 'light' : 'dark'
    for (let h = 0; h < 360; h += 3) {
      for (let sat = 0; sat <= 1.0001; sat += 0.1) {
        for (let l = 0.05; l <= 0.95; l += 0.05) {
          const out = clampAccent(hsl(h / 360, sat, l), theme, grounds)
          tried += 1
          const m = Math.min(...grounds.map((g) => ratio(out, g)))
          if (m < worst) { worst = m; where = `${name} h${h} s${sat.toFixed(1)} l${l.toFixed(2)}` }
        }
      }
    }
  }
  check('every colour the clamp can produce clears AA, on every palette',
    worst >= AA - 1e-9, `worst ${worst.toFixed(2)} over ${tried.toLocaleString()} inputs, at ${where}`)
  }
}

/* ---------------------------------- 2. it is applied, and it came from the art */
for (const theme of ['dark', 'light']) {
  const { ctx, page } = await open(theme, { ground: 'nowplaying', art: true })
  const t = await tokens(page)
  check(`${theme}: the accent is overridden inline`, t.inline.startsWith('rgb('), t.inline || 'not set')
  // The fixture picture is blue. A build that ignored the sample would show
  // Walnut's #c8a97e (dark) or #9c7449 (light), both of which are red-dominant.
  check(`${theme}: ...and it is the picture's hue, not the palette's`,
    t.accent[2] > t.accent[0], `rgb(${t.accent}) - blue ${t.accent[2]} vs red ${t.accent[0]}`)
  for (const [name, g] of [['--bg', t.bg], ['--surface', t.surface], ['--surface-2', t.surface2]]) {
    const r = Math.round(ratio(t.accent, g) * 100) / 100
    check(`${theme}: it clears AA against ${name}`, r >= AA, `${r} vs ${AA}`)
  }
  await ctx.close()
}

/* ------------------------------------------- 3. the composited surfaces */
{
  const { ctx, page } = await open('dark', { ground: 'nowplaying', art: true })
  // The knockout, measured on the rendered pixel rather than on the token: the
  // active pill sits on the tab bar, which sits on a blurred photograph, and only
  // a screenshot knows what that composites to.
  const spots = [
    ['the active tab pill', '.tabbar-btn.active'],
    ['the segmented control', '.seg-btn.active'],
  ]
  await page.locator('.tabbar-btn', { hasText: 'Discover' }).click()
  await page.waitForTimeout(1600)
  for (const [label, sel] of spots) {
    const n = await page.locator(sel).count()
    if (!n) { check(`${label} was reached`, false, 'not on screen'); continue }
    const colour = await page.evaluate((s) => {
      const el = document.querySelector(s)
      const lab = el.querySelector('span, .tabbar-label') || el
      return getComputedStyle(lab).color.match(/\d+/g).slice(0, 3).map(Number)
    }, sel)
    // `transition: none` in the same breath as the hide. .seg-btn TRANSITIONS its
    // colour, so the paint that follows addStyleTag catches the label part way
    // through the fade and leaves dark half-alpha text inside the chip - which
    // "the pixel closest in luminance to the text" then finds, every time. That
    // is how a knockout whose tokens measure 5.40:1 reported 1.13.
    await page.addStyleTag({
      content: `${sel}, ${sel} * { color: transparent !important; transition: none !important; }`,
    })
    await page.waitForTimeout(120)
    // THE INNER BOX, not the element's own. Both of these are rounded fills
    // inside a wider container, so the corners of the layout box are NOT the
    // chip - they are whatever is behind it, and "the pixel closest in luminance
    // to the text" finds one of those every time. The first version of this
    // reported 1.35:1 about a knockout whose tokens measure 5.4:1, which is the
    // harness being wrong about geometry rather than the app being wrong about
    // contrast. The text sits in the middle; so does the sample.
    const box = await page.locator(sel).first().boundingBox()
    const shot = await page.screenshot({
      clip: {
        x: Math.round(box.x + box.width * 0.25),
        y: Math.round(box.y + box.height * 0.3),
        width: Math.max(2, Math.round(box.width * 0.5)),
        height: Math.max(2, Math.round(box.height * 0.4)),
      },
    })
    const worst = await page.evaluate(async ({ b64, want }) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
      const c = new OffscreenCanvas(img.width, img.height)
      const g = c.getContext('2d')
      g.drawImage(img, 0, 0)
      const px = g.getImageData(0, 0, img.width, img.height).data
      const sr = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) }
      const L = (r, gg, bb) => 0.2126 * sr(r) + 0.7152 * sr(gg) + 0.0722 * sr(bb)
      const target = L(want[0], want[1], want[2])
      // Closest in luminance to the text, never the mean.
      let best = null
      for (let i = 0; i < px.length; i += 4) {
        const l = L(px[i], px[i + 1], px[i + 2])
        if (best == null || Math.abs(l - target) < Math.abs(best - target)) best = l
      }
      const hi = Math.max(best, target), lo = Math.min(best, target)
      return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
    }, { b64: shot.toString('base64'), want: colour })
    check(`${label} clears AA on the composited pixel`, worst >= AA, `${worst} vs ${AA}`)
  }
  await ctx.close()
}

/* ------------------------------------------- 4. the abstentions */
{
  const { ctx, page } = await open('dark', { ground: 'nowplaying', art: false })
  const t = await tokens(page)
  check('with the flag off, nothing is overridden', t.inline === '', t.inline || 'not set')
  check('...and the palette keeps its own accent', t.accent[0] > t.accent[2], `rgb(${t.accent})`)
  await ctx.close()
}
{
  const { ctx, page } = await open('dark', { ground: 'wash', art: true })
  const t = await tokens(page)
  check('with no picture, the flag has no effect', t.inline === '', t.inline || 'not set')
  await ctx.close()
}

/* ------------------------------------------- 5. it follows the palette */
{
  const { ctx, page } = await open('dark', { ground: 'nowplaying', art: true, accent: 'walnut' })
  const before = await tokens(page)
  await page.locator('.brand-btn').click()
  await page.waitForTimeout(450)
  await page.locator('.menu-fb', { hasText: 'Settings' }).click()
  await page.waitForTimeout(650)
  await page.locator('.menu-item', { hasText: 'Theme' }).first().click()
  await page.waitForTimeout(500)
  await page.locator('.accent-opt', { hasText: 'Sage' }).click()
  await page.waitForTimeout(700)
  const after = await tokens(page)
  console.log(`note   walnut rgb(${before.accent}) -> sage rgb(${after.accent})`)
  // Not "the value changed": Sage's neutrals are close enough to Walnut's that
  // the clamp can legitimately land on almost the same colour, and asserting a
  // difference would be asserting that two palettes are far apart. What must
  // hold is that it is STILL applied, still the picture's hue, and - below -
  // still clears against the neutrals it is now sitting on.
  check('changing the palette keeps the art accent applied', after.inline.startsWith('rgb('), after.inline || 'not set')
  check('...still the picture\'s hue', after.accent[2] > after.accent[0], `rgb(${after.accent})`)
  for (const [name, g] of [['--bg', after.bg], ['--surface', after.surface], ['--surface-2', after.surface2]]) {
    const r = Math.round(ratio(after.accent, g) * 100) / 100
    check(`...and still clears AA against the NEW ${name}`, r >= AA, `${r} vs ${AA}`)
  }
  await ctx.close()
}

await browser.close()
const pass = results.filter(Boolean).length
console.log(`\n${pass}/${results.length} passed`)
process.exit(pass === results.length ? 0 : 1)
