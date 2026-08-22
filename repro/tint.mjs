/**
 * repro/tint.mjs - the game sheet's colour, against the BUILT app.
 *
 * Replaces repro/ground.mjs. That harness covered the app-wide background glow
 * (removed) and a blurred key-art backdrop (replaced by a sampled colour), so
 * almost none of its assertions still describe anything that exists.
 *
 * Three of its assertions are carried over in spirit, because each one caught a
 * real defect and the underlying mistake is still possible:
 *
 *  - "the art actually tints the sheet, rather than merely existing". Every
 *    earlier assertion proved the backdrop's MARKUP was present, and the
 *    backdrop was invisible for two commits anyway. Presence is not effect.
 *  - "the veil travels with the content". The card is one background-color now,
 *    so it cannot come apart from the content, but the assertion that the whole
 *    scroll area is covered is what proves that.
 *  - the contrast floor, measured against composited pixels rather than assumed.
 *
 * Run: PW_CHROME=... BASE=http://127.0.0.1:PORT node repro/tint.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://127.0.0.1:4173'
const SHOT = 'https://images.igdb.com/igdb/image/upload/t_screenshot_med/scq1wb.jpg'
const COVER = 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1r7f.jpg'
const LONG =
  'Their flesh is your weapon. Possess warrior Shells, dethrone false gods and redeem a ravaged world in a standalone sequel built around adrenaline-charged, high-stakes combat. Every Shell carries its own history and its own way of dying, and the world remembers which ones you wore. Parry, harden and counter through a decaying pilgrimage of a map that folds back on itself, and decide how much of yourself is worth spending to get through it. The sheet has to OVERFLOW or nothing below the fold can be asserted at all, which is how two defects shipped.'

let pass = 0
let fail = 0
const failures = []
function check(name, ok, detail = '') {
  if (ok) pass++
  else { fail++; failures.push(name) }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ::  ${detail}` : ''}`)
}

const srgb = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
const json = (r, b) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) })

// The tint's whole safety argument is that the CLAMP bounds the card's colour,
// so the fixture uses the two extremes a cover can be rather than one game's
// art. A near-white cover is the worst case for text; a saturated one is the
// worst case for the clamp's saturation ceiling.
const COVERS = { 'near-white': '#fffdf6', teal: '#2f6b63', 'hot magenta': '#ff00aa' }

async function openSheet(page, coverHex, theme) {
  await page.route('**/rest/v1/**', (r) => json(r, []))
  // Generic BEFORE specific: the last matching route wins in Playwright, so
  // registering '**/api/**' after these would swallow both of them.
  await page.route('**/api/**', (r) => json(r, {}))
  await page.route('**/api/discover**', (r) =>
    json(r, { games: [{ id: 100, name: 'Mortal Shell II', summary: LONG, cover: COVER, year: 2026, rating: 90, screenshots: [SHOT, SHOT, SHOT], genres: ['Role-playing (RPG)', 'Adventure'], platforms: ['PS5', 'Series X|S'], companies: [{ name: 'Cold Symmetry', developer: true }], url: 'https://www.igdb.com/games/mortal-shell-ii' }] })
  )
  // /api/tint serves image BYTES from this origin. No CORS headers on purpose:
  // the reason the route exists at all is that the canvas read must not depend
  // on a header the IGDB CDN may or may not send.
  await page.route('**/api/tint**', (r) =>
    r.fulfill({ status: 200, contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="90"><rect width="64" height="90" fill="${coverHex}"/></svg>` })
  )
  const img = (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="90"><rect width="64" height="90" fill="${coverHex}"/></svg>` })
  await page.route('**/images.igdb.com/**', img)
  await page.route('**/wsrv.nl/**', img)

  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.evaluate((t) => { try { localStorage.setItem('gamedeck_theme_v1', t) } catch { /* private mode */ } }, theme)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /^Discover/ }).first().click()
  await page.waitForTimeout(1100)
  await page.getByRole('tab', { name: 'Browse', exact: true }).click()
  await page.waitForTimeout(500)
  await page.fill('.search-input', 'mortal')
  await page.waitForTimeout(1300)
  const card = await page.$('.discover-card')
  const t0 = Date.now()
  if (card) await card.click()
  let ms = null
  for (let i = 0; i < 120; i++) {
    const v = await page.evaluate(() => {
      const s = document.querySelector('.modal-sheet')
      return s ? s.style.getPropertyValue('--gs-tint') : null
    })
    if (v) { ms = Date.now() - t0; break }
    await page.waitForTimeout(20)
  }
  await page.waitForTimeout(350)
  return ms
}

/** Worst-case contrast over every element that renders text ON the card. */
async function worstContrast(page) {
  const boxes = await page.evaluate(() => {
    const sheet = document.querySelector('.modal-sheet')
    if (!sheet) return []
    const out = []
    for (const el of sheet.querySelectorAll('*')) {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)
      if (!own) continue
      const r = el.getBoundingClientRect()
      if (r.width < 6 || r.height < 6 || r.bottom <= 0 || r.top >= window.innerHeight) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.opacity === '0') continue
      // Decorative glyphs are exempt: the rating's star is aria-hidden and the
      // number beside it carries the value, so its colour is not text contrast.
      if (el.closest('[aria-hidden="true"]')) continue
      // Only text whose ground is the CARD. An element with an EFFECTIVELY
      // OPAQUE fill of its own - the accent Play button - carries its own known
      // ground and its contrast has nothing to do with the tint; measuring it
      // against the sheet behind it reported 1.12:1 on a perfectly fine control.
      //
      // The threshold is 0.9, not "any fill at all". The chips and the two
      // secondary buttons are translucent now so they take the card's colour,
      // which means they composite over an arbitrary tint and must be measured
      // like everything else. At the old "> 0.05" they would have been skipped
      // for having a background at all, and the change they were part of would
      // have shipped unchecked.
      const OPAQUE = 0.9
      let onCard = true
      for (let n = el; n && n !== sheet; n = n.parentElement) {
        const m = getComputedStyle(n).backgroundColor.match(/rgba?\(([^)]+)\)/)
        if (m) {
          const p = m[1].split(',').map(Number)
          if ((p.length > 3 ? p[3] : 1) >= OPAQUE) { onCard = false; break }
        }
        if (getComputedStyle(n).backgroundImage !== 'none') { onCard = false; break }
      }
      if (!onCard) continue
      // Inset past the border AND the corner radius. Text never sits on its
      // own rule, and sampling it reported .detail-link at 4.01:1 when what was
      // really being measured was --text against the walnut BORDER. Insetting
      // by the border width alone was still not enough at the CORNERS, where
      // the rule curves inward: 4.25:1 on the same element, same cause.
      const pad = Math.ceil(
        Math.max(parseFloat(cs.borderTopWidth) || 0, parseFloat(cs.borderLeftWidth) || 0) +
          (parseFloat(cs.borderTopLeftRadius) || 0)
      ) + 2
      const x = Math.max(0, Math.round(r.x) + pad)
      const y = Math.max(0, Math.round(r.y) + pad)
      const w = Math.round(r.width) - pad * 2
      const h = Math.round(Math.min(r.bottom, window.innerHeight) - y) - pad
      if (w < 4 || h < 4) continue
      out.push({
        sel: String(el.className || el.tagName).slice(0, 30),
        x, y, w, h,
        color: cs.color, size: parseFloat(cs.fontSize), weight: cs.fontWeight,
      })
    }
    return out
  })
  let worst = null
  for (const b of boxes) {
    const hide = await page.addStyleTag({ content: '.modal-sheet *{color:transparent !important;text-shadow:none !important}' })
    await page.waitForTimeout(60)
    const buf = await page.screenshot({ clip: { x: b.x, y: b.y, width: b.w, height: b.h } })
    await hide.evaluate((el) => el.remove())
    const ends = await page.evaluate(async (b64) => {
      const i = new Image(); i.src = 'data:image/png;base64,' + b64; await i.decode()
      const c = document.createElement('canvas'); c.width = i.width; c.height = i.height
      c.getContext('2d').drawImage(i, 0, 0)
      const d = c.getContext('2d').getImageData(0, 0, i.width, i.height).data
      let hi = null, hl = -1, lo = null, ll = 1e9
      for (let k = 0; k < d.length; k += 4) {
        const L = 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2]
        if (L > hl) { hl = L; hi = [d[k], d[k + 1], d[k + 2]] }
        if (L < ll) { ll = L; lo = [d[k], d[k + 1], d[k + 2]] }
      }
      return { hi, lo }
    }, buf.toString('base64'))
    if (!ends.hi || !ends.lo) continue
    const fg = b.color.match(/\d+/g).slice(0, 3).map(Number)
    const r = Math.min(ratio(fg, ends.hi), ratio(fg, ends.lo))
    const large = b.size >= 24 || (b.size >= 18.66 && Number(b.weight) >= 700)
    const floor = large ? 3.0 : 4.5
    if (!worst || r - floor < worst.margin) worst = { sel: b.sel, r, floor, margin: r - floor }
  }
  return worst
}

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME })

/* ------------------------------------------- the glow is gone, and stays gone */
{
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  await page.route('**/rest/v1/**', (r) => json(r, []))
  await page.route('**/api/**', (r) => json(r, {}))
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  const g = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-ground'),
    ground: getComputedStyle(document.documentElement).getPropertyValue('--ground').trim(),
    appImage: getComputedStyle(document.querySelector('.app')).backgroundImage,
    stored: (() => { try { return localStorage.getItem('gamedeck_ground_v1') } catch { return null } })(),
  }))
  check('no data-ground on the document', g.attr === null, String(g.attr))
  check('no --ground custom property left in the cascade', g.ground === '', `"${g.ground}"`)
  check('the app shell paints a flat colour, no gradient', g.appImage === 'none', g.appImage)
  check('nothing writes the old ground preference', g.stored === null, String(g.stored))
  await page.getByRole('button', { name: /Settings|Menu/i }).first().click().catch(() => {})
  await page.waitForTimeout(700)
  const hasControl = await page.evaluate(() => document.body.innerText.toLowerCase().includes('background glow'))
  check('and Settings offers no "Background glow" control', !hasControl, hasControl ? 'still present' : 'gone')
  await ctx.close()
}

/* ----------------------------------------------------------------- the tint */
for (const theme of ['dark', 'light']) {
  for (const [label, hex] of Object.entries(COVERS)) {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'block' })
    const page = await ctx.newPage()
    const ms = await openSheet(page, hex, theme)
    const tag = `${theme}/${label}`

    check(`${tag}: the card takes a tint`, ms !== null, ms === null ? 'never applied' : `applied in ${ms}ms`)

    // The reported bug was a delay, so the budget is an assertion, not a note.
    // The old path waited on the IGDB media fetch plus a 240ms hold plus a 320ms
    // fade. This reads a cached cover through a same-origin route.
    if (ms !== null) check(`${tag}: and takes it quickly`, ms < 400, `${ms}ms`)

    const geo = await page.evaluate(() => {
      const s = document.querySelector('.modal-sheet')
      s.scrollTop = 0
      const top = getComputedStyle(s).backgroundColor
      s.scrollTop = 99999
      return { top, scrolls: s.scrollHeight > s.clientHeight + 8, scrollH: s.scrollHeight, clientH: s.clientHeight }
    })
    // Vacuous-guard, kept from ground.mjs: a sheet that does not overflow proves
    // nothing about the part of the card you have to scroll to see.
    check(`${tag}: the sheet is long enough to scroll`, geo.scrolls, `${geo.scrollH} over ${geo.clientH}`)
    await page.waitForTimeout(200)
    const bottom = await page.evaluate(() => getComputedStyle(document.querySelector('.modal-sheet')).backgroundColor)
    check(
      `${tag}: the WHOLE card is that colour, not just the top`,
      geo.top === bottom && /rgb/.test(bottom),
      `top ${geo.top}  bottom ${bottom}`
    )

    // Effect, not presence. A tint equal to --surface is a tint that does nothing.
    const surf = theme === 'light' ? [246, 241, 233] : [35, 33, 32]
    const rgb = (bottom.match(/\d+/g) || []).slice(0, 3).map(Number)
    const dist = Math.round(Math.sqrt(rgb.reduce((t, v, i) => t + (v - surf[i]) ** 2, 0)))
    check(
      `${tag}: and it is far enough from the plain surface to see`,
      dist >= 12,
      `${bottom} against surface rgb(${surf.join(',')}): distance ${dist}`
    )

    // The hero backdrop's whole safety argument is GEOMETRIC: the art is masked
    // out before the first word, so no contrast measurement has to hold against
    // an arbitrary image. Assert the geometry directly, because the contrast
    // check below would still pass if the art merely happened to be dark.
    await page.evaluate(() => { document.querySelector('.modal-sheet').scrollTop = 0 })
    await page.waitForTimeout(200)
    const hero = await page.evaluate(() => {
      const s = document.querySelector('.modal-sheet')
      const t = document.querySelector('.detail-title')
      const h = document.querySelector('.gs-hero')
      if (!s || !t) return null
      const sr = s.getBoundingClientRect()
      return {
        present: Boolean(h),
        titleTop: Math.round(t.getBoundingClientRect().top - sr.top),
        box: { x: Math.round(sr.left), y: Math.round(sr.top), w: Math.round(sr.width) },
      }
    })
    if (hero && hero.present) {
      const hide = await page.addStyleTag({
        content: '.modal-sheet > *:not(.gs-hero){visibility:hidden !important}',
      })
      await page.waitForTimeout(180)
      const strip = await page.screenshot({
        clip: { x: hero.box.x, y: hero.box.y, width: hero.box.w, height: Math.min(520, hero.titleTop + 120) },
      })
      await hide.evaluate((el) => el.remove())
      const lastRow = await page.evaluate(async (b64) => {
        const i = new Image(); i.src = 'data:image/png;base64,' + b64; await i.decode()
        const c = document.createElement('canvas'); c.width = i.width; c.height = i.height
        c.getContext('2d').drawImage(i, 0, 0)
        const d = c.getContext('2d').getImageData(0, 0, i.width, i.height).data
        // The flat tint is whatever the bottom row of this strip reads, which is
        // past the mask by construction.
        const y0 = i.height - 2
        const k0 = (y0 * i.width + (i.width >> 1)) * 4
        const base = [d[k0], d[k0 + 1], d[k0 + 2]]
        let last = -1
        for (let y = 0; y < i.height; y++) {
          for (let x = 0; x < i.width; x += 3) {
            const k = (y * i.width + x) * 4
            const dd = Math.abs(d[k] - base[0]) + Math.abs(d[k + 1] - base[1]) + Math.abs(d[k + 2] - base[2])
            if (dd > 8) { last = y; break }
          }
        }
        return last
      }, strip.toString('base64'))
      check(
        `${tag}: the backdrop is gone before the first word`,
        lastRow > 0 && lastRow < hero.titleTop,
        `art stops at ${lastRow}px, title starts at ${hero.titleTop}px`
      )
    }

    const wTop = await worstContrast(page)
    await page.evaluate(() => { document.querySelector('.modal-sheet').scrollTop = 99999 })
    await page.waitForTimeout(250)
    const wBot = await worstContrast(page)
    check(
      `${tag}: every word on the card clears its floor, top and bottom`,
      wTop && wBot && wTop.margin >= 0 && wBot.margin >= 0,
      `top ${wTop ? wTop.r.toFixed(2) : '-'}:1 on "${wTop ? wTop.sel : '-'}", bottom ${wBot ? wBot.r.toFixed(2) : '-'}:1 on "${wBot ? wBot.sel : '-'}"`
    )
    await ctx.close()
  }
}

/* ------------------------------------- a game with no cover still opens fine */
{
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  await page.route('**/rest/v1/**', (r) => json(r, []))
  await page.route('**/api/**', (r) => json(r, {}))
  await page.route('**/api/discover**', (r) =>
    json(r, { games: [{ id: 101, name: 'Coverless', summary: LONG, cover: null, year: 2026, rating: 70, screenshots: [], genres: [], platforms: [], companies: [], url: null }] })
  )
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /^Discover/ }).first().click()
  await page.waitForTimeout(1100)
  await page.getByRole('tab', { name: 'Browse', exact: true }).click()
  await page.waitForTimeout(500)
  await page.fill('.search-input', 'coverless')
  await page.waitForTimeout(1300)
  const card = await page.$('.discover-card')
  if (card) { await card.click(); await page.waitForTimeout(900) }
  const r = await page.evaluate(() => {
    const s = document.querySelector('.modal-sheet')
    if (!s) return null
    return { tint: s.style.getPropertyValue('--gs-tint'), bg: getComputedStyle(s).backgroundColor }
  })
  check('a game with no cover opens', Boolean(r), r ? 'sheet present' : 'no sheet')
  check(
    'and falls back to the plain surface rather than a broken colour',
    Boolean(r) && !r.tint && /rgb/.test(r.bg),
    r ? `tint "${r.tint}"  background ${r.bg}` : '-'
  )
  await ctx.close()
}

await browser.close()
console.log(`\n${pass}/${pass + fail} passed`)
if (fail) { console.log('FAILED: ' + failures.join(', ')); process.exit(1) }
