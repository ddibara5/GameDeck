/*
 * Drives the BUILT Insights tab against stubbed reads.
 *
 * Fixtures are the real rows, copied out of Supabase, so the assertions are about
 * what the tab renders on Dave's actual data rather than on numbers invented to
 * make them pass. The service worker is blocked: without that, a stubbed request
 * that never reaches the handler is indistinguishable from a broken feature.
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:4173'

const ACTIVITY = [
  { event_date: '2026-08-17', title: 'Persona 5 Royal', environment: 'xbox', minutes_delta: 98, achievements_delta: 0, percent_after: 31, cover_small: null, master_id: 550043, earned_awards_after: 21, total_awards: 52 },
  { event_date: '2026-08-16', title: 'Persona 5 Royal', environment: 'xbox', minutes_delta: 377, achievements_delta: 5, percent_after: 31, cover_small: null, master_id: 550043, earned_awards_after: 21, total_awards: 52 },
  { event_date: '2026-08-15', title: 'Persona 5 Royal', environment: 'xbox', minutes_delta: 220, achievements_delta: 2, percent_after: 24, cover_small: null, master_id: 550043, earned_awards_after: 16, total_awards: 52 },
  { event_date: '2026-08-14', title: 'Persona 5 Royal', environment: 'xbox', minutes_delta: 145, achievements_delta: 0, percent_after: 21, cover_small: null, master_id: 550043, earned_awards_after: 14, total_awards: 52 },
  { event_date: '2026-08-13', title: 'Persona 5 Royal', environment: 'xbox', minutes_delta: 74, achievements_delta: 0, percent_after: 21, cover_small: null, master_id: 550043, earned_awards_after: 14, total_awards: 52 },
  { event_date: '2026-08-12', title: 'Persona 5 Royal', environment: 'xbox', minutes_delta: 360, achievements_delta: 6, percent_after: 21, cover_small: null, master_id: 550043, earned_awards_after: 14, total_awards: 52 },
  { event_date: '2026-08-10', title: 'Persona 5 Royal', environment: 'xbox', minutes_delta: 162, achievements_delta: 2, percent_after: 12, cover_small: null, master_id: 550043, earned_awards_after: 8, total_awards: 52 },
  { event_date: '2026-08-09', title: 'Persona 5 Royal', environment: 'xbox', minutes_delta: 300, achievements_delta: 5, percent_after: 9, cover_small: null, master_id: 550043, earned_awards_after: 6, total_awards: 52 },
  { event_date: '2026-08-07', title: 'Kristala', environment: 'xbox', minutes_delta: 69, achievements_delta: 0, percent_after: 26, cover_small: null, master_id: 961911, earned_awards_after: 19, total_awards: 50 },
  { event_date: '2026-08-07', title: 'Persona 5 Royal', environment: 'xbox', minutes_delta: 63, achievements_delta: 0, percent_after: 2, cover_small: null, master_id: 550043, earned_awards_after: 1, total_awards: 52 },
]

const GAMES = [
  { master_id: 550043, title: 'Persona 5 Royal', environment: 'xbox', genre: 'Role-playing (RPG)', percent: 31, playtime_minutes: 1902, earned_awards: 21, total_awards: 52, last_played: '2026-08-17T22:00:00Z', igdb_id: 115653, cover_small: null },
  { master_id: 961911, title: 'Kristala', environment: 'xbox', genre: 'Role-playing (RPG)', percent: 26, playtime_minutes: 69, earned_awards: 19, total_awards: 50, last_played: '2026-08-07T20:00:00Z', igdb_id: 119171, cover_small: null },
  { master_id: 1, title: 'Destiny', environment: 'xbox', genre: 'Shooter', percent: 56, playtime_minutes: 42480, earned_awards: 176, total_awards: 300, last_played: '2016-03-09T00:00:00Z', igdb_id: 2222, cover_small: null },
  { master_id: 2, title: "Another Crab's Treasure", environment: 'xbox', genre: 'Adventure', percent: 24, playtime_minutes: 960, earned_awards: 12, total_awards: 44, last_played: '2026-06-01T00:00:00Z', igdb_id: 217590, cover_small: null },
  { master_id: 3, title: 'Never Touched', environment: 'psn', genre: 'Racing', percent: 0, playtime_minutes: 0, earned_awards: 0, total_awards: 30, last_played: null, igdb_id: 9, cover_small: null },
]

const WISHLIST = [
  { igdb_id: 347633, title: 'Mortal Shell II', cover: null, released: Math.floor(Date.UTC(2026, 7, 20) / 1000), release_label: 'Aug 20, 2026' },
  { igdb_id: 111, title: 'Resonance: A Plague Tale Legacy', cover: null, released: Math.floor(Date.UTC(2026, 7, 27) / 1000), release_label: 'Aug 27, 2026' },
  { igdb_id: 222, title: 'Star Wars Zero Company', cover: null, released: Math.floor(Date.UTC(2026, 7, 27) / 1000), release_label: 'Aug 27, 2026' },
  { igdb_id: 333, title: 'The Blood of Dawnwalker', cover: null, released: Math.floor(Date.UTC(2026, 8, 3) / 1000), release_label: 'Sep 03, 2026' },
]

const GAMEPASS_LEAVING = [{ igdb_id: 217590 }]

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined })
const ctx = await browser.newContext({
  viewport: { width: 390, height: 900 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  serviceWorkers: 'block',
  timezoneId: 'America/New_York',
})
const page = await ctx.newPage()

const failures = []
page.on('requestfailed', (r) => failures.push(r.url()))
page.on('pageerror', (e) => failures.push('pageerror :: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') failures.push('console :: ' + m.text()) })

const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

await page.route('**/rest/v1/**', (route) => {
  const u = route.request().url()
  if (u.includes('/v_recent_activity')) {
    // Two different reads hit the same view. The ascending, limit-1 one is the
    // coverage probe; answering both with the same payload would hide a mix-up.
    if (u.includes('order=event_date.asc')) return json(route, [{ event_date: '2026-08-07' }])
    return json(route, ACTIVITY)
  }
  if (u.includes('/games')) return json(route, GAMES)
  if (u.includes('/wishlist')) return json(route, WISHLIST)
  if (u.includes('/gamepass')) return json(route, GAMEPASS_LEAVING)
  if (u.includes('/sync_runs')) return json(route, [])
  if (u.includes('/news')) return json(route, [])
  return json(route, [])
})
await page.route('**/api/**', (route) => json(route, {}))
await page.route('**/wsrv.nl/**', (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>' }))

await page.goto(BASE, { waitUntil: 'networkidle' })
// Insights is a lazy chunk behind its tab.
await page.getByRole('button', { name: /insights/i }).first().click()
await page.waitForSelector('.page-title', { timeout: 10000 })
await page.waitForTimeout(700)

const read = () =>
  page.evaluate(() => {
    const text = (sel) => [...document.querySelectorAll(sel)].map((e) => e.textContent.trim())
    return {
      titles: text('.chart-title'),
      strips: document.querySelectorAll('.stats-strip').length,
      stripValues: text('.stat-value'),
      pending: text('.wk-pend'),
      deltas: text('.wk-delta'),
      npTitle: (document.querySelector('.np-t') || {}).textContent || null,
      npAch: text('.np-s').find((t) => /of \d+ achievements/.test(t)) || null,
      kv: text('.np-kv .v'),
      paceBig: (document.querySelector('.pace-big') || {}).textContent || null,
      pips: document.querySelectorAll('.pip').length,
      pipsOn: document.querySelectorAll('.pip.on').length,
      upRows: text('.up-t'),
      arcs: document.querySelectorAll('.ins-arc').length,
      // The three deleted charts, by the selectors only they ever used.
      donut: document.querySelectorAll('.ins-donut').length,
      legend: document.querySelectorAll('.ins-legend').length,
      svgLabels: [...document.querySelectorAll('svg')].map((s) => s.getAttribute('aria-label')),
      body: document.body.innerText,
    }
  })

const before = await read()
await page.screenshot({ path: 'repro/out/ins-default.png', fullPage: true })

// --- open the editor -------------------------------------------------------
await page.getByRole('button', { name: /customize cards/i }).click()
await page.waitForSelector('.cz-row')
const sheet = await page.evaluate(() => ({
  rows: document.querySelectorAll('.cz-row').length,
  on: document.querySelectorAll('.cz-toggle.on').length,
  off: document.querySelectorAll('.cz-row.off').length,
  headings: [...document.querySelectorAll('.cz-sec')].map((e) => e.textContent.trim()),
  labels: [...document.querySelectorAll('.cz-rl b')].map((e) => e.textContent.trim()),
}))
await page.screenshot({ path: 'repro/out/ins-customize.png', fullPage: true })

// Turn a lifetime card on, and a short-term one off.
await page.getByRole('switch', { name: /show hall of fame/i }).click()
await page.getByRole('switch', { name: /hide pace/i }).click()
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('gamedeck_insights_cards_v1')))
await page.getByRole('button', { name: 'Back' }).click()
await page.waitForTimeout(500)
const after = await read()
await page.screenshot({ path: 'repro/out/ins-toggled.png', fullPage: true })

// Reload: the layout must survive, which is the whole point of saving it.
await page.reload({ waitUntil: 'networkidle' })
await page.getByRole('button', { name: /insights/i }).first().click()
await page.waitForSelector('.page-title')
await page.waitForTimeout(700)
const reloaded = await read()

await browser.close()

const bad = []
const want = (cond, msg) => { if (!cond) bad.push(msg) }

console.log('default card titles:', before.titles)
console.log('strip values      :', before.stripValues)
console.log('now playing       :', before.npTitle, '|', before.npAch, '|', before.kv)
console.log('pace              :', before.paceBig, `${before.pipsOn}/${before.pips} pips`)
console.log('coming up / gp    :', before.upRows)
console.log('week pending      :', before.pending, 'deltas:', before.deltas)
console.log('sheet             :', sheet.rows, 'rows,', sheet.on, 'on,', sheet.off, 'off; headings', sheet.headings)
console.log('after toggle      :', after.titles)
console.log('after reload      :', reloaded.titles)

want(before.strips === 1, 'expected exactly one stats strip by default, got ' + before.strips)
want(before.stripValues[0] === '21h', '7d hours should be 21h, got ' + before.stripValues[0])
want(before.stripValues[1] === '13', '7d achievements should be 13 (the trigger fix), got ' + before.stripValues[1])
want(before.stripValues[2] === '6/7', 'days should be 6/7, got ' + before.stripValues[2])
want(before.npTitle === 'Persona 5 Royal', 'now playing should be Persona 5 Royal, got ' + before.npTitle)
want(/21 of 52 achievements/.test(before.npAch || ''), 'now playing achievements wrong: ' + before.npAch)
want(before.pips === 52 && before.pipsOn === 21, `pips should be 21/52, got ${before.pipsOn}/${before.pips}`)
want(before.arcs === 1, 'expected the progress arc')
want(before.pending.length === 1, 'week card should hold the comparison, got ' + JSON.stringify(before.pending))
want(before.deltas.length === 0, 'week card must NOT print a delta over an uncovered window')
want(before.upRows.some((t) => /Mortal Shell II/.test(t)), 'Mortal Shell II missing from Coming up')
want(before.upRows.some((t) => /Another Crab/.test(t)), "Another Crab's Treasure missing from Leaving Game Pass")
want(!before.titles.includes('Hall of fame'), 'lifetime cards should be off by default')
want(before.donut === 0 && before.legend === 0, 'donut markup still present')
want(!before.svgLabels.includes('Hours by platform'), 'donut chart still rendered')
want(!before.svgLabels.some((l) => /scatter/i.test(l || '')), 'genre scatter still rendered')
want(!before.svgLabels.some((l) => /release year/i.test(l || '')), 'vintage histogram still rendered')
want(sheet.rows === 12, 'editor should list 12 cards, got ' + sheet.rows)
want(sheet.on === 7 && sheet.off === 5, `editor should start 7 on / 5 off, got ${sheet.on}/${sheet.off}`)
want(sheet.headings.join('|') === 'Short term|Lifetime', 'group headings wrong: ' + sheet.headings)
want(after.titles.includes('Hall of fame'), 'toggling Hall of fame on did not render it')
want(!after.titles.includes('Pace'), 'toggling Pace off did not remove it')
want(stored && stored.enabled && stored.enabled.hall === true && stored.enabled.pace === false, 'config not persisted: ' + JSON.stringify(stored && stored.enabled))
want(reloaded.titles.includes('Hall of fame') && !reloaded.titles.includes('Pace'), 'layout did not survive a reload')
if (failures.length) bad.push('page failures: ' + failures.slice(0, 4).join(' | '))

if (bad.length) {
  console.error('\nFAIL:')
  bad.forEach((b) => console.error('  - ' + b))
  process.exit(1)
}
console.log('\nPASS: default layout, new cards, deletions, toggle, persistence')
