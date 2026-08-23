/**
 * repro/grain.mjs - the grain over the ground, and the reduced-transparency answer.
 *
 * Two claims, and the first one is the reason the file exists:
 *
 *   1. THE BANDING IS ACTUALLY GONE. "There is a noise layer in the stylesheet"
 *      is not the claim; "adjacent pixels of a full-screen gradient no longer
 *      hold the same 8-bit value for tens of rows at a time" is. So this reads
 *      the COMPOSITED pixels down a vertical line of the real ground and reports
 *      the longest run of identical values - which is exactly what a contour is.
 *
 *   2. REDUCED TRANSPARENCY IS ANSWERED IN BOTH HALVES. The stylesheet makes the
 *      glass opaque and drops the filter; ground.js puts a floor under the
 *      intensity slider, because --ground-veil-a is an inline style and CSS
 *      cannot outrank one. A build that did only the CSS half would leave the
 *      photograph exactly as loud as before, and the bars would look fixed.
 *
 * The media feature is set over CDP: Playwright's emulateMedia does not carry
 * prefers-reduced-transparency, and asserting against a class or a query string
 * instead of the real feature would be asserting against my own fixture.
 *
 * Run: PW_CHROME=... BASE=http://127.0.0.1:4173 node repro/grain.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://127.0.0.1:4173'
const AA_BODY = 4.5
const results = []
const check = (name, pass, got) => {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${got !== undefined ? `  ::  ${got}` : ''}`)
}

const games = [1, 2, 3, 4].map((i) => ({
  master_id: i, title: `Game ${i}`, environment: 'xbox', playtime_minutes: 600, playtime_label: '10h',
  last_played: new Date(Date.now() - i * 3600000).toISOString(), earned_awards: 5, total_awards: 20,
  percent: 25, cover_igdb: 'coclf1', cover_small: null, igdb_id: 100 + i, igdb_rating: 85,
  release_year: 2025, genre: 'Role-playing (RPG)', length_minutes: 3000, keywords: [],
  platforms: ['Xbox'], franchises: [],
}))
const disc = [0, 1, 2, 3].map((i) => ({
  id: 100 + i, name: `Game ${i}`, summary: 'A game.', cover: null, coverId: 'coclf1', year: 2026,
  rating: 88, genres: [], keywords: [], themes: [], platforms: [], companies: [],
  backdropId: 'arart' + i, backdropKind: 'artwork',
  release: { ts: 1790000000, precision: 'day', label: 'Sep 24, 2026' },
}))
// A DELIBERATELY SMOOTH picture. The hostile one ground.mjs uses is full of
// detail, which dithers itself; a gentle two-stop ramp is the case that bands,
// and it is also what a blurred piece of key art looks like after a 13px blur.
const ART = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#3a3630"/><stop offset="1" stop-color="#2e2b26"/>
  </linearGradient></defs>
  <rect width="640" height="360" fill="url(#g)"/></svg>`
const PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME })

async function open(theme, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1,
    serviceWorkers: 'block', timezoneId: 'America/New_York' })
  const page = await ctx.newPage()

  if (opts.quiet) {
    // Playwright has colorScheme, reducedMotion and forcedColors, and no
    // reduced-transparency. CDP does, and it is the same switch the OS flips.
    const cdp = await ctx.newCDPSession(page)
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
    })
  }

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
      if (o.g) localStorage.setItem('gamedeck_ground_v1', o.g)
    } catch { /* ignore */ }
  }, { t: theme, g: opts.ground || null })

  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2200)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2600)
  return { ctx, page }
}

/**
 * The banding number. Hides everything the app draws, screenshots the bare
 * ground, and walks one vertical line reporting the longest run of identical
 * luminance values. A contour IS that run: a plateau of one value with a step to
 * the next. Grain replaces the plateau with noise, so the run collapses to 1-2.
 */
async function bandRun(page, { noGrain = false } = {}) {
  const handle = await page.addStyleTag({
    content: `.app > *, .tabbar, .settings-page { visibility: hidden !important; }
      ${noGrain ? ':root { --grain: none !important; }' : ''}`,
  })
  const shot = await page.screenshot({ clip: { x: 180, y: 120, width: 6, height: 600 } })
  await page.evaluate((el) => el.remove(), handle)
  return page.evaluate(async (b64) => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
    const c = new OffscreenCanvas(img.width, img.height)
    const g = c.getContext('2d')
    g.drawImage(img, 0, 0)
    const px = g.getImageData(0, 0, img.width, img.height).data
    // One column, top to bottom.
    const col = []
    const x = Math.floor(img.width / 2)
    for (let y = 0; y < img.height; y++) {
      const i = (y * img.width + x) * 4
      col.push(`${px[i]},${px[i + 1]},${px[i + 2]}`)
    }
    let longest = 1
    let run = 1
    let changes = 0
    for (let i = 1; i < col.length; i++) {
      if (col[i] === col[i - 1]) {
        run += 1
        if (run > longest) longest = run
      } else {
        run = 1
        changes += 1
      }
    }
    return { longest, changed: Math.round((changes / (col.length - 1)) * 100), rows: col.length }
  }, shot.toString('base64'))
}

/* --------------------------------------------------- 1. the wash stops banding */
{
  const { ctx, page } = await open('dark', { ground: 'wash' })
  // BOTH numbers on the same page, one variable apart. An absolute threshold here
  // would be a number I chose; the pair is a number the build produced. `--grain:
  // none` is the only difference between the two reads.
  const flat = await bandRun(page, { noGrain: true })
  const b = await bandRun(page)
  console.log(`note   wash: longest flat run ${flat.longest} rows without grain, ${b.longest} with`)
  check('the wash holds no long flat run', b.longest <= 4, `longest run ${b.longest} of ${b.rows} rows`)
  // NOT a big change here, and the honest thing is to say so rather than move the
  // sample until it is. The wash is `radial-gradient(130% 90% at 22% -6%)`, so a
  // vertical line through the middle of the screen crosses it steeply and was
  // never the case that banded - it measures 6 rows without grain. The art veil
  // below is the one that did, at 98. An assertion that demanded a 4x improvement
  // from both would have been a demand that correct code fail.
  check('...and is no worse for it', b.longest <= flat.longest, `${flat.longest} -> ${b.longest}`)
  await ctx.close()
}

/* --------------------------------------------------- 2. so does the art veil */
{
  const { ctx, page } = await open('dark', { ground: 'nowplaying' })
  const flat = await bandRun(page, { noGrain: true })
  const b = await bandRun(page)
  console.log(`note   art:  longest flat run ${flat.longest} rows without grain, ${b.longest} with`)
  // THE CASE THIS FEATURE IS FOR. A 13px blur of a smooth picture under a flat
  // veil holds ONE value for 98 consecutive rows without grain, which is a contour
  // you can see on an OLED from across the room.
  check('a blurred picture under its veil holds no long flat run', b.longest <= 4, `longest run ${b.longest}`)
  check('...which is a real change, not a threshold I picked', flat.longest >= b.longest * 8,
    `${flat.longest} -> ${b.longest}`)
  const has = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.app'), '::after').backgroundImage.includes('svg'))
  check('the veil layer carries the grain tile', has, has)
  await ctx.close()
}

/* --------------------------------------------------- 3. off keeps its flat page */
{
  const { ctx, page } = await open('dark', { ground: 'off' })
  const has = await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector('.app'), '::after')
    return s.content !== 'none' && s.backgroundImage.includes('svg')
  })
  check('a flat ground gets no grain at all', !has, has)
  await ctx.close()
}

/* --------------------------------------------------- 4. reduced transparency */
{
  const { ctx, page } = await open('dark', { ground: 'nowplaying' })
  const loud = await page.evaluate(() =>
    Number(getComputedStyle(document.documentElement).getPropertyValue('--ground-veil-a')))
  const bar = await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector('.tabbar'))
    return { filter: s.backdropFilter || s.webkitBackdropFilter, bg: s.backgroundColor }
  })
  check('normally the bar is glass', /blur/.test(bar.filter || ''), bar.filter)
  check('...over a translucent fill', /rgba\(/.test(bar.bg) && !/, *1\)$/.test(bar.bg), bar.bg)
  await ctx.close()

  const q = await open('dark', { ground: 'nowplaying', quiet: true })
  const quietVeil = await q.page.evaluate(() =>
    Number(getComputedStyle(document.documentElement).getPropertyValue('--ground-veil-a')))
  const qbar = await q.page.evaluate(() => {
    const s = getComputedStyle(document.querySelector('.tabbar'))
    return { filter: s.backdropFilter || s.webkitBackdropFilter, bg: s.backgroundColor }
  })
  check('reduced transparency drops the backdrop filter', /^none$/.test(qbar.filter || 'none'), qbar.filter)
  check('...and makes the fill opaque', /^rgb\(/.test(qbar.bg), qbar.bg)
  // The half a stylesheet cannot do: --ground-veil-a is inline.
  check('...and quiets the picture too', quietVeil > loud, `${loud} -> ${quietVeil}`)
  check('...to at least halfway to the ceiling', quietVeil >= Math.round((loud + 0.5 * (0.92 - loud)) * 100) / 100 - 0.011,
    `${quietVeil} vs ${Math.round((loud + 0.5 * (0.92 - loud)) * 100) / 100}`)
  check('...and never past it', quietVeil <= 0.92, quietVeil)

  // And the bar is still readable now that it is opaque rather than frosted.
  const ratio = await q.page.evaluate(() => {
    const el = [...document.querySelectorAll('.tabbar-btn')][2]
    const lab = el.querySelector('.tabbar-label') || el
    const parse = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number)
    const sr = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) }
    const L = ([r, g, b]) => 0.2126 * sr(r) + 0.7152 * sr(g) + 0.0722 * sr(b)
    const a = L(parse(getComputedStyle(lab).color))
    const b = L(parse(getComputedStyle(document.querySelector('.tabbar')).backgroundColor))
    const hi = Math.max(a, b), lo = Math.min(a, b)
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
  })
  check('an inactive tab label on the opaque bar clears AA', ratio >= AA_BODY, `${ratio} vs ${AA_BODY}`)
  await q.ctx.close()
}

await browser.close()
const pass = results.filter(Boolean).length
console.log(`\n${pass}/${results.length} passed`)
process.exit(pass === results.length ? 0 : 1)
