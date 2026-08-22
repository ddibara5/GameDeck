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
  // The edition mismatch, copied from production. IGDB gives an edition its own
  // id, so the Game Pass row is 119402 while BOTH library rows carry 1942: an
  // id-only join calls this "not yours". Two rows on purpose, the same way the
  // real library carries it, so the most-played one has to win: the PSN copy has
  // the 1249 minutes and the Xbox copy has none. (The real PSN title spells the
  // separator with an en dash; normTitle strips every non-alphanumeric, so a
  // hyphen keys identically and is what the fixture uses.)
  { master_id: 8, title: 'The Witcher 3: Wild Hunt - Complete Edition', environment: 'psn', genre: 'Role-playing (RPG)', percent: 10, playtime_minutes: 1249, playtime_label: '20h 49m', earned_awards: 9, total_awards: 78, last_played: iso(300), igdb_id: 1942, igdb_rating: 92, release_year: 2015, length_minutes: 3000, cover_small: null, cover_igdb: 'co8', platforms: 'PlayStation' },
  { master_id: 9, title: 'The Witcher 3: Wild Hunt', environment: 'xbox', genre: 'Role-playing (RPG)', percent: 13, playtime_minutes: 0, playtime_label: '0m', earned_awards: 0, total_awards: 78, last_played: null, igdb_id: 1942, igdb_rating: 92, release_year: 2015, length_minutes: 3000, cover_small: null, cover_igdb: 'co9', platforms: 'Xbox' },
  // On Game Pass, in the library, never opened. Only reachable through the
  // title fallback below, and the row this card exists to print.
  { master_id: 10, title: 'A Game You Never Started', environment: 'xbox', genre: 'Adventure', percent: 0, playtime_minutes: 0, playtime_label: '0m', earned_awards: 0, total_awards: 20, last_played: null, igdb_id: 7001, igdb_rating: 80, release_year: 2022, length_minutes: 600, cover_small: null, cover_igdb: 'co10', platforms: 'Xbox' },
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
  // A LONG one, in the collapsed preview rather than behind the expand, because
  // the row clamps titles to one line now and a fixture of short names would
  // pass that assertion with text-overflow deleted. Its real full name, which is
  // what makes it long enough to overflow 225px of title column.
  { igdb_id: 777, title: "Assassin's Creed Black Flag Resynced", cover: null, year: 2026, note: null, created_at: iso(110), released: relDay(-8), date_precision: 'day', release_label: '8 days ago' },
  { igdb_id: 888, title: 'The Relic: First Guardian', cover: null, year: 2026, note: null, created_at: iso(105), released: relDay(-21), date_precision: 'day', release_label: '21 days ago' },
  { igdb_id: 999, title: 'Duskfade', cover: null, year: 2026, note: null, created_at: iso(102), released: relDay(-43), date_precision: 'day', release_label: '43 days ago' },
  // Four rows each card must REJECT, and each rejects for a different reason.
  // A wishlist row you have since bought is not news: this one's igdb_id is the
  // one on Another Crab's Treasure in GAMES, so only the ownership filter keeps
  // it out of Recently released.
  { igdb_id: 217590, title: "Another Crab's Treasure", cover: null, year: 2024, note: null, created_at: iso(200), released: relDay(-5), date_precision: 'day', release_label: '5 days ago' },
  { igdb_id: 1212, title: 'A Long Gone Game', cover: null, year: 2025, note: null, created_at: iso(300), released: relDay(-200), date_precision: 'day', release_label: 'last year' },
  { igdb_id: 444, title: 'A Quarter-Dated Game', cover: null, year: 2027, note: null, created_at: iso(30), released: day(2027, 11, 31), date_precision: 'quarter', release_label: 'Q4 2027' },
  { igdb_id: 555, title: 'A Far Future Game', cover: null, year: 2027, note: null, created_at: iso(20), released: relDay(400), date_precision: 'day', release_label: 'next year' },
]
// Four rows, sized so the RATING GATE is what excludes the 58 rather than the
// four-row cap. That distinction is the whole point and the previous fixture got
// it wrong: with five candidates the 58 sorts last among the catalogue rows and
// `slice(0, RELEASE_MAX)` drops it whether or not GP_MIN_RATING exists, so the
// assertion passed against a deleted gate. Here the ungated pool is exactly four
// and every one of them would be on screen, so the 58's absence has one cause.
//
// The other two halves of the rule: 217590 is Another Crab's Treasure, matched
// to the library by id, and 119402 is the Witcher edition mismatch, matched only
// by title. 6002 at 71 clears the floor of 70 by one and is the catalogue row
// the sheet assertions tap.
const GAMEPASS_LEAVING = [
  { igdb_id: 217590, name: "Another Crab's Treasure", cover: null, year: 2024, rating: 82 },
  { igdb_id: 119402, name: 'The Witcher 3: Wild Hunt - Complete Edition', cover: null, year: 2016, rating: 92 },
  // The base game AND its edition, both leaving, which the catalog sync says can
  // happen and which now both resolve to the same library row. Costs nothing in
  // the arithmetic above because it is dropped before bucketing.
  { igdb_id: 1942, name: 'The Witcher 3: Wild Hunt', cover: null, year: 2015, rating: 92 },
  { igdb_id: 6002, name: 'A Just Good Enough Exit', cover: null, year: 2021, rating: 71 },
  { igdb_id: 6003, name: 'A Poorly Rated Exit', cover: null, year: 2019, rating: 58 },
]
// The second window, loaded later in this run. One title you own and never
// opened, one the gate must reject, and nothing else: the ungated pool is two,
// so this is a SECOND state in which the gate is the only thing that can be
// keeping the 58 off the page.
const GAMEPASS_NEVER_STARTED = [
  { igdb_id: 7001, name: 'A Game You Never Started', cover: null, year: 2022, rating: 80 },
  { igdb_id: 6003, name: 'A Poorly Rated Exit', cover: null, year: 2019, rating: 58 },
]
let gpRoute = GAMEPASS_LEAVING

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
  if (u.includes('/gamepass')) return json(route, gpRoute)
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
  // The large title came back on 22 Aug and took the heading with it, so the
  // header copy is a stand-in again. Three halves to that, all asserted:
  // exactly one h1, it is the large title, and the header's copy is NOT an h1.
  h1s: [...document.querySelectorAll('h1')].map((e) => e.textContent.trim()),
  h1IsPageTitle: document.querySelector('h1.page-title') !== null,
  headerCopyIsHeading: document.querySelector('.app-header h1') !== null,
  // Rendered ONCE, by App, above <main> - not once per tab, which is the shape
  // that let one of eight copies drift out of step.
  pageTitles: document.querySelectorAll('.page-title').length,
  standin: (() => {
    const e = document.querySelector('.app-header-title')
    if (!e) return null
    return { opacity: getComputedStyle(e).opacity, hidden: e.getAttribute('aria-hidden') }
  })(),
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
  gpRows: [...document.querySelectorAll('[data-card="leaving_gp"] .up-row')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
  gpDisabled: [...document.querySelectorAll('[data-card="leaving_gp"] .up-row')].map((e) => e.disabled),
  gpExpand: document.querySelector('[data-card="leaving_gp"] .hm-expand')?.textContent.replace(/\s+/g, ' ').trim() || null,
  banners: document.querySelectorAll('.hm-banner').length,
  arcs: document.querySelectorAll('.ins-arc').length,
  // Scoped to the two release cards. Leaving Game Pass uses .up-row too since
  // 21 Aug, so an unscoped count silently became a sum of three cards.
  upRows: [...document.querySelectorAll('[data-card="coming_up"] .up-row, [data-card="recently_released"] .up-row')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
  cuRows: [...document.querySelectorAll('[data-card="coming_up"] .up-row')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
  rrRows: [...document.querySelectorAll('[data-card="recently_released"] .up-row')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
  // Read STRUCTURALLY, from the element that holds the number, rather than by
  // regex off the row's text. The covers put a placeholder letter at the front
  // of that text on a row with no art, which broke a /^(\d+)ago/ anchored to it.
  rrDays: [...document.querySelectorAll('[data-card="recently_released"] .up-row')].map((e) => ({
    n: e.querySelector('.up-n')?.textContent.trim(),
    title: e.querySelector('.up-tt')?.textContent.trim(),
  })),
  // Art first on both release cards, at the size Now playing's is halved to.
  art: ['coming_up', 'recently_released'].map((k) => {
    const rows = [...document.querySelectorAll(`[data-card="${k}"] .up-row`)]
    const first = rows[0] && rows[0].firstElementChild
    const box = rows[0] && rows[0].querySelector('.up-cov')?.getBoundingClientRect()
    return {
      card: k,
      rows: rows.length,
      covers: rows.filter((r) => r.querySelector('.up-cov')).length,
      firstIsCover: Boolean(first && first.classList.contains('up-cov')),
      size: box ? `${Math.round(box.width)}x${Math.round(box.height)}` : null,
      heights: rows.map((r) => Math.round(r.getBoundingClientRect().height)),
      // A clamped title overflows its own box rather than wrapping the row.
      clamped: rows.some((r) => {
        const t = r.querySelector('.up-tt')
        return t && t.scrollWidth > t.clientWidth
      }),
    }
  }),
  expands: [...document.querySelectorAll('[data-card="coming_up"] .hm-expand, [data-card="recently_released"] .hm-expand')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
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
// The Home mark is HomeDeck's, path for path. Asserted as the exact strings
// rather than "has three paths", because the decision here is not "a house with
// a door", it is "the same house the other app opens on". A redraw that still
// has three paths is exactly the drift this is here to catch.
const HD_HOUSE = [
  'M3.4 10.4 12 3.6l8.6 6.8',
  'M5.4 9.4v9.2a1.8 1.8 0 0 0 1.8 1.8h9.6a1.8 1.8 0 0 0 1.8-1.8V9.4',
  'M9.8 20.4v-5.2h4.4v5.2',
]
const house = await page.evaluate(() => {
  const svg = document.querySelector('.tabbar-btn .tabbar-icon svg')
  return {
    ds: [...svg.querySelectorAll('path')].map((e) => e.getAttribute('d')),
    // The drawer and the customize editor clone the same element, so if they
    // ever stop doing that this count moves and the two surfaces have drifted.
    stroke: svg.getAttribute('stroke-width') || svg.getAttribute('strokeWidth'),
  }
})
check('the Home mark is HomeDeck\'s, path for path', house.ds.join(' | ') === HD_HOUSE.join(' | '), house.ds.join(' | '))
check('it is drawn at the same 1.8 weight', house.stroke === '1.8', String(house.stroke))
check('Home is the active tab', home.active === 'Home', home.active)

/* ------------------------------------------------- the header carries it */

// The large title is the heading again. Two live copies of the same words would
// be read out twice, so the header's is a span and is aria-hidden while it is
// invisible - that pairing is the assertion, not the h1 count on its own.
check(
  'exactly one heading, and it is the large title',
  home.h1s.length === 1 && home.h1IsPageTitle && !home.headerCopyIsHeading,
  `${home.h1s.join('|')}  headerIsH1=${home.headerCopyIsHeading}`
)
check('the heading is the tab name', home.h1s[0] === 'Home', home.h1s[0])
// One copy, from App, rather than one per tab.
check('the large title is rendered exactly once', home.pageTitles === 1, String(home.pageTitles))
check(
  'and the header copy is invisible and silent at the top of the page',
  home.standin && home.standin.opacity === '0' && home.standin.hidden === 'true',
  JSON.stringify(home.standin)
)
// The one part the header cannot carry. On Home it is the date.
check('the subtitle survives', /^[A-Z][a-z]+day, /.test(home.subtitle || ''), home.subtitle)
// The large title is back above the first card, so this is deliberately NOT the
// 190 it was: that number locked the title being gone. 218 before the chips came
// off, 210 after, 166 with the title in the header, and back around 250 now that
// the 34px copy and its subtitle sit above the fold again. The assertion that
// still means something is that the header itself did not grow.
check('the first card clears the title block', home.firstCardTop !== null && home.firstCardTop < 290, String(home.firstCardTop))
check('and the header is still 44px', home.headerH === 44, `${home.headerH}px`)
check('Now playing renders with its arc', home.cardTitles.includes('Now playing') && home.arcs === 1, `arcs=${home.arcs}`)
// One tile left in the catalog, so the run is a run of one and takes the whole
// width. Asserted as a COLUMN COUNT rather than a pixel width: a half-width tile
// in a two-column grid and a full-width one in a one-column grid can measure the
// same on a narrow phone, and the rule is about the grid, not the pixels.
check('This week is the only tile', home.tiles.length === 1 && /This week/.test(home.tiles[0]), home.tiles.join(' // '))
check('a solo tile takes the full width', home.soloGrids === 1 && home.gridCols === 1, `solo=${home.soloGrids} cols=${home.gridCols}`)

/* --------------------------------------------- the week tile's seven bars */

// The fixture logs 1, 2, 4 and 6 days ago, so today is empty, and days 3 and 5
// are empty but PAST. That is the distinction worth asserting: a zero-height bar
// means two different things depending on whether the day is over, and the two
// collapsing into each other is the failure nobody would notice by eye.
const bars = await page.evaluate(() => {
  const peak = Math.max(...[...document.querySelectorAll('.hm-bfill')].map((e) => parseFloat(e.style.height) || 0))
  return {
    n: document.querySelectorAll('.hm-bar').length,
    peaks: document.querySelectorAll('.hm-bfill.peak').length,
    peakIsTallest: [...document.querySelectorAll('.hm-bfill.peak')].every((e) => (parseFloat(e.style.height) || 0) === peak),
    zeros: document.querySelectorAll('.hm-bfill.zero').length,
    todayEmpty: document.querySelectorAll('.hm-bfill.today-empty').length,
    // The last bar is today, and it must be the one carrying today-empty.
    lastIsToday: document.querySelector('.hm-bar:last-child')?.classList.contains('today'),
    hidden: document.querySelector('.hm-bars')?.getAttribute('aria-hidden'),
    // Bars sit inside the tile's own button; the whole tile is the tap target.
    inTile: document.querySelectorAll('.hm-tile .hm-bars').length,
  }
})
check('seven bars, one per day', bars.n === 7, String(bars.n))
check('exactly one peak, and it is the tallest', bars.peaks === 1 && bars.peakIsTallest, `${bars.peaks} peak(s)`)
// Two past days with nothing on them. If today ever got counted here, this reads 3.
check('a past day with nothing is a stub', bars.zeros === 2, String(bars.zeros))
check('today with nothing is not a stub', bars.todayEmpty === 1 && bars.lastIsToday, `todayEmpty=${bars.todayEmpty} last=${bars.lastIsToday}`)
check('the chart is hidden from the a11y tree', bars.hidden === 'true', String(bars.hidden))
check('the chart lives inside the tile button', bars.inTile === 1, String(bars.inTile))
/* ------------------------------------------------- Leaving Game Pass */

// The card is the whole leaving window now, not just games you have started, so
// the single-title banner is gone with the reason it existed.
check('the single-title banner is retired', home.banners === 0, String(home.banners))
check('two rows previewed of three', home.gpRows.length === 2 && /Show 1 more/.test(home.gpExpand || ''), `${home.gpRows.length} // ${home.gpExpand}`)
// THE EDITION MISMATCH. The Game Pass row is igdb 119402 and the library rows
// are 1942, so an id-only join renders this as a catalogue row reading
// "2016 · 92 rated" and offers to wishlist a game with 20 hours on it. Asserting
// the playtime rather than just the title is what makes this a real check: the
// title alone would appear either way.
check('an edition mismatch still counts as yours', /Witcher/.test(home.gpRows[0] || '') && /20h 49m in/.test(home.gpRows[0] || ''), home.gpRows[0])
// And the most-played copy won. Both library rows are 1942; the Xbox one has no
// playtime, so a first-wins map would print "0m in" here.
check('the copy with the hours is the one shown', !/0m in/.test(home.gpRows[0] || ''), home.gpRows[0])
check('the id match is still yours too', /Another Crab/.test(home.gpRows[1] || '') && /15h 39m in/.test(home.gpRows[1] || ''), home.gpRows[1])
// Every row opens something now: yours the owned detail, a catalogue row the
// discover sheet. Nothing on this card is inert.
check('no row is inert any more', home.gpDisabled.length === 2 && home.gpDisabled.every((d) => d === false), JSON.stringify(home.gpDisabled))
check('no row repeats "Leaving soon"', !home.gpRows.some((r) => /Leaving soon/.test(r)), home.gpRows.join(' // '))
check('Game Pass exits invent no countdown', !home.gpRows.some((r) => /\d+ days/.test(r)), home.gpRows.join(' // '))

// The gate, which is the whole reason the fixture carries a 58, and it only
// shows at full expansion. The ungated pool here is exactly four and the cap is
// four, so nothing but GP_MIN_RATING can be keeping this row off the page.
const GP_EXPAND = '[data-card="leaving_gp"] .hm-expand'
await page.click(GP_EXPAND)
const gpOpen = await page.evaluate(() => ({
  rows: [...document.querySelectorAll('[data-card="leaving_gp"] .up-row')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
  label: document.querySelector('[data-card="leaving_gp"] .hm-expand')?.textContent.replace(/\s+/g, ' ').trim() || null,
}))
check('expanding Leaving Game Pass shows all three', gpOpen.rows.length === 3, String(gpOpen.rows.length))
check('the 58 never appears, at any expansion', !gpOpen.rows.some((r) => /Poorly Rated/.test(r)), gpOpen.rows.join(' // '))
check('the last row is the 71, one over the floor', /Just Good Enough/.test(gpOpen.rows[2] || ''), gpOpen.rows[2])
// Two catalogue entries (base 1942 and edition 119402), one library row, and so
// exactly one row here. Asserted with the card OPEN, where a duplicate would
// have somewhere to go.
check('a base game and its edition do not both print', gpOpen.rows.filter((r) => /Witcher/.test(r)).length === 1, gpOpen.rows.join(' // '))
check('a catalogue row states year and rating', /2021 · 71 rated/.test(gpOpen.rows[2] || ''), gpOpen.rows[2])
check('its expand turns into Show less too', /Show less/.test(gpOpen.label || ''), gpOpen.label)
await page.locator('[data-card="leaving_gp"]').screenshot({ path: 'repro/out/leaving-gp-open.png' })

// Tapping the catalogue row. It is not in the library, so the surface is the
// DISCOVER sheet, the same one News and Discover open for an IGDB game, and the
// assertion is about which sheet arrived rather than just that one did: a
// wishlist heart and no status picker.
await page.locator('[data-card="leaving_gp"] .up-row').nth(2).click()
await page.waitForTimeout(700)
const gpSheet = await page.evaluate(() => {
  const el = document.querySelector('.modal-sheet')
  return {
    open: Boolean(el),
    text: el ? el.textContent.replace(/\s+/g, ' ').trim().slice(0, 120) : null,
    wish: document.querySelectorAll('.modal-sheet .wish-action').length,
    status: document.querySelectorAll('.modal-sheet .status-hint').length,
    // Ask AI and More like this navigate within Discover, and Home cannot route
    // there, so the heart should be the only control in the row.
    actions: document.querySelectorAll('.modal-sheet .discover-action').length,
  }
})
check('a catalogue row opens a sheet', gpSheet.open, gpSheet.text)
check('the sheet is for the row that was tapped', /Just Good Enough/.test(gpSheet.text || ''), gpSheet.text)
check('it is the discover sheet, not the owned one', gpSheet.wish === 1 && gpSheet.status === 0, `wish=${gpSheet.wish} status=${gpSheet.status}`)
check('the heart is its only control', gpSheet.actions === 1, String(gpSheet.actions))
await page.screenshot({ path: 'repro/out/leaving-gp-sheet.png' })
await page.locator('.modal-backdrop').click({ position: { x: 8, y: 8 } })
await page.waitForTimeout(700)
check('the Game Pass sheet closes back to Home', (await page.locator('.modal-backdrop').count()) === 0, 'backdrop')
await page.click(GP_EXPAND)

// A SECOND leaving window, because one fixture cannot hold both of the rules
// this card now runs. Here the only title you own is one you never opened, and
// the ungated pool is two rows against a cap of four, so the 58's absence is
// again attributable to the gate and nothing else.
//
// "0m in · 0% done" is what the row would say without its own branch, which is a
// worse sentence than the one fact worth printing: it is already yours, you
// never started it, and it goes this week. Under the OLD rule it printed nothing
// at all, because a game you own with no playtime fell through both buckets.
gpRoute = GAMEPASS_NEVER_STARTED
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(400)
const gpNever = await page.evaluate(() => ({
  rows: [...document.querySelectorAll('[data-card="leaving_gp"] .up-row')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
  expand: document.querySelectorAll('[data-card="leaving_gp"] .hm-expand').length,
}))
check('a game you own and never opened is still yours', gpNever.rows.length === 1 && /Never Started/.test(gpNever.rows[0] || ''), gpNever.rows.join(' // '))
check('it says so instead of "0m in"', /never started/i.test(gpNever.rows[0] || '') && !/0m in/.test(gpNever.rows[0] || ''), gpNever.rows[0])
check('the 58 is gated out of this window too', !gpNever.rows.some((r) => /Poorly Rated/.test(r)), gpNever.rows.join(' // '))
check('one row needs no expand', gpNever.expand === 0, String(gpNever.expand))
gpRoute = GAMEPASS_LEAVING
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(400)
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

// The two release cards only. Leaving Game Pass has its own expand and its own
// assertions; sweeping every .hm-expand on the page would toggle all three and
// make the row counts below meaningless.
const RELEASE_EXPANDS = '[data-card="coming_up"] .hm-expand, [data-card="recently_released"] .hm-expand'
const expandAll = async () => {
  const n = await page.locator(RELEASE_EXPANDS).count()
  for (let i = 0; i < n; i++) await page.locator(RELEASE_EXPANDS).nth(i).click()
  await page.waitForTimeout(350)
}
await expandAll()
const opened = await page.evaluate(() => ({
  cu: document.querySelectorAll('[data-card="coming_up"] .up-row').length,
  rr: document.querySelectorAll('[data-card="recently_released"] .up-row').length,
  labels: [...document.querySelectorAll('[data-card="coming_up"] .hm-expand, [data-card="recently_released"] .hm-expand')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
}))
check('expanding shows all four in each', opened.cu === 4 && opened.rr === 4, `cu=${opened.cu} rr=${opened.rr}`)
check('the expand turns into Show less', opened.labels.every((t) => /Show less/.test(t)), opened.labels.join(' | '))

/* ------------------------------------------------------- the row covers */

// Art on every row of both release cards, and FIRST on the row, which is where
// Now playing, the Wishlist rows and the Library all put theirs. A cover beside
// the countdown instead would cost the same 39px of title column and be the only
// row in the app whose art is not first.
for (const a of home.art) {
  check(`${a.card}: every row carries art`, a.covers === a.rows && a.rows > 0, `${a.covers} of ${a.rows}`)
  check(`${a.card}: the art is first on the row`, a.firstIsCover, a.firstIsCover ? 'first' : 'not first')
  check(`${a.card}: 28x37, half of Now playing`, a.size === '28x37', String(a.size))
  // The whole point of clamping: one height for every row. Asserted as a SET of
  // one rather than a number, so it survives a type change that moves the row.
  check(`${a.card}: every row is the same height`, new Set(a.heights).size === 1, a.heights.join(' / '))
}
// And the clamp is really clamping: at 225px of title column, at least one of
// the fixture titles must be overflowing its own box rather than wrapping the
// row. Without text-overflow this reads false and the heights above go ragged.
check('a long title is ellipsised, not wrapped', home.art.some((a) => a.clamped), JSON.stringify(home.art.map((a) => a.clamped)))
await expandAll()
const reclosed = await page.evaluate(() => document.querySelectorAll('[data-card="coming_up"] .up-row, [data-card="recently_released"] .up-row').length)
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
// The WHOLE heading is the target now, not the 34px square at the end of it, so
// the measurement is the row against the card rather than the mark against a
// thumb. The chevron is a span inside it: two buttons in one heading would be
// two tab stops to the same place.
const head = await page.evaluate(() => {
  const card = document.querySelector('[data-card="coming_up"]')
  const btn = card.querySelector('.hm-head-btn')
  const cs = getComputedStyle(card)
  const inner =
    card.getBoundingClientRect().width -
    parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) -
    parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth)
  const b = btn.getBoundingClientRect()
  return { inner: Math.round(inner), w: Math.round(b.width), h: Math.round(b.height) }
})
// Measured against the card's own content box rather than a number, so it
// survives a padding change instead of having to be edited by one.
check('the heading spans the whole card', head.w === head.inner, `${head.w} of ${head.inner}`)
check('and it is a real tap target', head.h >= 30, `${head.h}px tall`)
check('the chevron is not a second button', (await page.locator('[data-card="coming_up"] .hm-head button').count()) === 1, 'buttons in the heading')
// Voice control says what it sees. An aria-label of "open your wishlist" over a
// heading that reads "Coming up" is a control you cannot ask for by name.
const headName = await page.locator('[data-card="coming_up"] .hm-head-btn').getAttribute('aria-label')
check('the accessible name contains the visible heading', /^Coming up,/.test(headName || ''), headName)
// Clicked in the MIDDLE of the bar, which is the part that used to do nothing:
// Playwright targets the element centre, and the centre of this row is the gap
// between the heading text and the chevron.
await page.locator('[data-card="coming_up"] .hm-head-btn').click()
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

// The SECOND chevron, on Recently released, and the whole reason this page
// exists. It used to open the same Wishlist as the one above, where its rows sit
// in the Out now section, which sorts BELOW every future month, quarter and year.
await page.locator('[data-card="recently_released"] .hm-head-btn').click()
await page.waitForTimeout(800)
const out = await page.evaluate(() => ({
  title: document.querySelector('.wl-title')?.textContent.trim(),
  sub: document.querySelector('.wl-sub')?.textContent.trim(),
  rows: [...document.querySelectorAll('.wl-rt')].map((e) => e.textContent.trim()),
  chips: [...document.querySelectorAll('.wl-chip')].map((e) => e.textContent.trim()),
  bands: [...document.querySelectorAll('.wl-sech-l')].map((e) => e.textContent.trim()),
  counts: [...document.querySelectorAll('.wl-sech-c')].map((e) => Number(e.textContent.trim())),
  // Countdown cards over a list where nothing is upcoming.
  nextUp: document.querySelectorAll('.wl-next').length,
  sortLabels: [...document.querySelectorAll('.wl-sort-b')].map((e) => e.textContent.trim()),
}))
check('the second chevron opens Out now, not the Wishlist', out.title === 'Out now', `${out.title} / ${out.sub}`)
// Six of the twelve fixture rows have released: the day-0 game, three inside the
// last month, one at 43 days and one at 200. The four future rows and the owned
// one are absent, and the owned one is absent for the reason the Wishlist page
// already drops it rather than a rule invented here.
check('it lists every released row and nothing else', out.rows.length === 6, `${out.rows.length}: ${out.rows.join(' // ')}`)
check('the subtitle counts them and says what they are', /6 wishlisted games you don't own yet/.test(out.sub || ''), out.sub)
check('an upcoming row is not here', !out.rows.some((r) => /Star Wars Zero Company|Far Future|Quarter-Dated/.test(r)), out.rows.join(' // '))
check('the game you already own is not here either', !out.rows.some((r) => /Another Crab/.test(r)), out.rows.join(' // '))
// Newest first, which is the opposite of the wishlist and the reason this is its
// own section builder rather than a reverse() of the other one.
check('newest first', /Out Today/.test(out.rows[0] || '') && /Long Gone/.test(out.rows[out.rows.length - 1] || ''), `${out.rows[0]} ... ${out.rows[out.rows.length - 1]}`)
// The fault this page would have shipped with: every row is released, so the
// wishlist's "Out now" chip would repeat the section heading on all six lines.
check('no chip repeats the heading', !out.chips.some((c) => /^Out now$/.test(c)), out.chips.join(' // '))
check('the chips carry recency instead', /Today|day ago|days ago/.test(out.chips[0] || ''), out.chips.join(' // '))
// The card and the page it opens must not disagree about the same game. They
// would if either counted elapsed milliseconds instead of calendar days: a game
// released this morning is 0.8 of a day old, so one surface rounds it to 1 and
// the other floors it to 0. Both go through daysBetween now, and this is the
// assertion that keeps them there.
const cardDays = (home.rrDays.find((r) => /Mortal Shell II/.test(r.title)) || {}).n
const pageDays = (out.chips[out.rows.findIndex((r) => /Mortal Shell II/.test(r))] || '').match(/^(\d+) day/)
check('the card and the page count the same days', cardDays && pageDays && cardDays === pageDays[1], `card=${cardDays} page=${pageDays && pageDays[1]}`)
// Day 0 is Coming up's, which renders it as "Out today", so the CARD starts at
// one day ago. The page does not: a game that came out this morning is out now.
// One deliberate row of difference between a card and its own destination.
check('the page carries the day-0 game the card does not', out.rows.some((r) => /Out Today/.test(r)) && !home.rrRows.some((r) => /Out Today/.test(r)), out.rows[0])
// Bands, not one section per month: the label is asserted for the current month
// only, because every other band depends on the day the harness runs.
check('the first band is This month', out.bands[0] === 'This month', out.bands.join(' | '))
check('the bands account for every row', out.counts.reduce((a, b) => a + b, 0) === 6, out.counts.join('+'))
check('no countdown strip over a released list', out.nextUp === 0, String(out.nextUp))
check('the first sort reads Released here', out.sortLabels[0] === 'Released', out.sortLabels.join(' | '))
await page.screenshot({ path: 'repro/out/outnow-from-home.png', fullPage: true })
// The grid badge used to read "Owned" on a released row, which is the one thing
// a row that survived reconciliation cannot be.
await page.locator('.wl-dbtn').nth(1).click()
await page.waitForTimeout(400)
const badges = await page.evaluate(() => [...document.querySelectorAll('.wl-gbadge')].map((e) => e.textContent.trim()))
check('no grid badge claims a wishlisted game is Owned', badges.length === 6 && !badges.some((b) => /Owned/.test(b)), badges.join(' // '))
await page.locator('.wl-dbtn').first().click()
await page.waitForTimeout(300)
await page.locator('.wl-back').first().click()
await page.waitForTimeout(700)
const backHome2 = await page.evaluate(() => ({
  title: document.querySelector('.app-header-title')?.textContent.trim(),
  wl: document.querySelectorAll('.wl-page').length,
}))
check('back from Out now returns to Home', backHome2.title === 'Home' && backHome2.wl === 0, JSON.stringify(backHome2))

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
// The pill came off on 21 Aug. Asserted as ZERO rather than deleted, because
// "we took it out" is a decision and a deleted assertion defends nothing: the
// selector it queries is the one the markup used, so a revert fails here.
check('no on-bar pill anywhere in the drawer', drawer.pills === 0, String(drawer.pills))
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
  title: document.querySelector('.app-header-title')?.textContent.trim(),
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
// The bar's inactive label in LIGHT was the one thing on this screen below its
// own dark-mode legibility: 5.01:1 measured off the rendered pixels against
// 6.6:1 for the same label in dark. This computes against --bg rather than the
// composited backdrop, which the bar frosts and cannot be read from script, so
// it reads LOW against the real number (7.22 here, 7.62 off the pixels), which
// is the right direction for a floor to be wrong in. And it is a THRESHOLD: it
// survives a palette tweak, where an equality would just have to be edited.
const barInk = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.tabbar-btn')].find((e) => !e.classList.contains('active'))
  const rgb = (v) => v.match(/\d+/g).map(Number)
  const lum = (c) =>
    0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2])
  function ch(v) {
    v /= 255
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  const a = lum(rgb(getComputedStyle(btn).color))
  const b = lum(rgb(getComputedStyle(document.body).backgroundColor))
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
})
check('the light bar label clears 7:1', barInk >= 7, String(barInk))
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
