/**
 * repro/glass.mjs - the eight glass surfaces, and every piece of lettering that
 * has nothing behind it, measured on the composited pixel.
 *
 * Two runs per theme. The first is the app as it ships today, flat. The second
 * injects a GROUND behind .app - a gradient carrying a deliberately bright band,
 * harder than the real artwork - so a surface can be shown to isolate its text
 * from whatever ends up back there, rather than merely looking right on a flat
 * page.
 *
 * Everything is read off the rendered pixel: the text is hidden with a
 * stylesheet handle, its own box screenshotted, decoded through a canvas and
 * compared to its computed colour. The WORST pixel in the box is what counts,
 * not the mean: over a picture the two disagree, and the mean is the one that
 * says a failing flip is fine.
 *
 * Run: PW_CHROME=... BASE=http://127.0.0.1:4173 node repro/glass.mjs
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

// A ground with a bright band in it on purpose. The real artwork this was tuned
// against tops out around rgb(165) after its veil; this reaches rgb(216) before
// one, so anything that clears here clears a photograph.
// The veil follows the theme. A dark veil under a light theme drags the whole
// page dark while every token stays light, which is not a ground anyone would
// ship - it is a broken configuration, and testing against it would have
// condemned the tab bar for a fault in the fixture.
const ground = (theme) => `
.app { position: relative; }
.app::before {
  content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background:
    linear-gradient(180deg, ${theme === 'light'
      ? 'rgba(244,240,233,.74), rgba(244,240,233,.60) 22%, rgba(244,240,233,.64)'
      : 'rgba(18,16,14,.72), rgba(18,16,14,.56) 22%, rgba(18,16,14,.60)'}),
    linear-gradient(155deg, #100e0c 0%, #6f6a63 34%, #d8d2c8 52%, #4a453f 72%, #17140f 100%);
}
.app > * { position: relative; z-index: 1; }
`

// [selector, label, where it sits, AA bar]
const TARGETS = [
  ['.tabbar-btn', 'tab bar label', 'glass', AA_BODY],
  ['.seg-btn:not(.active)', 'segmented control label', 'glass', AA_BODY],
  ['.showing-chip', 'filter chip', 'glass', AA_BODY],
  ['.lane-chip:not(.active)', 'lane chip', 'glass', AA_BODY],
  ['.page-title', 'the large page title', 'bare', AA_LARGE],
  ['.page-subtitle', 'the page subtitle', 'bare', AA_BODY],
  ['.showing-label', '"Showing"', 'bare', AA_BODY],
  ['.activity-group-label', 'Activity day label', 'bare', AA_BODY],
  ['.shelf-title', 'Browse row heading', 'bare', AA_BODY],
  ['.shelf-card-title', 'Browse poster caption', 'bare', AA_BODY],
  ['.game-title', 'a Library row title', 'panel', AA_BODY],
]
const HIDE = TARGETS.map((t) => t[0]).join(',')

// Two of the bars sit behind a navigation this harness could not reliably drive
// (a rail's see-all page and Settings). Rather than leave them unmeasured and
// have that read as a pass, they are asserted from the STYLESHEET: for a change
// that is purely a token swap, "this rule resolves to the glass token" is the
// whole of the claim. Said out loud because it is a weaker kind of check than
// everything else here, and it is only adequate because their measured siblings
// - .seg and .library-sticky - carry identical declarations.
const BY_RULE = [
  ['.rail-sech', 'see-all section header'],
  ['.settings-hd', 'Settings header'],
  ['.library-sticky', 'Library search bar'],
  ['.chat-input-row', 'Ask AI composer'],
]

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME })
const NAMES = ['Persona 5 Royal', 'Kristala', 'Crimson Desert', 'Mistfall Hunter']
const games = NAMES.map((title, i) => ({
  master_id: i + 1, title, environment: 'xbox', playtime_minutes: 600 + i * 90, playtime_label: '10h',
  last_played: new Date(1787000000000 - i * 3600000 * 8).toISOString(), earned_awards: 5, total_awards: 20,
  percent: 25, cover_igdb: 'coclf1', cover_small: null, igdb_id: 100 + i, igdb_rating: 85,
  release_year: 2025, genre: 'Role-playing (RPG)', length_minutes: 3000,
  keywords: ['soulslike', 'open world'], platforms: ['Xbox'],
}))
const acts = [['2026-08-21', 220, 1, 34, 23], ['2026-08-20', 84, 0, 33, 22]].map(
  ([event_date, minutes_delta, achievements_delta, percent_after, earned_awards_after]) => ({
    master_id: 1, title: 'Persona 5 Royal', environment: 'xbox', event_date, minutes_delta,
    achievements_delta, percent_after, earned_awards_after, total_awards: 52, cover_small: null,
    playtime_minutes_after: 2000, last_played: event_date + 'T20:00:00Z', is_new: false }))
const disc = ['Mortal Shell II', 'Duskfade', 'Code Violet'].map((name, i) => ({
  id: 900 + i, name, summary: 'A game.', cover: null, coverId: 'coclf1', year: 2026, rating: 88 - i,
  genres: ['Role-playing (RPG)'], keywords: ['soulslike'], themes: ['Action'],
  platforms: ['Series X|S', 'PS5'], companies: [], release: { ts: 1790000000, precision: 'day', label: 'Sep 24, 2026' } }))

async function run(theme, withGround) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, serviceWorkers: 'block', timezoneId: 'America/New_York' })
  const page = await ctx.newPage()
  const json = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('**/rest/v1/**', (r) => {
    const u = r.request().url()
    return json(r, u.includes('/games') ? games : u.includes('recent_activity') ? acts : [])
  })
  await page.route('**/api/**', (r) => {
    const u = r.request().url()
    const keyed = (param, wrap) => {
      const m = new RegExp(`[?&]${param}=([^&]*)`).exec(u)
      if (!m) return null
      const o = {}
      for (const k of decodeURIComponent(m[1]).split(',')) o[k] = disc
      return { [wrap]: o }
    }
    return json(r, keyed('home', 'rails') || keyed('lanes', 'lanes') || { games: disc })
  })
  await page.route('**images.igdb.com/**', (r) => r.abort())
  await page.route('**wsrv.nl/**', (r) => r.abort())
  await page.addInitScript((t) => {
    try { localStorage.setItem('gamedeck_theme', JSON.stringify(t)) } catch {}
  }, theme)
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
  if (withGround) await page.addStyleTag({ content: ground(theme) })

  const found = {}
  const visit = async () => {
    for (const [sel] of TARGETS) {
      if (found[sel]) continue
      const n = await page.locator(sel).count()
      if (!n) continue
      if (!(await page.locator(sel).first().isVisible().catch(() => false))) continue
      const info = await page.evaluate((s) => {
        const el = document.querySelector(s)
        el.scrollIntoView({ block: 'center' })
        return { color: getComputedStyle(el).color.match(/\d+/g).slice(0, 3).map(Number) }
      }, sel)
      // Hide every target, screenshot this one's own box, put them back.
      const tag = await page.addStyleTag({ content: `${HIDE}{visibility:hidden !important}` })
      await page.waitForTimeout(90)
      const box = await page.evaluate((s) => {
        const el = document.querySelector(s)
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        // A pill's border curves a long way inside a 1px trim, so trimming one
        // pixel left the lit border ring in the sample and the "closest pixel"
        // rule kept choosing it over the fill the text is actually on. The
        // element's own padding is exactly the box the text occupies.
        const pl = Math.max(2, parseFloat(cs.paddingLeft) || 0)
        const pr = Math.max(2, parseFloat(cs.paddingRight) || 0)
        return { x: Math.max(0, Math.round(r.x + pl)), y: Math.max(0, Math.round(r.y) + 2),
          width: Math.max(6, Math.round(r.width - pl - pr)), height: Math.max(6, Math.round(r.height) - 4) }
      }, sel)
      let worst = null
      try {
        const buf = await page.screenshot({ clip: box })
        worst = await page.evaluate(async ({ d, c }) => {
          const img = new Image(); img.src = 'data:image/png;base64,' + d; await img.decode()
          const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height
          const g = cv.getContext('2d'); g.drawImage(img, 0, 0)
          const px = g.getImageData(0, 0, cv.width, cv.height).data
          // The pixel that is CLOSEST in luminance to the text is the one that
          // decides legibility, whichever side of it that pixel falls.
          const L = (p) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]
          const tl = L(c)
          let best = null, bd = 1e9
          for (let i = 0; i < px.length; i += 4) {
            const p = [px[i], px[i + 1], px[i + 2]]
            const d2 = Math.abs(L(p) - tl)
            if (d2 < bd) { bd = d2; best = p }
          }
          return best
        }, { d: buf.toString('base64'), c: info.color })
      } catch { /* off-screen */ }
      await tag.evaluate((el) => el.remove())
      if (worst) found[sel] = { color: info.color, worst, r: ratio(info.color, worst) }
    }
  }
  await page.waitForTimeout(1400)
  await visit()
  for (const tab of ['Library', 'Activity', 'Discover', 'News']) {
    await page.locator('.tabbar-btn', { hasText: tab }).first().click()
    await page.waitForTimeout(1500)
    await visit()
  }
  await page.locator('.tabbar-btn', { hasText: 'Discover' }).first().click()
  await page.waitForTimeout(1000)
  for (const sub of ['Browse', 'Ask AI']) {
    await page.getByRole('tab', { name: sub }).click()
    await page.waitForTimeout(2400)
    await visit()
  }
  // Two of the bars live behind a navigation rather than on a tab: the see-all
  // page a rail heading opens, and Settings. Left out, they read as passing.
  await page.getByRole('tab', { name: 'Browse' }).click()
  await page.waitForTimeout(1600)
  await page.locator('button.shelf-head').first().click().catch(() => {})
  await page.waitForTimeout(1800)
  await visit()
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(600)
  await page.locator('.brand-btn').first().click().catch(() => {})
  await page.waitForTimeout(800)
  await page.getByText('Settings', { exact: true }).first().click().catch(() => {})
  await page.waitForTimeout(1600)
  await visit()
  await ctx.close()
  return found
}

for (const theme of ['dark', 'light']) {
  for (const ground of [false, true]) {
    const f = await run(theme, ground)
    console.log(`\n== ${theme}, ${ground ? 'ON A GROUND' : 'flat as it ships today'}`)
    for (const [sel, label, kind, bar] of TARGETS) {
      const d = f[sel]
      if (!d) { console.log(`   ????  ${label}  ::  not reached`); continue }
      const ok = d.r >= bar
      console.log(`   ${ok ? ' ok ' : 'FAIL'}  ${label.padEnd(26)} ${kind.padEnd(6)} ${d.r.toFixed(2)}:1  (needs ${bar})  text rgb(${d.color}) on rgb(${d.worst})`)
      // Only the flat runs are asserted. The ground is not built yet, so its
      // veil here is this file's guess at one; asserting against a guess would
      // be asserting against myself. The ground columns are printed as the
      // specification the ground has to meet when it does land.
      if (!ground && (kind === 'glass' || kind === 'panel')) {
        check(`${theme}: ${label} clears AA`, ok, `${d.r.toFixed(2)}:1`)
      }
    }
    // Every target has to be reachable, or a surface silently went unmeasured.
    if (!ground) {
      check(`${theme}: every surface was reached`,
        TARGETS.every(([s]) => f[s]), TARGETS.filter(([s]) => !f[s]).map(([, l]) => l).join(', ') || 'all')
    } else {
      const bad = TARGETS.filter(([s, , k, bar]) => f[s] && k !== 'panel' && f[s].r < bar)
      console.log(`   -> on a ground, ${bad.length ? bad.map(([, l]) => l).join(', ') + ' would need a stronger veil' : 'everything clears'}`)
    }
  }
}
// ---- the two bars behind a navigation, from the stylesheet ----
{
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  await page.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.goto(BASE, { waitUntil: 'networkidle' })
  // discover.css ships with the Discover chunk, so its rules are not in
  // document.styleSheets until that tab has been opened. Without this the check
  // reported .rail-sech as having no background rule at all - a miss that looks
  // exactly like a regression.
  await page.locator('.tabbar-btn', { hasText: 'Discover' }).first().click()
  await page.waitForTimeout(2000)
  const rules = await page.evaluate((sels) => {
    const out = {}
    for (const sheet of document.styleSheets) {
      let list
      try { list = sheet.cssRules } catch { continue }
      for (const rule of list) {
        if (!rule.selectorText) continue
        for (const s of sels) {
          if (rule.selectorText.split(',').map((x) => x.trim()).includes(s)) {
            const bg = rule.style.getPropertyValue('background')
            if (bg) out[s] = bg.trim()
          }
        }
      }
    }
    return out
  }, BY_RULE.map(([s]) => s))
  console.log('\n== by rule, for the bars behind a navigation')
  for (const [sel, label] of BY_RULE) {
    const got = rules[sel]
    console.log(`   ${got === 'var(--glass)' ? ' ok ' : 'FAIL'}  ${label.padEnd(26)} ${sel} -> ${got || 'no background rule found'}`)
    check(`${label} is made of the glass token`, got === 'var(--glass)', got || 'not found')
  }
  await ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed} of ${results.length} passed`)
process.exit(failed ? 1 : 0)
