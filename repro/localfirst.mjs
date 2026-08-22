/**
 * repro/localfirst.mjs - the screen paints from disk, not from the network.
 *
 * Dave's own trace, taken on his machine: shell at 276 ms, LCP at 790 ms, and
 * the gap is six Supabase calls of 389-453 ms each. The server accounts for
 * 11 ms of that (`x-envoy-upstream-service-time`); the rest is getting there and
 * back. The 51-byte unread-dot query took 443 ms.
 *
 * So the fix is not to make those calls faster, it is to stop the screen waiting
 * on them. The library already worked this way. The wishlist, the activity feed
 * and the Game Pass leaving card did not.
 *
 * THE FIXTURE'S NETWORK IS DELIBERATELY SLOWER THAN THE ASSERTION WINDOW.
 * Every REST call takes 1,500 ms here, and the assertions require content in
 * under 900 ms. That is the whole design: a build that reads the network first
 * cannot pass, however fast the machine is, and a stub that answered instantly
 * would let one through.
 *
 * Run: PW_CHROME=... BASE=http://127.0.0.1:PORT node repro/localfirst.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://127.0.0.1:4173'
const SLOW = 1500
const BUDGET = 900

let pass = 0
let fail = 0
const failures = []
const check = (name, ok, detail = '') => {
  ok ? pass++ : (fail++, failures.push(name))
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ::  ${detail}` : ''}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const GAMES = Array.from({ length: 40 }, (_, i) => ({
  master_id: 1000 + i, environment: 'xbox', title: `Cached Game ${i}`,
  platforms: ['Xbox One'], earned_awards: 1, total_awards: 10, percent: '10.00',
  playtime_minutes: 600 + i, playtime_label: '10h 0m', last_played: '2026-08-18T10:00:00Z',
  cover_small: null, updated_at: '2026-08-18T10:00:00Z', length_minutes: 600,
  genre: 'Shooter', release_year: 2020, cover_igdb: `co${i}aa`, igdb_id: 20000 + i,
  igdb_rating: 80, franchises: null,
}))
const WISH = (tag) => [{
  igdb_id: 900001, title: `Wishlisted ${tag}`, cover: null, year: 2026, note: null,
  created_at: '2026-08-01T00:00:00Z', released: 1787788800, date_precision: 'day',
  release_label: 'Aug 27, 2026', last_synced: null,
}]
const ACT = [{
  master_id: 1000, title: 'Cached Game 0', environment: 'xbox',
  event_date: '2026-08-18', minutes_delta: 90, achievements_delta: 1, cover_small: null,
}]

async function open(browser, { slow, wish = 'A', onReq }) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  if (onReq) page.on('request', (r) => onReq(r.url()))
  const body = async (route, payload) => {
    if (slow) await sleep(SLOW)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
  }
  // Catch-alls FIRST.
  await page.route('**/rest/v1/**', (r) => body(r, []))
  await page.route('**/api/**', (r) => body(r, {}))
  await page.route('**/images.igdb.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>' }))
  await page.route('**/wsrv.nl/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>' }))
  await page.route('**/www.google.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>' }))
  await page.route('**/rest/v1/games**', (r) => body(r, GAMES))
  await page.route('**/rest/v1/wishlist**', (r) => body(r, WISH(wish)))
  await page.route('**/rest/v1/v_recent_activity**', (r) => body(r, ACT))
  return { ctx, page }
}

const hasContent = () =>
  document.querySelectorAll('#root .hm-card, #root .chart-card, #root .cover, #root .up-row').length > 0

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME })

/* ---------- 1. prime the caches, on a fast network ---------- */
const first = await open(browser, { slow: false })
await first.page.goto(BASE, { waitUntil: 'commit' })
await first.page.waitForSelector('.tabbar', { timeout: 30000 })
await first.page.waitForFunction(hasContent, { timeout: 30000 })
await first.page.waitForTimeout(1200)
const keys = await first.page.evaluate(
  () => new Promise((res) => {
    const q = indexedDB.open('gamedeck', 1)
    q.onsuccess = () => {
      const g = q.result.transaction('cache', 'readonly').objectStore('cache').getAllKeys()
      g.onsuccess = () => res(g.result.map(String))
      g.onerror = () => res([])
    }
    q.onerror = () => res([])
  })
)
const want = ['library:games', 'wishlist:rows', 'activity:', 'gamepass:leaving']
for (const w of want) {
  check(`${w} is persisted`, keys.some((k) => k.includes(w)), keys.join(', ') || '(nothing cached)')
}

/* ---------- 2. reload on a 1.5s network ---------- */
const reqs = []
const t0 = Date.now()
await first.page.unrouteAll({ behavior: 'ignoreErrors' })
const slowBody = async (route, payload) => { await sleep(SLOW); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) }) }
await first.page.route('**/rest/v1/**', (r) => slowBody(r, []))
await first.page.route('**/api/**', (r) => slowBody(r, {}))
await first.page.route('**/images.igdb.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>' }))
await first.page.route('**/wsrv.nl/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>' }))
await first.page.route('**/www.google.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>' }))
await first.page.route('**/rest/v1/games**', (r) => slowBody(r, GAMES))
await first.page.route('**/rest/v1/wishlist**', (r) => slowBody(r, WISH('B')))
await first.page.route('**/rest/v1/v_recent_activity**', (r) => slowBody(r, ACT))
first.page.on('request', (u) => {})
const seen = []
first.page.on('request', (r) => { if (r.url().includes('/rest/v1/')) seen.push({ url: r.url(), t: Date.now() - reloadAt }) })

let reloadAt = Date.now()
await first.page.reload({ waitUntil: 'commit' })
reloadAt = Date.now()
await first.page.waitForFunction(hasContent, { timeout: 30000 })
const contentAt = Date.now() - reloadAt

check(
  `content is on screen in under ${BUDGET}ms on a ${SLOW}ms network`,
  contentAt < BUDGET,
  `${contentAt}ms (the network could not have answered before ${SLOW}ms)`
)

// Painting from disk must not mean skipping the refresh. Every one of these is
// maxAge 0 precisely so a cached screen is still corrected.
await first.page.waitForTimeout(2500)
const refreshed = ['games', 'wishlist', 'v_recent_activity'].filter((t) =>
  seen.some((r) => r.url.includes(`/rest/v1/${t}`))
)
check(
  'every cached source is still revalidated on the same load',
  refreshed.length === 3,
  `refreshed: ${refreshed.join(', ') || 'none'}`
)

// Stale is not the same as frozen: the fresh wishlist must replace the cached one.
await first.page.waitForTimeout(2500)
const wishText = await first.page.evaluate(() => document.body.textContent || '')
check(
  'and the network answer still lands, replacing the cached one',
  wishText.includes('Wishlisted B') && !wishText.includes('Wishlisted A'),
  wishText.includes('Wishlisted B') ? 'fresh copy on screen' : wishText.includes('Wishlisted A') ? 'still showing the cached copy' : 'neither copy on screen'
)
await first.ctx.close()

/* ---------- 3. a first-ever launch still fetches at once ---------- */
// The empty-cache path has no disk copy to paint, so the network read IS the
// data and nothing may hold it back. This arm exists because the obvious next
// idea - deferring the 266 kB library refresh to idle - would look like an
// improvement while quietly delaying the one load that cannot afford it. (That
// idea was built and measured at 554ms against 556ms, so it is not in the app;
// this assertion is what stops it coming back by accident.)
const cold = await open(browser, { slow: false })
const coldSeen = []
let coldAt = Date.now()
cold.page.on('request', (r) => { if (/\/rest\/v1\/games/.test(r.url())) coldSeen.push(Date.now() - coldAt) })
coldAt = Date.now()
await cold.page.goto(BASE, { waitUntil: 'commit' })
await cold.page.waitForFunction(hasContent, { timeout: 30000 })
const coldContent = Date.now() - coldAt
check(
  'a first-ever launch fetches the library straight away',
  coldSeen.length > 0 && coldSeen[0] < coldContent + 50,
  coldSeen.length ? `games at ${coldSeen[0]}ms, content at ${coldContent}ms` : 'no games request'
)
await cold.ctx.close()

await browser.close()
console.log(`\n${pass}/${pass + fail} passed`)
if (fail) console.log('failed:', failures.join(' | '))
process.exit(fail ? 1 : 0)
