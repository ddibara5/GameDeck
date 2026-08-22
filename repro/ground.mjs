/**
 * repro/ground.mjs - the app ground and the sheet's key art, against the BUILT app.
 *
 * Two changes with one thing in common: both paint something behind text that
 * was previously on a flat colour, so both are only correct if the CONTRAST is
 * unchanged where it matters. That is what most of this file measures, and it
 * measures it the only honest way, by sampling the composited pixel behind the
 * type rather than reading a value out of the CSS. A blurred layer under a
 * translucent veil has no effective colour written down anywhere.
 *
 * The rest is the setting: it has to default on, survive a reload, and actually
 * turn off, and turning it off has to leave the app exactly as it was.
 *
 * Run: PW_CHROME=... BASE=http://127.0.0.1:4173 node repro/ground.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://127.0.0.1:4173'
const results = []
const check = (name, pass, got) => {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${got !== undefined ? `  ::  ${got}` : ''}`)
}

const srgb = (c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) }
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05) }

const NAMES = ['Hollow Knight: Silksong', 'Clair Obscur: Expedition 33', 'Blue Prince', 'Split Fiction', 'Avowed', 'Elden Ring']
const SHOT = 'https://images.igdb.com/igdb/image/upload/t_screenshot_med/scq1wb.jpg'
const games = NAMES.map((title, i) => ({
  master_id: i + 1, title, environment: 'xbox', playtime_minutes: 600 + i * 90, playtime_label: '10h',
  last_played: new Date(Date.now() - i * 86400000).toISOString(), earned_awards: 5, total_awards: 20,
  percent: 25, cover_igdb: null, cover_standard: null, igdb_id: 100 + i, igdb_rating: 85, release_year: 2025,
  genre: 'Role-playing (RPG)', status: 'partial', beaten: false, keywords: ['soulslike'], platforms: ['Xbox'],
}))

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined })
const ctx = await browser.newContext({
  viewport: { width: 393, height: 852 }, deviceScaleFactor: 1,
  serviceWorkers: 'block', timezoneId: 'America/New_York',
})
const page = await ctx.newPage()
const problems = []
page.on('pageerror', (e) => problems.push('pageerror :: ' + e.message))
// The Settings page fetches its build stamp from api.github.com, which CORS
// blocks from a localhost origin. That is the harness's environment, not the
// app, and topclear.mjs reports the same line.
//
// It is filtered by REQUEST rather than by message, and the failed-request list
// is asserted separately below, so this cannot quietly swallow a real broken
// fetch: anything that fails and is not that one URL still fails the run.
const failedReqs = []
page.on('requestfailed', (r) => {
  if (!r.url().includes('api.github.com')) failedReqs.push(r.url() + ' :: ' + (r.failure() || {}).errorText)
})
const noise = (t) => t.includes('api.github.com') || t.includes('Failed to load resource')
page.on('console', (m) => { if (m.type() === 'error' && !noise(m.text())) problems.push('console :: ' + m.text()) })

const json = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
await page.route('**/rest/v1/**', (r) => json(r, r.request().url().includes('/games') ? games : []))
await page.route('**/api/**', (r) => json(r, {}))
const UNOWNED = 'Mortal Shell II'
// Long enough to SCROLL. The first version of this file used a one-line summary
// and three screenshots, so the sheet never overflowed, and two defects that
// only appear below the fold went out to production: the backdrop was sized to
// the scroll port and scrolled away, and the art's scale overhang showed under
// the veil as a band of raw screenshot. Anything asserted about a sheet has to
// be asserted about a sheet you can scroll.
const LONG =
  'Their flesh is your weapon. Possess warrior Shells, dethrone false gods and redeem a ravaged world in a standalone sequel built around adrenaline-charged, high-stakes combat. Every Shell carries its own history and its own way of dying, and the world remembers which ones you wore. Parry, harden and counter through a decaying pilgrimage of a map that folds back on itself, and decide how much of yourself is worth spending to get through it.'
await page.route('**/api/discover**', (r) =>
  json(r, { games: [{ id: 100, name: UNOWNED, summary: LONG, cover: null, year: 2026, rating: 90, screenshots: [SHOT, SHOT, SHOT, SHOT, SHOT, SHOT], genres: ['Role-playing (RPG)', 'Adventure', 'Indie'], keywords: ['soulslike', 'dark fantasy', 'parrying'], themes: ['Action', 'Fantasy'], platforms: ['Series X|S', 'PS5', 'PC'], companies: [{ name: 'Cold Symmetry', developer: true }], url: 'https://www.igdb.com/games/mortal-shell-ii' }] })
)
// A BRIGHT screenshot on purpose. The veil has to hold against the worst art a
// game can have, and a dark one would pass a veil that is far too thin.
const bright = (r) => r.fulfill({
  status: 200, contentType: 'image/svg+xml',
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="36"><rect width="64" height="36" fill="#fff8e1"/></svg>',
})
await page.route('**/images.igdb.com/**', bright)
await page.route('**/wsrv.nl/**', bright)

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)

const attr = () => page.evaluate(() => document.documentElement.getAttribute('data-ground'))
const groundOf = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s)
  return el ? getComputedStyle(el).backgroundImage : null
}, sel)

/* ------------------------------------------------------------ the setting */

check('the glow is on by default', (await attr()) === 'glow', String(await attr()))
check(
  'and the app shell is what carries it',
  /radial-gradient/.test((await groundOf('.app')) || ''),
  ((await groundOf('.app')) || '(none)').slice(0, 58)
)
check(
  'the header does not cut a band out of the top of it',
  (await page.evaluate(() => getComputedStyle(document.querySelector('.app-header')).backgroundColor)) === 'rgba(0, 0, 0, 0)',
  await page.evaluate(() => getComputedStyle(document.querySelector('.app-header')).backgroundColor)
)

/* ------------- the measurement that decides whether this may ship at all */

// The Library's poster captions are the only type in the app with nothing
// behind them, so they are the ground's whole risk. Sample the pixel under a
// caption with the glow on and off and require the contrast to be UNCHANGED,
// not merely acceptable: the design claim is that the light falls where no text
// does, and an "acceptable" reading would hide a gradient that had crept.
const capContrast = async () => {
  await page.getByRole('button', { name: /^Library/ }).first().click()
  await page.waitForTimeout(900)
  const box = await page.evaluate(() => {
    const el = document.querySelector('.shelf-card-title')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.max(4, Math.round(r.width)), height: Math.max(4, Math.round(r.height)), color: getComputedStyle(el).color }
  })
  if (!box) return null
  // Keep the HANDLE. Removing "the last <style>" instead takes whichever
  // stylesheet a lazily-loaded chunk injected most recently, which silently
  // unstyled the Discover tab further down this file and cost a debugging round.
  const tag = await page.addStyleTag({ content: '.shelf-card-title{visibility:hidden !important}' })
  await page.waitForTimeout(120)
  const buf = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height } })
  await tag.evaluate((el) => el.remove())
  return { buf, color: box.color.match(/\d+/g).slice(0, 3).map(Number) }
}

const avgOf = async (buf) => {
  // Decode the PNG with the browser itself rather than adding a dependency.
  const b64 = buf.toString('base64')
  return page.evaluate(async (d) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + d
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const g = c.getContext('2d')
    g.drawImage(img, 0, 0)
    const px = g.getImageData(0, 0, c.width, c.height).data
    let best = null
    for (let i = 0; i < px.length; i += 4) {
      const p = [px[i], px[i + 1], px[i + 2]]
      const L = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) }
      const l = 0.2126 * L(p[0]) + 0.7152 * L(p[1]) + 0.0722 * L(p[2])
      if (!best || l > best.l) best = { p, l }
    }
    return best.p
  }, b64)
}

const on = await capContrast()
const onBg = await avgOf(on.buf)
const onRatio = ratio(on.color, onBg)

await page.evaluate(() => document.documentElement.setAttribute('data-ground', 'none'))
await page.waitForTimeout(200)
const off = await capContrast()
const offBg = await avgOf(off.buf)
const offRatio = ratio(off.color, offBg)
await page.evaluate(() => document.documentElement.setAttribute('data-ground', 'glow'))

// Without this, "no gradient under the caption" is satisfied just as well by a
// ground that does not render at all. Sample the top-left gutter, which is
// where the light is supposed to fall, and require it to CHANGE.
const gutter = async () => {
  const hide = await page.addStyleTag({ content: '.app > * { visibility: hidden !important }' })
  await page.waitForTimeout(120)
  // 12% of 393px is x=47, and the gradient's origin is just above the top edge,
  // so this box is the centre of where the light is meant to land.
  const buf = await page.screenshot({ clip: { x: 30, y: 2, width: 36, height: 36 } })
  await hide.evaluate((el) => el.remove())
  await page.waitForTimeout(80)
  return avgOf(buf)
}
const gOn = await gutter()
await page.evaluate(() => document.documentElement.setAttribute('data-ground', 'none'))
await page.waitForTimeout(200)
const gOff = await gutter()
await page.evaluate(() => document.documentElement.setAttribute('data-ground', 'glow'))
await page.waitForTimeout(200)
check(
  'and it is visible where it is supposed to be',
  Math.abs(lum(gOn) - lum(gOff)) > 0.002,
  `glow rgb(${gOn.join(',')})   off rgb(${gOff.join(',')})`
)

check(
  'the glow puts no gradient under a poster caption',
  Math.abs(onRatio - offRatio) < 0.05,
  `glow ${onRatio.toFixed(2)}:1   off ${offRatio.toFixed(2)}:1   delta ${Math.abs(onRatio - offRatio).toFixed(3)}`
)
check('and the caption still clears the 4.5 floor', onRatio >= 4.5, `${onRatio.toFixed(2)}:1`)

/* ------------------------------------------------------- the sheet's art */

await page.getByRole('button', { name: /^Discover/ }).first().click()
await page.waitForTimeout(1200)
await page.getByRole('tab', { name: 'Browse', exact: true }).click()
await page.waitForTimeout(600)
await page.fill('.search-input', 'mortal')
await page.waitForTimeout(1400)
const card = await page.$('.discover-card')
if (card) {
  await card.click()
  await page.waitForTimeout(900)
}
const hasArt = await page.evaluate(() => Boolean(document.querySelector('.modal-sheet .gs-art')))
check('the sheet takes the art', hasArt, hasArt ? 'present' : 'absent')

if (hasArt) {
  check(
    'and reuses the URL the shot strip already loaded, so it costs no request',
    await page.evaluate(() => {
      const art = getComputedStyle(document.querySelector('.gs-art')).backgroundImage
      const shot = document.querySelector('.shot')
      return Boolean(shot && art.includes(shot.getAttribute('src')))
    }),
    'same src'
  )
  const box = await page.evaluate(() => {
    const el = document.querySelector('.discover-summary')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.max(4, Math.round(r.width)), height: Math.max(4, Math.round(r.height)), color: getComputedStyle(el).color }
  })
  if (box) {
    const tag2 = await page.addStyleTag({ content: '.discover-summary{visibility:hidden !important}' })
    await page.waitForTimeout(150)
    const buf = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height } })
    await tag2.evaluate((el) => el.remove())
    const bg = await avgOf(buf)
    const fg = box.color.match(/\d+/g).slice(0, 3).map(Number)
    const r = ratio(fg, bg)
    check('the summary clears 4.5 against the WORST pixel of the art', r >= 4.5, `${r.toFixed(2)}:1  on rgb(${bg.join(',')})`)
  }

  /* --------------------------------------------- and below the fold */

  // Every assertion above this point is about the TOP of the sheet, and both
  // production defects lived below it. This block is the one that would have
  // caught them.
  const geo = () => page.evaluate(() => {
    const sh = document.querySelector('.modal-sheet')
    const bg = document.querySelector('.gs-bg')
    if (!sh || !bg) return null
    const a = sh.getBoundingClientRect()
    const b = bg.getBoundingClientRect()
    return {
      scrolls: sh.scrollHeight > sh.clientHeight + 8,
      top: Math.round(b.top - a.top),
      left: Math.round(b.left - a.left),
      w: Math.round(b.width), sheetW: Math.round(a.width),
      covers: Math.round(b.height) >= sh.clientHeight,
    }
  })
  const g0 = await geo()
  // Vacuous-guard: if the sheet does not overflow, nothing below proves anything.
  check('the sheet is long enough to scroll', Boolean(g0 && g0.scrolls), g0 ? String(g0.scrolls) : '(no bg)')
  check(
    'the backdrop reaches the sheet edges, not just its padding box',
    Boolean(g0) && g0.top === 0 && g0.left === 0 && g0.w === g0.sheetW,
    g0 ? `top ${g0.top}  left ${g0.left}  width ${g0.w} of ${g0.sheetW}` : '-'
  )
  await page.evaluate(() => { document.querySelector('.modal-sheet').scrollTop = 99999 })
  await page.waitForTimeout(400)
  const g1 = await geo()
  check(
    'and it stays put when the sheet is scrolled to the bottom',
    Boolean(g1) && g1.top === 0 && g1.covers,
    g1 ? `top ${g1.top}  covers ${g1.covers}` : '-'
  )

  // The band. Hide the sheet's own content and photograph the backdrop alone,
  // then take the brightest pixel in the WHOLE sheet. Sampling with the content
  // still up finds the accent on a chip or a button and says nothing about the
  // art, which is how the first attempt at this assertion fooled itself.
  //
  // The :not list names the OLD structure's layers as well as the new wrapper.
  // Without that, running this against the build that has the defect hides the
  // very art it is meant to catch and the assertion passes on both. Checked by
  // running it against both builds, which is the only way to know.
  //
  // The fixture's screenshot is near-white, so raw art reads about 0.9 and the
  // veiled ground about 0.04. Anything above 0.15 is unveiled art on screen.
  const hideAll = await page.addStyleTag({
    content: '.modal-sheet > *:not(.gs-bg):not(.gs-art):not(.gs-veil) { visibility: hidden !important }',
  })
  await page.waitForTimeout(150)
  const sheetBox = await page.evaluate(() => {
    const a = document.querySelector('.modal-sheet').getBoundingClientRect()
    return { x: Math.round(a.left), y: Math.round(a.top), width: Math.round(a.width), height: Math.round(a.height) }
  })
  const botBg = await avgOf(await page.screenshot({ clip: sheetBox }))
  await hideAll.evaluate((el) => el.remove())
  check(
    'no band of unveiled art anywhere in the sheet, scrolled to the bottom',
    lum(botBg) < 0.15,
    `brightest pixel rgb(${botBg.join(',')})  luminance ${lum(botBg).toFixed(3)}`
  )
}

/* --------------------------------------------------- turning it off */

// The point of the setting. Off has to mean the app exactly as it was, and it
// has to survive a reload, or it is a gesture rather than a preference.
// Fresh page rather than dismissing the sheet: this also re-checks that the
// default survived everything above.
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)
check('the default is still glow after a reload', (await attr()) === 'glow', String(await attr()))
// The drawer, then its pinned Settings footer button. Same route topclear takes.
await page.click('.brand-btn')
await page.waitForTimeout(500)
await page.locator('.menu-fb', { hasText: 'Settings' }).click()
await page.waitForTimeout(700)
check('Settings opens', (await page.$('.settings-page')) !== null, 'open')

const offBtn = await page.getByRole('group', { name: 'Background glow' }).getByRole('button', { name: 'Off', exact: true })
await offBtn.click()
await page.waitForTimeout(300)
check('the setting turns the glow off', (await attr()) === 'none', String(await attr()))
check(
  'and off means the flat colour, with no image left on the shell',
  ((await groundOf('.app')) || '') === 'none',
  (await groundOf('.app')) || '(empty)'
)

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)
check('off survives a reload', (await attr()) === 'none', String(await attr()))

check('no page errors or console errors', problems.length === 0, problems.slice(0, 3).join(' || '))
check('and nothing failed to load but the build stamp', failedReqs.length === 0, failedReqs.slice(0, 3).join(' || '))

await browser.close()
const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) console.log('FAILED: ' + failed.map((f) => f.name).join(', '))
process.exit(failed.length ? 1 : 0)
