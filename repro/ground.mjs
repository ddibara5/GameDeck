/**
 * repro/ground.mjs - the app ground, and the Settings page it is picked from.
 *
 * Four things are asserted, in rising order of how much they are worth:
 *
 *   1. the preference round-trips: picking a source sets data-ground, and a
 *      reload comes back on it;
 *   2. an art source actually resolves a picture and a computed veil, rather
 *      than silently degrading to the wash (which is what a broken /api/tint,
 *      an empty library cache or a tainted canvas all look like);
 *   3. the veil is sized from BOTH ends of the picture. The first version read
 *      only the brightest part, which is right in dark mode and backwards in
 *      light, and it tested clean at the minimum alpha while the black corner
 *      of the same image sat under dark text. Asserted on the SAME image in
 *      both themes, because that is the case the one-ended version got wrong;
 *   4. the type over the ground clears AA - measured on the rendered pixel, on
 *      the WORST pixel in each box rather than the mean, because over a picture
 *      the two disagree and the mean is the one that says a failure is fine.
 *
 * And one regression guard: an overlay must stay opaque. Making .settings-page
 * transparent so the ground "continues" through it stacked three translucent
 * sheets once a sub-page was open, and the Home title read straight through the
 * Background list.
 *
 * Run: PW_CHROME=... BASE=http://127.0.0.1:4173 node repro/ground.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://127.0.0.1:4173'
const AA_BODY = 4.5
const AA_LARGE = 3.0
const results = []
const check = (name, pass, got) => {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${got !== undefined ? `  ::  ${got}` : ''}`)
}
const srgb = (c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) }
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b), hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05) }

const games = ['Persona 5 Royal', 'Kristala', 'Crimson Desert', 'Mistfall Hunter'].map((title, i) => ({
  master_id: i + 1, title, environment: 'xbox', playtime_minutes: 600 + i * 90, playtime_label: '10h',
  last_played: new Date(1787000000000 - i * 3600000 * 8).toISOString(), earned_awards: 5, total_awards: 20,
  percent: 25, cover_igdb: 'coclf1', cover_small: null, igdb_id: 100 + i, igdb_rating: 85,
  release_year: 2025, genre: 'Role-playing (RPG)', length_minutes: 3000, keywords: [], platforms: ['Xbox'],
}))
const acts = [['2026-08-21', 220, 1, 34, 23], ['2026-08-20', 84, 0, 33, 22]].map(
  ([event_date, minutes_delta, achievements_delta, percent_after, earned_awards_after]) => ({
    master_id: 1, title: 'Persona 5 Royal', environment: 'xbox', event_date, minutes_delta,
    achievements_delta, percent_after, earned_awards_after, total_awards: 52, cover_small: null,
    playtime_minutes_after: 2000, last_played: event_date + 'T20:00:00Z', is_new: false }))
const disc = [0, 1, 2, 3].map((i) => ({
  id: 100 + i, name: games[i].title, summary: 'A game.', cover: null, coverId: 'coclf1', year: 2026,
  rating: 88, genres: ['Role-playing (RPG)'], keywords: [], themes: [], platforms: ['Series X|S'],
  companies: [], backdropId: 'arart' + i, backdropKind: 'artwork',
  release: { ts: 1790000000, precision: 'day', label: 'Sep 24, 2026' } }))

// The ground's picture, and it is a deliberately hostile one: it runs from near
// black to near white with a specular blob in it, which is harder than any real
// key art. A veil that clears here clears a photograph.
const ART = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#141013"/><stop offset="0.34" stop-color="#7a5f42"/>
    <stop offset="0.52" stop-color="#e8dfd0"/><stop offset="0.72" stop-color="#4a453f"/>
    <stop offset="1" stop-color="#17140f"/></linearGradient></defs>
  <rect width="640" height="360" fill="url(#g)"/>
  <circle cx="470" cy="86" r="46" fill="#fff8ea"/></svg>`

const PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME })

async function open(theme, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1,
    serviceWorkers: 'block', timezoneId: 'America/New_York' })
  const page = await ctx.newPage()
  const json = (r, b) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) })
  await page.route('**/rest/v1/**', (r) => {
    const u = r.request().url()
    return json(r, u.includes('/games') ? games : u.includes('recent_activity') ? acts : [])
  })
  await page.route('**/api/**', (r) => {
    const u = r.request().url()
    // fallback(), not continue(): continue() goes to the network, and a 404 for
    // the ground's picture is indistinguishable from the feature being broken.
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
  await page.route('**/api/tint**', (r) => {
    if (opts.deadArt) return r.fulfill({ status: 404, body: '' })
    r.fulfill({ status: 200, contentType: 'image/svg+xml', body: ART })
  })
  const png = (r) => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(PX, 'base64') })
  await page.route('**images.igdb.com/**', png)
  await page.route('**wsrv.nl/**', png)
  await page.addInitScript(({ t, g }) => {
    try {
      localStorage.setItem('gamedeck_theme_v1', t)
      if (g) localStorage.setItem('gamedeck_ground_v1', g)
    } catch { /* ignore */ }
  }, { t: theme, g: opts.ground || null })
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  return { ctx, page }
}

const openSettings = async (page) => {
  await page.locator('.brand-btn').click()
  await page.waitForTimeout(450)
  await page.locator('.menu-fb', { hasText: 'Settings' }).click()
  await page.waitForTimeout(650)
}
const pickGround = async (page, label) => {
  await page.locator('.menu-item', { hasText: 'Background' }).first().click()
  await page.waitForTimeout(500)
  await page.locator('.settings-sub .menu-item', { hasText: label }).click()
  await page.waitForTimeout(2200)
}
const groundState = (page) => page.evaluate(() => ({
  attr: document.documentElement.getAttribute('data-ground'),
  src: getComputedStyle(document.documentElement).getPropertyValue('--ground-src').trim(),
  veil: Number(getComputedStyle(document.documentElement).getPropertyValue('--ground-veil-a')) || null,
}))

// ---------------------------------------------------------------- 1. round trip
for (const [label, key] of [['Theme wash', 'wash'], ['Now playing', 'nowplaying'], ['Shuffle', 'shuffle'], ['Off', 'off']]) {
  const { ctx, page } = await open('dark')
  await openSettings(page)
  await pickGround(page, label)
  const stored = await page.evaluate(() => localStorage.getItem('gamedeck_ground_v1'))
  check(`picking "${label}" stores ${key}`, stored === key, stored)
  const st = await groundState(page)
  check(`picking "${label}" paints ${key}`, st.attr === key, st.attr)
  await ctx.close()
}

// A stored art preference survives a reload and comes back as the picture, not
// as the wash. This is the one that catches an art path that only works while
// the library happens to be in memory.
{
  const { ctx, page } = await open('dark')
  await openSettings(page)
  await pickGround(page, 'Now playing')
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  const st = await groundState(page)
  check('a stored art ground survives a reload', st.attr === 'nowplaying', st.attr)
  check('...and resolves a picture', /^url\(/.test(st.src), st.src.slice(0, 46) || '(empty)')
  check('...and a measured veil', st.veil > 0 && st.veil <= 0.92, st.veil)
  await ctx.close()
}

// A picture that cannot be fetched must fall back to the wash. Leaving
// data-ground on an art source paints a veil over nothing: a page dimmed for no
// picture, which looks like a rendering fault rather than a missing image.
{
  const { ctx, page } = await open('dark', { deadArt: true })
  await openSettings(page)
  await pickGround(page, 'Now playing')
  const st = await groundState(page)
  const stored = await page.evaluate(() => localStorage.getItem('gamedeck_ground_v1'))
  check('a dead picture degrades to the wash', st.attr === 'wash', st.attr)
  check('...without discarding the preference', stored === 'nowplaying', stored)
  await ctx.close()
}

// ---------------------------------------------------------------- 2. the veil, both ends
// Light and dark disagree about which end of the picture is dangerous: light
// type dies on a highlight, dark type dies in a shadow. One veil serves both, so
// the SAME image must produce a veil in each theme, and neither may sit at the
// floor - a floor value is what a one-ended measurement returns.
const veils = {}
for (const theme of ['dark', 'light']) {
  const { ctx, page } = await open(theme)
  await openSettings(page)
  await pickGround(page, 'Now playing')
  const st = await groundState(page)
  veils[theme] = st.veil
  check(`${theme}: the veil is measured, not the floor`, st.veil > 0.2, st.veil)
  await ctx.close()
}
console.log(`note   veil dark ${veils.dark}, light ${veils.light}`)

// ---------------------------------------------------------------- 3. the pixel
// The tab bar target is a MIDDLE, inactive button, and both halves of that
// matter. The active one's text sits on the accent pill rather than on the
// glass, so measuring it reports a number about a surface the label is not on.
// And the leftmost one is worse: the bar is a rounded pill, its lit border ring
// curves inward at the ends and crosses the first button's box well below the
// 2px trim, so "the closest pixel to the text" kept picking the ring and read
// 2.75 about a surface that composites to rgb(26).
const TARGETS = [
  ['.page-title', 'the large page title', AA_LARGE],
  ['.page-subtitle', 'the page subtitle', AA_BODY],
  ['.game-title', 'a Library row title', AA_BODY],
  ['.tabbar-btn:not(.active) >> nth=2', 'a tab bar label', AA_BODY],
]
const HIDE = '.page-title,.page-subtitle,.game-title,.tabbar-btn'

for (const theme of ['dark', 'light']) {
  const { ctx, page } = await open(theme)
  await openSettings(page)
  await pickGround(page, 'Now playing')
  await page.locator('.settings-sub .settings-back').click()
  await page.waitForTimeout(400)
  await page.locator('.settings-page:not(.settings-sub) .settings-back').click()
  await page.waitForTimeout(800)
  await page.locator('.tabbar-btn', { hasText: 'Library' }).first().click()
  await page.waitForTimeout(1400)

  for (const [sel, label, bar] of TARGETS) {
    const n = await page.locator(sel).count()
    if (!n) { check(`${theme}: ${label} over the ground`, false, 'not rendered'); continue }
    const handle = await page.locator(sel).first().elementHandle()
    const color = await page.evaluate((el) => {
      el.scrollIntoView({ block: 'center' })
      return getComputedStyle(el).color.match(/\d+/g).slice(0, 3).map(Number)
    }, handle)
    const tag = await page.addStyleTag({ content: `${HIDE}{visibility:hidden !important}` })
    await page.waitForTimeout(90)
    const box = await page.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      const pl = Math.max(2, parseFloat(cs.paddingLeft) || 0)
      const pr = Math.max(2, parseFloat(cs.paddingRight) || 0)
      return { x: Math.max(0, Math.round(r.x + pl)), y: Math.max(0, Math.round(r.y) + 2),
        width: Math.max(6, Math.round(r.width - pl - pr)), height: Math.max(6, Math.round(r.height) - 4) }
    }, handle)
    let worst = null
    try {
      const buf = await page.screenshot({ clip: box })
      worst = await page.evaluate(async ({ d, c }) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + d; await img.decode()
        const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height
        const g = cv.getContext('2d'); g.drawImage(img, 0, 0)
        const px = g.getImageData(0, 0, cv.width, cv.height).data
        const L = (p) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]
        const tl = L(c)
        let best = null, bd = 1e9
        for (let i = 0; i < px.length; i += 4) {
          const p = [px[i], px[i + 1], px[i + 2]]
          const d2 = Math.abs(L(p) - tl)
          if (d2 < bd) { bd = d2; best = p }
        }
        return best
      }, { d: buf.toString('base64'), c: color })
    } catch { /* off-screen */ }
    await tag.evaluate((el) => el.remove())
    const r = worst ? ratio(color, worst) : 0
    check(`${theme}: ${label} over the ground`, r >= bar, `${r.toFixed(2)} vs ${bar}`)
  }
  await ctx.close()
}

// ---------------------------------------------------------------- 4. no ghosting
// Every settings surface must be opaque. Asserted on the computed background
// rather than on a pixel because the failure is a rule, not a rendering: making
// .settings-page transparent so the ground shows through stacked three sheets
// once a sub-page was open.
for (const g of ['wash', 'nowplaying']) {
  const { ctx, page } = await open('light', { ground: g })
  await openSettings(page)
  await page.locator('.menu-item', { hasText: 'Background' }).first().click()
  await page.waitForTimeout(700)
  const alphas = await page.evaluate(() =>
    [...document.querySelectorAll('.settings-page')].map((el) => {
      const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g) || []
      return m.length >= 4 ? Number(m[3]) : 1
    }))
  check(`${g}: every settings surface is opaque`, alphas.length === 2 && alphas.every((a) => a === 1), JSON.stringify(alphas))
  // And the sub-page is genuinely on top: its own header must be the one hit at
  // the header's centre.
  const top = await page.evaluate(() => {
    const el = document.elementFromPoint(196, 40)
    return el ? (el.closest('.settings-page') || {}).className || 'none' : 'none'
  })
  check(`${g}: the sub-page is the surface on top`, /settings-sub/.test(top), top)
  await ctx.close()
}

// ---------------------------------------------------------------- 5. overlays still work
// The ground must be invisible to the rest of the page. The first version lifted
// .app-main to z-index 1 to climb back over it, which made .app-main a stacking
// context and trapped every fixed overlay rendered inside it: the Library and
// Discover filter sheets stopped taking clicks, and three harnesses that have
// nothing to do with the ground started failing. Asserted by DRIVING a sheet,
// because "it is in the DOM" was true the whole time it was broken.
for (const g of ['off', 'wash', 'nowplaying']) {
  const { ctx, page } = await open('dark')
  if (g !== 'off') {
    await openSettings(page)
    await pickGround(page, g === 'wash' ? 'Theme wash' : 'Now playing')
    await page.locator('.settings-sub .settings-back').click()
    await page.waitForTimeout(350)
    await page.locator('.settings-page:not(.settings-sub) .settings-back').click()
    await page.waitForTimeout(700)
  }
  await page.locator('.tabbar-btn', { hasText: 'Library' }).first().click()
  await page.waitForTimeout(1300)
  await page.locator('.filter-btn').click()
  await page.waitForTimeout(600)
  let clicked = true
  try {
    await page.locator('.filter-opt', { hasText: 'Xbox' }).first().click({ timeout: 4000 })
  } catch {
    clicked = false
  }
  await page.waitForTimeout(300)
  const active = await page.locator('.filter-opt.active', { hasText: 'Xbox' }).count()
  check(`${g}: a filter sheet inside .app still takes a click`, clicked && active === 1, `${clicked ? 'clicked' : 'blocked'}, ${active} active`)
  const top = await page.evaluate(() => {
    const sheet = document.querySelector('.filter-sheet')
    if (!sheet) return 'no sheet'
    const r = sheet.getBoundingClientRect()
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + 20)
    return el && sheet.contains(el) ? 'sheet' : (el ? el.className || el.tagName : 'none')
  })
  check(`${g}: the sheet is the surface on top`, top === 'sheet', top)
  await ctx.close()
}

// ---------------------------------------------------------------- 6. the root list
// The three Appearance rows must SAY their current value. A sub-page you have to
// open to read what it is set to is worse than the wall of controls it replaced.
{
  const { ctx, page } = await open('dark')
  await openSettings(page)
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('.settings-group .menu-item')].slice(0, 3).map((el) => ({
      label: el.querySelector('.menu-label')?.firstChild?.textContent?.trim(),
      value: el.querySelector('.menu-value')?.textContent?.trim(),
    })))
  check('root shows Theme with its value', rows[0]?.label === 'Theme' && /Dark/.test(rows[0]?.value || ''), JSON.stringify(rows[0]))
  check('root shows Background with its value', rows[1]?.label === 'Background' && (rows[1]?.value || '').length > 0, JSON.stringify(rows[1]))
  check('root shows Card sizing with its value', rows[2]?.label === 'Card sizing' && /·/.test(rows[2]?.value || ''), JSON.stringify(rows[2]))
  // No stray controls left on the root list: the point of the reorganisation is
  // that the top level is one kind of thing all the way down.
  const strays = await page.evaluate(() =>
    document.querySelectorAll('.settings-body > .settings-section .seg, .settings-body .accent-row').length)
  check('the root list holds no bespoke controls', strays === 0, strays)
  // Every sub-page opens and comes back.
  for (const [row, title] of [['Theme', 'Theme'], ['Background', 'Background'], ['Card sizing', 'Card sizing']]) {
    await page.locator('.menu-item', { hasText: row }).first().click()
    await page.waitForTimeout(500)
    const seen = await page.locator('.settings-sub .settings-hd-title').textContent().catch(() => null)
    check(`"${row}" opens its sub-page`, seen === title, seen)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    const back = await page.locator('.settings-sub').count()
    const still = await page.locator('.settings-page').count()
    check(`Escape leaves "${row}" without closing Settings`, back === 0 && still === 1, `${back} sub, ${still} page`)
  }
  await ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
