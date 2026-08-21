/**
 * repro/discover.mjs - the Discover home's rail geometry, against the BUILT app.
 *
 * Written when the rails were tightened on 21 Aug, because a spacing decision
 * with no assertion under it is a comment. What it locks is deliberately not the
 * pixel values but the two RULES those values came from:
 *
 *   1. A heading belongs to the posters beneath it. The gap under a label must
 *      stay meaningfully smaller than the gap between two rails, or the label
 *      floats between rows and stops naming either. Asserted as a ratio.
 *   2. The rail is mostly poster. Spacing is a tenth of it, which is why the
 *      tightening is small, and the assertion records that rather than letting a
 *      later change quietly spend the poster to buy the same 40px.
 *
 * Run: PW_CHROME=... BASE=http://127.0.0.1:4173 node repro/discover.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://127.0.0.1:4173'
const results = []
const check = (name, pass, got) => {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${got !== undefined ? `  ::  ${got}` : ''}`)
}

// IGDB-shaped rail rows. Names are real, and deliberately long enough that a
// rail carries a two-line card title, which is the normal case: eleven of twenty
// real names take two lines at the default Medium shelf size.
const NAMES = [
  'Hollow Knight: Silksong', 'Clair Obscur: Expedition 33', 'Blue Prince', 'Split Fiction',
  'Kingdom Come: Deliverance II', 'Avowed', 'Monster Hunter Wilds', 'Doom: The Dark Ages',
]
const day = (n) => Math.floor((Date.now() + n * 86400000) / 1000)
const rail = (seed) =>
  NAMES.map((name, i) => ({
    id: seed * 100 + i, name, cover: null, year: 2025, rating: 80 + ((i + seed) % 15),
    released: day((i - 4) * 30), genres: ['Adventure'], platforms: ['Xbox', 'PC'],
  }))
const WISHLIST = NAMES.slice(0, 6).map((title, i) => ({
  igdb_id: 700 + i, title, cover: null, year: 2026, note: null, created_at: null,
  released: day(6 + i * 7), date_precision: 'day', release_label: 'soon',
}))

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined })
const ctx = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
  serviceWorkers: 'block',
  timezoneId: 'America/New_York',
})
const page = await ctx.newPage()
const problems = []
page.on('pageerror', (e) => problems.push('pageerror :: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') problems.push('console :: ' + m.text()) })

const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
await page.route('**/rest/v1/**', (route) =>
  route.request().url().includes('/wishlist') ? json(route, WISHLIST) : json(route, [])
)
// The generic handler goes FIRST: Playwright matches the LAST registered route,
// so registering it after the specific one silently swallows /api/discover and
// every rail renders as a skeleton.
await page.route('**/api/**', (route) => json(route, {}))
await page.route('**/api/discover**', (route) =>
  json(route, { rails: { popular: rail(1), upcoming: rail(2), recent: rail(3), highly_rated: rail(4) } })
)
const stub = (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>' })
await page.route('**/wsrv.nl/**', stub)
await page.route('**/images.igdb.com/**', stub)

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await page.getByRole('button', { name: /^Discover/ }).first().click()
await page.waitForTimeout(400)
// Discover lands on the For you feed now; the rails this file measures live on
// the Browse segment.
await page.getByRole('tab', { name: 'Browse', exact: true }).click()
await page.waitForTimeout(1800)

const m = await page.evaluate(() => {
  const px = (v) => Math.round(parseFloat(v) || 0)
  const shelves = [...document.querySelectorAll('.discover-browse .shelf')]
  const s = shelves[1]
  const head = s.querySelector('.shelf-head')
  const row = s.querySelector('.shelf-row')
  const hcs = getComputedStyle(head)
  const rcs = getComputedStyle(row)
  const poster = s.querySelector('.shelf-poster')
  const title = s.querySelector('.shelf-card-title')
  const meta = s.querySelector('.shelf-card-meta')
  const h = (e) => (e ? Math.round(e.getBoundingClientRect().height) : 0)
  return {
    count: shelves.length,
    labels: shelves.map((x) => x.querySelector('.shelf-title')?.textContent.trim()),
    rail: h(s),
    headPad: [px(hcs.paddingTop), px(hcs.paddingBottom)],
    rowPad: px(rcs.paddingBottom),
    shelfMargin: px(getComputedStyle(s).marginTop),
    poster: h(poster),
    title: h(title),
    meta: h(meta),
    // Ink to ink, which is what the eye reads: the padding under one rail's
    // cards, the margin, and the padding above the next label.
    railGap: px(rcs.paddingBottom) + px(getComputedStyle(shelves[2]).marginTop) + px(getComputedStyle(shelves[2].querySelector('.shelf-head')).paddingTop),
    labelGap: px(hcs.paddingBottom),
  }
})

check('the five default rails render', m.count === 5, `${m.count}: ${m.labels.join(' | ')}`)
check('the wishlist rail leads', m.labels[0] === 'Your wishlist', m.labels[0])

/* --------------------------------------------------------------- padding */

check('head padding is 6 and 6', m.headPad[0] === 6 && m.headPad[1] === 6, m.headPad.join(' / '))
check('the poster row sheds 2px underneath', m.rowPad === 4, String(m.rowPad))
check('the rail loses 8px, 289 to 281', m.rail === 281, `${m.rail}px`)

/* ----------------------------------------------------------- the ratio */

// The rule, not the numbers. A label has to read as belonging to the posters
// under it, which it only does while the gap between rails is clearly the bigger
// of the two. At 8 against 4, the tighter option reviewed alongside this, the
// two are close enough that a heading floats.
check(
  'a label sits closer to its own row than to the next',
  m.labelGap < m.railGap,
  `label ${m.labelGap}px, rail ${m.railGap}px`
)
check(
  'and the gap between rails is at least double',
  m.railGap >= m.labelGap * 2,
  `${(m.railGap / m.labelGap).toFixed(2)}x`
)
// The ratio alone does not settle it: the tighter option reviewed alongside this
// was 8 against 4, which is exactly 2x and still too little to separate two rows
// of poster art. So there is a floor as well as a ratio, and 8 fails it.
check('the gap between rails clears 12px', m.railGap >= 12, `${m.railGap}px`)

/* ------------------------------------------------- where the height is */

// Recorded so a later change cannot claim the same 40px by shrinking the poster
// or dropping the rating line and call it spacing.
const chrome = m.shelfMargin + m.headPad[0] + m.headPad[1] + m.rowPad
check('the poster is still most of the rail', m.poster / m.rail > 0.6, `${m.poster} of ${m.rail} (${Math.round((m.poster / m.rail) * 100)}%)`)
check('spacing is a tenth of it', chrome <= m.rail * 0.1, `${chrome}px of ${m.rail}`)
check('the card title still runs to two lines', m.title >= 28, `${m.title}px`)
check('the rating line survives', m.meta > 0, `${m.meta}px`)

await page.screenshot({ path: 'repro/out/discover-tight.png', fullPage: true })
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
await page.waitForTimeout(300)
await page.screenshot({ path: 'repro/out/discover-tight-light.png', fullPage: true })

check('no page errors or console errors', problems.length === 0, problems.slice(0, 3).join(' || '))

await browser.close()
const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) console.log('FAILED: ' + failed.map((f) => f.name).join(', '))
process.exit(failed.length ? 1 : 0)
