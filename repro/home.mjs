/*
 * Drives the BUILT Home tab, the reorganised drawer and the trimmed Insights tab
 * against stubbed reads.
 *
 * Fixtures are shaped like the real rows (a game in progress, one Game Pass exit,
 * wishlist releases either side of today, a library with ratings and years) so
 * the assertions are about what the app renders on data of this shape rather than
 * on numbers invented to make them pass.
 *
 * Three things this does that a lighter harness would not:
 *   - blocks the service worker, so a stubbed request that never reaches the
 *     handler cannot look like a working feature;
 *   - asserts REMOVED cards absent by the selectors only they ever used, never by
 *     counting cards, because a count passes when the wrong thing is gone. That
 *     covers the five that left Insights and now the three that left Home;
 *   - reloads after folding a drawer group, because a fold that forgets is worse
 *     than one that was never offered.
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:4173'
const day = (y, m, d) => Math.floor(Date.UTC(y, m, d) / 1000)
// Wishlist dates RELATIVE to today, for the same reason insights.mjs stopped
// using absolute ones: this fixture was written with literal August dates and
// rotted the moment one of them passed, which is what turned "the sheet is for
// the game that was tapped" red without a line of app code changing.
//
// `released` is a calendar day stored at UTC midnight, and Home rebuilds the
// local date from its UTC parts, so the fixture has to be UTC midnight of a
// LOCAL calendar day or the row lands a day off in ET.
const relDay = (n) => {
  const t = new Date()
  const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + n)
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 1000)
}
const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString()
const dkey = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10)

const ACTIVITY = [
  { event_date: dkey(1), title: 'Persona 5 Royal', environment: 'xbox', minutes_delta: 98, achievements_delta: 3, percent_after: 33, cover_small: null, master_id: 550043, earned_awards_after: 22, total_awards: 52 },
  { event_date: dkey(2), title: 'Persona 5 Royal', environment: 'xbox', minutes_delta: 377, achievements_delta: 5, percent_after: 30, cover_small: null, master_id: 550043, earned_awards_after: 19, total_awards: 52 },
  { event_date: dkey(4), title: 'Persona 5 Royal', environment: 'xbox', minutes_delta: 220, achievements_delta: 0, percent_after: 24, cover_small: null, master_id: 550043, earned_awards_after: 14, total_awards: 52 },
  { event_date: dkey(6), title: 'Persona 5 Royal', environment: 'xbox', minutes_delta: 145, achievements_delta: 0, percent_after: 21, cover_small: null, master_id: 550043, earned_awards_after: 14, total_awards: 52 },
]

// last_played older than PLAYING_WINDOW_DAYS (21) is what makes a started game
// derive as backlog rather than playing, which is the pool Pick up next draws on.
const GAMES = [
  { master_id: 550043, title: 'Persona 5 Royal', environment: 'xbox', genre: 'Role-playing (RPG)', percent: 33, playtime_minutes: 1967, playtime_label: '32h 47m', earned_awards: 22, total_awards: 52, last_played: iso(1), igdb_id: 115653, igdb_rating: 92, release_year: 2020, length_minutes: 6000, cover_small: null, cover_igdb: 'co1', platforms: 'Xbox' },
  { master_id: 2, title: "Another Crab's Treasure", environment: 'xbox', genre: 'Adventure', percent: 24, playtime_minutes: 939, playtime_label: '15h 39m', earned_awards: 12, total_awards: 44, last_played: iso(40), igdb_id: 217590, igdb_rating: 82, release_year: 2024, length_minutes: 1200, cover_small: null, cover_igdb: 'co2', platforms: 'Xbox' },
  { master_id: 3, title: 'Resident Evil 2', environment: 'xbox', genre: 'Shooter', percent: 3, playtime_minutes: 21, playtime_label: '21m', earned_awards: 1, total_awards: 42, last_played: iso(1600), igdb_id: 19686, igdb_rating: 90, release_year: 2019, length_minutes: 775, cover_small: null, cover_igdb: 'co3', platforms: 'Xbox' },
  { master_id: 4, title: 'Outer Wilds', environment: 'xbox', genre: 'Puzzle', percent: 4, playtime_minutes: 51, playtime_label: '51m', earned_awards: 2, total_awards: 30, last_played: iso(1500), igdb_id: 26856, igdb_rating: 87, release_year: 2019, length_minutes: 1224, cover_small: null, cover_igdb: 'co4', platforms: 'Xbox' },
  { master_id: 5, title: 'A Plague Tale: Requiem', environment: 'xbox', genre: 'Adventure', percent: 1, playtime_minutes: 8, playtime_label: '8m', earned_awards: 1, total_awards: 50, last_played: iso(900), igdb_id: 152271, igdb_rating: 85, release_year: 2022, length_minutes: 1090, cover_small: null, cover_igdb: 'co5', platforms: 'Xbox' },
  // Junk the gates must keep out: old, low rated, never opened.
  { master_id: 6, title: 'FIFA 14', environment: 'xbox', genre: 'Sport', percent: 0, playtime_minutes: 0, playtime_label: '0m', earned_awards: 0, total_awards: 43, last_played: null, igdb_id: 2920, igdb_rating: 78, release_year: 2013, length_minutes: 82, cover_small: null, cover_igdb: 'co6', platforms: 'Xbox' },
  { master_id: 7, title: 'UNO', environment: 'xbox', genre: 'Card & Board Game', percent: 0, playtime_minutes: 0, playtime_label: '0m', earned_awards: 0, total_awards: 12, last_played: null, igdb_id: 5555, igdb_rating: 61, release_year: 2016, length_minutes: 180, cover_small: null, cover_igdb: 'co7', platforms: 'Xbox' },
]

// Coming up reads the shared wishlist cache now rather than its own filtered
// query, so these rows carry what the real table carries: date_precision is what
// keeps a quarter or a year out of the card, and the far-future row proves the
// 60-day horizon is still applied client-side.
// Nine rows, arranged around today so BOTH release cards have four candidates
// and every gate has something it must reject. Coming up looks 60 days forward,
// Recently released 60 days back, and day 0 belongs to Coming up alone.
const WISHLIST = [
  // Coming up, in order. Day 0 first, then three inside the horizon.
  { igdb_id: 111, title: 'A Game Out Today', cover: null, year: 2026, note: null, created_at: iso(100), released: relDay(0), date_precision: 'day', release_label: 'today' },
  { igdb_id: 222, title: 'Star Wars Zero Company', cover: null, year: 2026, note: null, created_at: iso(90), released: relDay(6), date_precision: 'day', release_label: 'in 6 days' },
  { igdb_id: 333, title: 'The Blood of Dawnwalker', cover: null, year: 2026, note: null, created_at: iso(60), released: relDay(13), date_precision: 'day', release_label: 'in 13 days' },
  { igdb_id: 666, title: 'Onimusha: Way of the Sword', cover: null, year: 2026, note: null, created_at: iso(50), released: relDay(25), date_precision: 'day', release_label: 'in 25 days' },
  // Recently released, in order.
  { igdb_id: 347633, title: 'Mortal Shell II', cover: null, year: 2026, note: null, created_at: iso(120), released: relDay(-1), date_precision: 'day', release_label: 'yesterday' },
  { igdb_id: 777, title: 'Duskfade', cover: null, year: 2026, note: null, created_at: iso(110), released: relDay(-8), date_precision: 'day', release_label: '8 days ago' },
  { igdb_id: 888, title: 'The Relic: First Guardian', cover: null, year: 2026, note: null, created_at: iso(105), released: relDay(-21), date_precision: 'day', release_label: '21 days ago' },
  { igdb_id: 999, title: 'Black Flag Resynced', cover: null, year: 2026, note: null, created_at: iso(102), released: relDay(-43), date_precision: 'day', release_label: '43 days ago' },
  // Four rows each card must REJECT, and each rejects for a different reason.
  // A wishlist row you have since bought is not news: this one's igdb_id is the
  // one on Another Crab's Treasure in GAMES, so only the ownership filter keeps
  // it out of Recently released.
  { igdb_id: 217590, title: "Another Crab's Treasure", cover: null, year: 2024, note: null, created_at: iso(200), released: relDay(-5), date_precision: 'day', release_label: '5 days ago' },
  { igdb_id: 1212, title: 'A Long Gone Game', cover: null, year: 2025, note: null, created_at: iso(300), released: relDay(-200), date_precision: 'day', release_label: 'last year' },
  { igdb_id: 444, title: 'A Quarter-Dated Game', cover: null, year: 2027, note: null, created_at: iso(30), released: day(2027, 11, 31), date_precision: 'quarter', release_label: 'Q4 2027' },
  { igdb_id: 555, title: 'A Far Future Game', cover: null, year: 2027, note: null, created_at: iso(20), released: relDay(400), date_precision: 'day', release_label: 'next year' },
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

const problems = []
page.on('requestfailed', (r) => problems.push('requestfailed :: ' + r.url()))
page.on('pageerror', (e) => problems.push('pageerror :: ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error') problems.push('console :: ' + m.text())
})

const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
await page.route('**/rest/v1/**', (route) => {
  const u = route.request().url()
  if (u.includes('/v_recent_activity')) {
    if (u.includes('order=event_date.asc')) return json(route, [{ event_date: dkey(13) }])
    return json(route, ACTIVITY)
  }
  if (u.includes('/games')) return json(route, GAMES)
  if (u.includes('/wishlist')) return json(route, WISHLIST)
  if (u.includes('/gamepass')) return json(route, GAMEPASS_LEAVING)
  if (u.includes('/game_status')) return json(route, [])
  if (u.includes('/sync_runs')) return json(route, [])
  if (u.includes('/news')) return json(route, [])
  return json(route, [])
})
await page.route('**/api/**', (route) => json(route, {}))
await page.route('**/wsrv.nl/**', (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>' }))
// Settings asks GitHub for the latest commit to print a version line. It is an
// external service this harness has no business hitting, and the sandbox blocks
// it, so it is answered here rather than left to fail and pollute the verdict.
await page.route('**/api.github.com/**', (route) => json(route, [{ sha: 'stubbed0000000000000000000000000000000', commit: { message: 'stub', author: { date: new Date().toISOString() } } }]))
await page.route('**/images.igdb.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>' }))

const results = []
const check = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  :: ' + detail : ''}`)
}

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('.app-header-title', { timeout: 10000 })
await page.waitForTimeout(900)

/* ---------------------------------------------------------------- 1. lands */

const home = await page.evaluate(() => ({
  title: document.querySelector('.app-header-title')?.textContent.trim(),
  // The title moved into the header on 21 Aug and became the heading with it.
  // Both halves are asserted: one h1, and it is the header's.
  h1s: [...document.querySelectorAll('h1')].map((e) => e.textContent.trim()),
  h1InHeader: document.querySelector('.app-header h1.app-header-title') !== null,
  oldTitles: document.querySelectorAll('.page-title').length,
  subtitle: document.querySelector('.page-subtitle')?.textContent.trim(),
  headerH: Math.round(document.querySelector('.app-header').getBoundingClientRect().height),
  firstCardTop: (() => {
    const e = document.querySelector('.app-main .chart-card, .app-main .hm-grid')
    return e ? Math.round(e.getBoundingClientRect().top + window.scrollY) : null
  })(),
  tabs: [...document.querySelectorAll('.tabbar-btn')].map((b) => b.textContent.trim()),
  active: document.querySelector('.tabbar-btn.active')?.textContent.trim(),
  cardTitles: [...document.querySelectorAll('.chart-title')].map((e) => e.textContent.trim()),
  tiles: [...document.querySelectorAll('.hm-tile')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
  banner: document.querySelector('.hm-banner')?.textContent.replace(/\s+/g, ' ').trim() || null,
  arcs: document.querySelectorAll('.ins-arc').length,
  upRows: [...document.querySelectorAll('.up-row')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
  cuRows: [...document.querySelectorAll('[data-card="coming_up"] .up-row')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
  rrRows: [...document.querySelectorAll('[data-card="recently_released"] .up-row')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
  expands: [...document.querySelectorAll('.hm-expand')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
  soloGrids: document.querySelectorAll('.hm-grid.solo').length,
  gridCols: (() => {
    const g = document.querySelector('.hm-grid')
    return g ? getComputedStyle(g).gridTemplateColumns.split(' ').length : 0
  })(),
  // The selectors the three removed cards were the ONLY users of. A card count
  // would pass with the wrong card gone; these cannot.
  gone: ['hm-pick', 'hm-pb', 'hm-pn', 'hm-chip', 'hm-skip', 'hm-link', 'pace-hero', 'pace-big']
    .map((c) => `${c}:${document.querySelectorAll('.' + c).length}`)
    .join(' '),
}))

check('lands on Home', home.title === 'Home', home.title)
check('bar is home/library/activity/discover/news', home.tabs.join('|') === 'Home|Library|Activity|Discover|News', home.tabs.join('|'))
check('Home is the active tab', home.active === 'Home', home.active)

/* ------------------------------------------------- the header carries it */

// A heading that is never painted is still in the accessibility tree, so the
// 34px copies were deleted from the tabs rather than hidden. Exactly one h1, in
// the header, saying the tab's name.
check('exactly one heading, in the header', home.h1s.length === 1 && home.h1InHeader, home.h1s.join('|'))
check('the heading is the tab name', home.h1s[0] === 'Home', home.h1s[0])
check('no 34px copy is left anywhere', home.oldTitles === 0, String(home.oldTitles))
// The one part the header cannot carry. On Home it is the date.
check('the subtitle survives', /^[A-Z][a-z]+day, /.test(home.subtitle || ''), home.subtitle)
// The point of the change. 218 before the chips came off, 210 after, 166 now.
check('the first card clears the old title block', home.firstCardTop !== null && home.firstCardTop < 190, String(home.firstCardTop))
check('Now playing renders with its arc', home.cardTitles.includes('Now playing') && home.arcs === 1, `arcs=${home.arcs}`)
// One tile left in the catalog, so the run is a run of one and takes the whole
// width. Asserted as a COLUMN COUNT rather than a pixel width: a half-width tile
// in a two-column grid and a full-width one in a one-column grid can measure the
// same on a narrow phone, and the rule is about the grid, not the pixels.
check('This week is the only tile', home.tiles.length === 1 && /This week/.test(home.tiles[0]), home.tiles.join(' // '))
check('a solo tile takes the full width', home.soloGrids === 1 && home.gridCols === 1, `solo=${home.soloGrids} cols=${home.gridCols}`)
check('one Game Pass exit renders as a banner', Boolean(home.banner) && /Leaving Game Pass soon/.test(home.banner), home.banner)
check('banner does not invent a countdown', !/\d+ days/.test(home.banner || ''), home.banner)
// Backlog, Pick up next and Pace were REMOVED on 21 Aug, not switched off. Both
// halves matter: gone from the page, and gone from the editor that offers cards,
// because a catalog entry is a promise that the card exists.
check('the removed cards left no markup behind', home.gone === 'hm-pick:0 hm-pb:0 hm-pn:0 hm-chip:0 hm-skip:0 hm-link:0 pace-hero:0 pace-big:0', home.gone)
check('no Pick up next or Pace card', !home.cardTitles.some((t) => /Pick up next|Pace/.test(t)), home.cardTitles.join(', '))
check('Coming up renders dated releases', home.cuRows.length === 2 && home.cardTitles.includes('Coming up'), home.cuRows.join(' // '))
check('out-today row reads "Out today"', /Out\s*today/.test(home.cuRows[0] || ''), home.cuRows[0])
// Two rows the card must NOT show: a quarter-precision date resolves to the end
// of its window and would read as a day it is not, and a release beyond the
// 60-day horizon is not news yet. Both filters used to be in Home's own query
// and are client-side now that the rows come from the shared cache.
check('quarter-precision releases stay out', !home.upRows.some((r) => /Quarter-Dated/.test(r)), home.upRows.join(' // '))
check('releases past the horizon stay out', !home.upRows.some((r) => /Far Future/.test(r)), home.upRows.join(' // '))

/* ------------------------------------------------ Recently released */

// The mirror of Coming up across today. Everything below is about the BOUNDARY
// between the two cards and the four rows this one has to reject, because a card
// that renders is not the same as a card that renders the right rows.
check('Recently released renders past releases', home.cardTitles.includes('Recently released') && home.rrRows.length === 2, home.rrRows.join(' // '))
check('the newest past release is first', /Mortal Shell II/.test(home.rrRows[0] || ''), home.rrRows[0])
check('a past row counts backwards', /1\s*ago/i.test(home.rrRows[0] || ''), home.rrRows[0])
// Day 0 is Coming up's, rendered as "Out today". If Recently released ever
// claimed it too, the same game would sit in both cards on the same screen.
check('day zero belongs to Coming up alone', !home.rrRows.some((r) => /Out Today/i.test(r)), home.rrRows.join(' // '))
check('the two cards share no game', !home.cuRows.some((c) => home.rrRows.some((r) => r.slice(6) === c.slice(6))), `${home.cuRows.length} // ${home.rrRows.length}`)
// Released five days ago and sitting in GAMES, so ONLY the ownership filter
// keeps it out. Without that filter it would be the second row.
check('a wishlist game you now own stays out', !home.rrRows.some((r) => /Another Crab/.test(r)), home.rrRows.join(' // '))
check('releases past the 60-day window stay out', !home.upRows.some((r) => /Long Gone/.test(r)), home.upRows.join(' // '))

/* ------------------------------------------------------ the expand */

// Two rows each is what keeps the pair inside one screenful. The control only
// appears when there is something behind it, and it has to come back.
check('both release cards preview two rows', home.upRows.length === 4, String(home.upRows.length))
check('both offer the same expand', home.expands.length === 2 && home.expands.every((t) => /Show 2 more/.test(t)), home.expands.join(' | '))

const expandAll = async () => {
  const n = await page.locator('.hm-expand').count()
  for (let i = 0; i < n; i++) await page.locator('.hm-expand').nth(i).click()
  await page.waitForTimeout(350)
}
await expandAll()
const opened = await page.evaluate(() => ({
  cu: document.querySelectorAll('[data-card="coming_up"] .up-row').length,
  rr: document.querySelectorAll('[data-card="recently_released"] .up-row').length,
  labels: [...document.querySelectorAll('.hm-expand')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
}))
check('expanding shows all four in each', opened.cu === 4 && opened.rr === 4, `cu=${opened.cu} rr=${opened.rr}`)
check('the expand turns into Show less', opened.labels.every((t) => /Show less/.test(t)), opened.labels.join(' | '))
await expandAll()
const reclosed = await page.evaluate(() => document.querySelectorAll('.up-row').length)
check('it collapses back to two each', reclosed === 4, String(reclosed))

await page.screenshot({ path: 'repro/out/home-dark.png', fullPage: true })

// A Coming up row is a wishlist row, so it opens the wishlist variant of the
// sheet: the same one the Wishlist page opens, with the same heart on it.
const upBtns = await page.locator('[data-card="coming_up"] .up-row.as-btn').count()
check('Coming up rows are buttons', upBtns === 2, String(upBtns))
// A chevron marks a CARD that leads somewhere, never a row inside one. The rows
// are tappable like every other row in the app and say so by behaving, not by
// carrying a mark each.
const rowChevs = await page.locator('.up-row .hm-chev').count()
check('the rows carry no chevron of their own', rowChevs === 0, String(rowChevs))
await page.locator('[data-card="coming_up"] .up-row.as-btn').first().click()
await page.waitForTimeout(700)
const sheet = await page.evaluate(() => {
  const el = document.querySelector('.sheet, .gs-sheet, [role="dialog"]')
  return {
    open: Boolean(el),
    text: el ? el.textContent.replace(/\s+/g, ' ').trim().slice(0, 160) : null,
  }
})
check('tapping a Coming up row opens a sheet', sheet.open, sheet.text)
check('the sheet is for the game that was tapped', /A Game Out Today/.test(sheet.text || ''), sheet.text)
await page.screenshot({ path: 'repro/out/comingup-sheet.png', fullPage: true })
// Close by tapping the backdrop, the way a thumb does. Asserting the page title
// is still readable would pass with the sheet WIDE OPEN, since the page is right
// underneath it; the assertion has to be that the backdrop is gone.
await page.locator('.modal-backdrop').click({ position: { x: 8, y: 8 } })
await page.waitForTimeout(700)
const closed = await page.evaluate(() => ({
  backdrop: document.querySelectorAll('.modal-backdrop').length,
  title: document.querySelector('.app-header-title')?.textContent.trim(),
}))
check('the sheet closes back to Home', closed.backdrop === 0 && closed.title === 'Home', JSON.stringify(closed))

// The chevron on the Coming up heading goes to the whole Wishlist, which is the
// same page the drawer opens rather than a second, thinner copy of it.
// One per release card now, not one on the page. Both go to the same Wishlist.
const moreBtn = await page.locator('.hm-more').count()
check('each release card has a chevron to the wishlist', moreBtn === 2, String(moreBtn))
const moreBox = await page.locator('.hm-more').first().boundingBox()
check('the chevron is a real tap target', moreBox.width >= 30 && moreBox.height >= 30, `${Math.round(moreBox.width)}x${Math.round(moreBox.height)}`)
await page.locator('.hm-more').first().click()
await page.waitForTimeout(800)
const wl = await page.evaluate(() => ({
  title: document.querySelector('.wl-title')?.textContent.trim(),
  sub: document.querySelector('.wl-sub')?.textContent.trim(),
}))
check('the chevron opens the Wishlist page', wl.title === 'Wishlist', `${wl.title} / ${wl.sub}`)
// Five rows in the fixture, including the two Coming up filters out. The page is
// the whole list, not the card's four.
// Twelve rows in the fixture, eleven on the page: the Wishlist already drops
// anything that has since landed in the synced library, which is Another Crab's
// Treasure. So Recently released is not inventing an ownership rule, it is
// applying the one this app already had, and this number is what proves the two
// surfaces agree.
check('the Wishlist page shows every row it keeps', /11 games/.test(wl.sub || ''), wl.sub)
await page.screenshot({ path: 'repro/out/wishlist-from-home.png', fullPage: true })
await page.locator('.wl-back').first().click()
await page.waitForTimeout(700)
const backHome = await page.evaluate(() => ({
  title: document.querySelector('.app-header-title')?.textContent.trim(),
  wl: document.querySelectorAll('.wl-page').length,
}))
check('back from the Wishlist returns to Home', backHome.title === 'Home' && backHome.wl === 0, JSON.stringify(backHome))

/* -------------------------------------------------- 2. the cards editor */

// The other half of "removed, not switched off": Customize cards must not offer
// them either.
await page.locator('.customize-btn').click()
await page.waitForTimeout(600)
const czCards = await page.evaluate(() => [...document.querySelectorAll('.cz-rl b')].map((e) => e.textContent.trim()))
check('the editor offers five cards', czCards.length === 5, String(czCards.length))
check('the editor offers the right five', czCards.join('|') === 'Now playing|This week|Leaving Game Pass|Coming up|Recently released', czCards.join('|'))
await page.locator('.settings-back').first().click()
await page.waitForTimeout(600)

/* -------------------------------------------------------------- 3. insights */

// Insights is off the bar by default now, so it is reached from the drawer.
await page.locator('.brand-btn, .brand').first().click()
await page.waitForTimeout(450)
const drawer = await page.evaluate(() => ({
  groups: [...document.querySelectorAll('.drawer .menu-sec-label')].map((e) => e.textContent.trim()),
  rows: [...document.querySelectorAll('.drawer .menu-item')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
  pills: [...document.querySelectorAll('.drawer .menu-bar-tag')].length,
  here: document.querySelector('.drawer .menu-item.here')?.textContent.replace(/\s+/g, ' ').trim() || null,
  foot: [...document.querySelectorAll('.menu-fb')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
  footVisible: (() => {
    const body = document.querySelector('.drawer-body')
    return [...document.querySelectorAll('.menu-fb')].every((e) => e.getBoundingClientRect().top >= body.getBoundingClientRect().bottom - 1)
  })(),
  folds: document.querySelectorAll('.drawer .menu-sec').length,
  open: [...document.querySelectorAll('.drawer .menu-sec')].map((e) => e.getAttribute('aria-expanded')),
}))
// Three groups, not four. Settings was the whole App group and is pinned in the
// footer now, out of the ordered list entirely.
check('drawer groups in order', drawer.groups.join('|') === 'Your games|Explore|Shelves', drawer.groups.join('|'))
check('drawer lists every destination', drawer.rows.length === 12, String(drawer.rows.length))
check('wishlist sits under Explore', drawer.rows.some((r) => r.startsWith('Wishlist')), '')
// The die left the header for the list. Explore is Discover, News, Wishlist,
// Shuffle: four ways to find the next thing.
check('Shuffle sits under Explore', drawer.rows.some((r) => r.startsWith('Shuffle')), drawer.rows.join(' // '))
check('Settings is not a row any more', !drawer.rows.some((r) => r.startsWith('Settings')), drawer.rows.join(' // '))
check('five tabs carry an on-bar pill', drawer.pills === 5, String(drawer.pills))
check('current tab is marked', /^Home/.test(drawer.here || ''), drawer.here)
// The point of the pin: both sit BELOW the scrolling body, so no amount of list
// growth can push them off. Asserted as geometry rather than as "the element
// exists", because it existed before too, 113px below the fold.
check('Settings and Customize are pinned', drawer.foot.join('|') === 'Settings|Customize', drawer.foot.join('|'))
check('the pinned pair sits outside the scroll', drawer.footVisible, JSON.stringify(drawer.foot))
check('every group heading folds', drawer.folds === 3 && drawer.open.join('') === 'truetruetrue', `${drawer.folds} / ${drawer.open.join(',')}`)
await page.screenshot({ path: 'repro/out/drawer-dark.png', fullPage: true })

/* ------------------------------------------------ folding a drawer group */

// Shelves holds four rows. Folding it has to take exactly those four out, keep
// every other row, say how many it is holding, and still be folded after a
// reload. The count is asserted because a folded heading with no count is a dead
// end: the rows are what say how many, and they are gone.
await page.locator('.drawer .menu-sec', { hasText: 'Shelves' }).click()
await page.waitForTimeout(350)
const folded = await page.evaluate(() => ({
  rows: [...document.querySelectorAll('.drawer .menu-item')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
  groups: [...document.querySelectorAll('.drawer .menu-sec-label')].map((e) => e.textContent.trim()),
  n: document.querySelector('.drawer .menu-sec.folded .menu-sec-n')?.textContent.trim(),
  open: [...document.querySelectorAll('.drawer .menu-sec')].map((e) => e.getAttribute('aria-expanded')),
  stored: JSON.parse(localStorage.getItem('gamedeck_nav_v2') || '{}').collapsed,
}))
check('folding hides that group only', folded.rows.length === 8 && !folded.rows.some((r) => /^Backlog|^Playing|^Finished|^Abandoned/.test(r)), String(folded.rows.length))
check('the other groups are untouched', folded.rows.some((r) => /^Home/.test(r)) && folded.rows.some((r) => /^Wishlist/.test(r)) && folded.rows.some((r) => /^Shuffle/.test(r)), '')
check('a folded heading says how many', folded.n === '4', folded.n)
check('only that heading reports folded', folded.open.join(',') === 'true,true,false', folded.open.join(','))
check('the fold is stored, not just drawn', JSON.stringify(folded.stored) === '{"shelves":true}', JSON.stringify(folded.stored))
// The headings still print in the same order with a group shut, because the fold
// hides rows and never touches the order.
check('the order survives the fold', folded.groups.join('|') === 'Your games|Explore|Shelves4', folded.groups.join('|'))
await page.screenshot({ path: 'repro/out/drawer-folded.png', fullPage: true })

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(900)
await page.locator('.brand-btn, .brand').first().click()
await page.waitForTimeout(500)
const afterFoldReload = await page.evaluate(() => document.querySelectorAll('.drawer .menu-item').length)
check('the fold survives a reload', afterFoldReload === 8, String(afterFoldReload))

// And back, because a fold you cannot undo is a deletion.
await page.locator('.drawer .menu-sec', { hasText: 'Shelves' }).click()
await page.waitForTimeout(350)
const unfolded = await page.evaluate(() => ({
  rows: document.querySelectorAll('.drawer .menu-item').length,
  stored: JSON.parse(localStorage.getItem('gamedeck_nav_v2') || '{}').collapsed,
}))
check('unfolding brings the rows back', unfolded.rows === 12, String(unfolded.rows))
// Emptied rather than left holding `false`, so storage lists folded groups only.
check('unfolding clears the stored key', JSON.stringify(unfolded.stored) === '{}', JSON.stringify(unfolded.stored))

await page.getByRole('button', { name: /^Insights/ }).first().click()
await page.waitForTimeout(900)
const insights = await page.evaluate(() => ({
  title: document.querySelector('.page-title')?.textContent.trim(),
  cardTitles: [...document.querySelectorAll('.chart-title')].map((e) => e.textContent.trim()),
  np: document.querySelectorAll('.np').length,
  arcs: document.querySelectorAll('.ins-arc').length,
  upRows: document.querySelectorAll('.up-row').length,
  strips: document.querySelectorAll('.stats-strip').length,
}))
check('Insights still opens', insights.title === 'Insights', insights.title)
check('Now playing left Insights', insights.np === 0 && insights.arcs === 0, `np=${insights.np} arcs=${insights.arcs}`)
check('Coming up and Leaving GP left Insights', insights.upRows === 0, String(insights.upRows))
check('the week strip left Insights', insights.strips === 0, String(insights.strips))
check('Insights keeps its week chart', insights.cardTitles.some((t) => /Last 7 days/.test(t)), insights.cardTitles.join(', '))
await page.screenshot({ path: 'repro/out/insights-dark.png', fullPage: true })

/* --------------------------------------------------------------- 4. backlog */

await page.locator('.brand-btn, .brand').first().click()
await page.waitForTimeout(450)
await page.getByRole('button', { name: /^Backlog/ }).first().click()
await page.waitForTimeout(700)
const backlog = await page.evaluate(() => ({
  title: document.querySelector('.wl-title')?.textContent.trim(),
  sub: document.querySelector('.wl-sub')?.textContent.trim(),
  rows: document.querySelectorAll('.game-card').length,
}))
check('backlog list opens from the drawer', backlog.title === 'Backlog' && backlog.rows > 0, `${backlog.title} ${backlog.sub} ${backlog.rows} rows`)
await page.screenshot({ path: 'repro/out/backlog-dark.png', fullPage: true })

/* ----------------------------------------------------------------- 5. light */

await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
await page.locator('.wl-back').first().click()
await page.waitForTimeout(500)
// Back out of the list lands on whatever tab was under it, which is Insights by
// this point in the run. Go to Home explicitly, or the light shot is of the
// wrong page and would have quietly proved nothing.
await page.getByRole('button', { name: /^Home/ }).first().click()
await page.waitForTimeout(700)
const lightTitle = await page.evaluate(() => document.querySelector('.app-header-title')?.textContent.trim())
check('light shot is of Home', lightTitle === 'Home', lightTitle)
await page.screenshot({ path: 'repro/out/home-light.png', fullPage: true })
await page.locator('.brand-btn, .brand').first().click()
await page.waitForTimeout(450)
await page.screenshot({ path: 'repro/out/drawer-light.png', fullPage: true })

/* -------------------------------------------------------- 6. drawer editor */

await page.locator('.menu-fb', { hasText: 'Customize' }).click()
await page.waitForTimeout(600)
const editor = await page.evaluate(() => ({
  title: document.querySelector('.settings-hd-title')?.textContent.trim(),
  rows: document.querySelectorAll('.cz-row').length,
  toggles: document.querySelectorAll('.cz-row .cz-toggle').length,
  fixed: [...document.querySelectorAll('.cz-fixed')].map((e) => e.textContent.trim()),
  secs: [...document.querySelectorAll('.cz-sec')].map((e) => e.textContent.trim()),
  prev: document.querySelectorAll('.cz-prev').length,
}))
check('drawer editor is titled Drawer', editor.title === 'Drawer', editor.title)
check('drawer editor lists the same three groups', editor.secs.join('|') === 'Your games|Explore|Shelves', editor.secs.join('|'))
check('drawer editor row count', editor.rows === 12, String(editor.rows))
// The whole point of the split: this editor cannot change bar membership, so it
// has no switches at all. Every row states what it is instead.
check('drawer editor has no switches', editor.toggles === 0, String(editor.toggles))
// 11 of 12: Settings is an action rather than a destination with a kind, and it
// has nothing true to say in that column.
check('every drawer row states what it is', editor.fixed.filter(Boolean).length === 11, editor.fixed.join(', '))
check('the bar preview is not here', editor.prev === 0, String(editor.prev))
check('Insights reads as drawer only', editor.fixed.includes('drawer only'), editor.fixed.join(', '))
await page.screenshot({ path: 'repro/out/editor-drawer.png', fullPage: true })
await page.getByRole('button', { name: 'Back', exact: true }).click()
await page.waitForTimeout(500)

/* ----------------------------------------------------------- 7. bar editor */

// Reached from Settings, which is where a bar setting belongs. The drawer's own
// button goes to the drawer editor, one tap from the thing it edits.
//
// Settings is opened from the drawer's pinned footer now rather than a header
// gear. Two taps, and neither of them a scroll.
await page.locator('.brand-btn, .brand').first().click()
await page.waitForTimeout(450)
await page.locator('.menu-fb', { hasText: 'Settings' }).click()
await page.waitForTimeout(600)
await page.getByRole('button', { name: /Bottom bar/ }).first().click()
await page.waitForTimeout(600)
// Settings is still mounted underneath, so its heading matches the same selector.
// Read the LAST one, which is the page on top.
const barEd = await page.evaluate(() => ({
  title: [...document.querySelectorAll('.settings-hd-title')].pop()?.textContent.trim(),
  rows: [...document.querySelectorAll('.cz-row .cz-rl b')].map((e) => e.textContent.trim()),
  toggles: document.querySelectorAll('.cz-row .cz-toggle').length,
  prevTabs: [...document.querySelectorAll('.cz-prev .tabbar-btn')].map((e) => e.textContent.trim()),
  prevFixed: document.querySelector('.cz-prev .tabbar')
    ? getComputedStyle(document.querySelector('.cz-prev .tabbar')).position
    : null,
  secs: document.querySelectorAll('.cz-sec').length,
}))
check('bar editor is titled Bottom bar', barEd.title === 'Bottom bar', barEd.title)
// Five bar-eligible destinations, plus the Show labels row in the footer.
check('bar editor lists five tabs', barEd.rows.length === 6 && barEd.rows[5] === 'Show labels', barEd.rows.join(', '))
check('Insights is not offered for the bar', !barEd.rows.includes('Insights'), barEd.rows.join(', '))
check('bar editor has a switch per tab plus labels', barEd.toggles === 6, String(barEd.toggles))
check('bar editor has no group headings', barEd.secs === 0, String(barEd.secs))
check('preview shows the five tabs', barEd.prevTabs.join('|') === 'Home|Library|Activity|Discover|News', barEd.prevTabs.join('|'))
check('preview bar is not fixed to the window', barEd.prevFixed === 'static', barEd.prevFixed)
await page.screenshot({ path: 'repro/out/editor-bar.png', fullPage: true })

// The two orders are independent: moving a tab on the bar must not move it in
// the drawer. Drag News (last) above Library (second) and read both surfaces.
const rowBox = async (i) => (await page.locator('.cz-row').nth(i).boundingBox())
const newsRow = await rowBox(4)
const libRow = await rowBox(1)
await page.mouse.move(newsRow.x + 20, newsRow.y + newsRow.height / 2)
await page.mouse.down()
await page.mouse.move(libRow.x + 20, libRow.y + 4, { steps: 12 })
await page.mouse.up()
await page.waitForTimeout(500)
const afterDrag = await page.evaluate(() => ({
  rows: [...document.querySelectorAll('.cz-row .cz-rl b')].map((e) => e.textContent.trim()),
  prevTabs: [...document.querySelectorAll('.cz-prev .tabbar-btn')].map((e) => e.textContent.trim()),
  stored: JSON.parse(localStorage.getItem('gamedeck_nav_v2') || '{}'),
}))
check('drag reorders the bar', afterDrag.rows[1] === 'News', afterDrag.rows.join(', '))
check('the preview follows the drag', afterDrag.prevTabs[1] === 'News', afterDrag.prevTabs.join('|'))
check('the bar order is stored separately', Array.isArray(afterDrag.stored.bar) && afterDrag.stored.bar[1] === 'news', JSON.stringify(afterDrag.stored.bar))
check('the DRAWER order is untouched',
  afterDrag.stored.order.slice(0, 4).join('|') === 'home|library|activity|insights',
  afterDrag.stored.order.join('|'))
// Two settings pages are stacked here (Settings, then Bottom bar over it), so
// the back button has to be addressed by position rather than by name.
await page.locator('.settings-back').last().click()
await page.waitForTimeout(500)
await page.locator('.settings-back').last().click()
await page.waitForTimeout(500)

const liveBar = await page.evaluate(() => [...document.querySelectorAll('.tabbar-btn')].map((e) => e.textContent.trim()))
check('the real bar picked up the new order', liveBar[1] === 'News', liveBar.join('|'))

/* ---------------------------------------------------------------- verdict */

check('no page errors, console errors or failed requests', problems.length === 0, problems.slice(0, 4).join(' || '))

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
await browser.close()
process.exit(failed.length ? 1 : 0)
