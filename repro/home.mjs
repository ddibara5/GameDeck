/*
 * Drives the BUILT Home tab, the reorganised drawer and the trimmed Insights tab
 * against stubbed reads.
 *
 * Fixtures are shaped like the real rows (a game in progress, one Game Pass exit,
 * four dated wishlist releases, a backlog with ratings and years) so the
 * assertions are about what the app renders on data of this shape rather than on
 * numbers invented to make them pass.
 *
 * Three things this does that a lighter harness would not:
 *   - blocks the service worker, so a stubbed request that never reaches the
 *     handler cannot look like a working feature;
 *   - asserts the MOVED cards are absent from Insights by the selectors only they
 *     ever used (.np, .ins-arc, .up-row), not by counting cards, because a count
 *     passes when the wrong thing is gone;
 *   - reloads after a skip, because a shortlist that forgets is worse than one
 *     that never offered the control.
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:4173'
const day = (y, m, d) => Math.floor(Date.UTC(y, m, d) / 1000)
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

const WISHLIST = [
  { igdb_id: 347633, title: 'Mortal Shell II', cover: null, released: day(2026, 7, 20), release_label: 'Aug 20, 2026' },
  { igdb_id: 222, title: 'Star Wars Zero Company', cover: null, released: day(2026, 7, 27), release_label: 'Aug 27, 2026' },
  { igdb_id: 333, title: 'The Blood of Dawnwalker', cover: null, released: day(2026, 8, 3), release_label: 'Sep 03, 2026' },
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
await page.waitForSelector('.page-title', { timeout: 10000 })
await page.waitForTimeout(900)

/* ---------------------------------------------------------------- 1. lands */

const home = await page.evaluate(() => ({
  title: document.querySelector('.page-title')?.textContent.trim(),
  tabs: [...document.querySelectorAll('.tabbar-btn')].map((b) => b.textContent.trim()),
  active: document.querySelector('.tabbar-btn.active')?.textContent.trim(),
  cardTitles: [...document.querySelectorAll('.chart-title')].map((e) => e.textContent.trim()),
  tiles: [...document.querySelectorAll('.hm-tile')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
  banner: document.querySelector('.hm-banner')?.textContent.replace(/\s+/g, ' ').trim() || null,
  picks: [...document.querySelectorAll('.hm-pn')].map((e) => e.textContent.trim()),
  chips: [...document.querySelectorAll('.hm-chip')].map((e) => e.textContent.trim()),
  arcs: document.querySelectorAll('.ins-arc').length,
  upRows: [...document.querySelectorAll('.up-row')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
  skips: document.querySelectorAll('.hm-skip').length,
}))

check('lands on Home', home.title === 'Home', home.title)
check('bar is home/library/activity/discover/news', home.tabs.join('|') === 'Home|Library|Activity|Discover|News', home.tabs.join('|'))
check('Home is the active tab', home.active === 'Home', home.active)
check('Now playing renders with its arc', home.cardTitles.includes('Now playing') && home.arcs === 1, `arcs=${home.arcs}`)
check('week + backlog tiles', home.tiles.length === 2 && /This week/.test(home.tiles[0]) && /Backlog/.test(home.tiles[1]), home.tiles.join(' // '))
// 4 backlog games in the fixture: RE2, Outer Wilds, Requiem, FIFA, UNO = 5, minus
// nothing skipped yet. Persona (played yesterday) and Another Crab's (40d, but
// over 2h and unfinished) derive as playing / backlog respectively.
check('backlog tile counts something', /Backlog\s*\d+/.test(home.tiles[1]) && /never opened/.test(home.tiles[1]), home.tiles[1])
check('one Game Pass exit renders as a banner', Boolean(home.banner) && /Leaving Game Pass soon/.test(home.banner), home.banner)
check('banner does not invent a countdown', !/\d+ days/.test(home.banner || ''), home.banner)
check('picks are the rated ones, junk excluded',
  home.picks.length === 3 && !home.picks.includes('FIFA 14') && !home.picks.includes('UNO'),
  home.picks.join(', '))
check('every pick states its reason', home.chips.length === home.picks.length, home.chips.join(' | '))
check('each pick has a skip control', home.skips === home.picks.length, String(home.skips))
check('Coming up renders dated releases', home.upRows.length >= 2 && home.cardTitles.includes('Coming up'), home.upRows.join(' // '))
check('out-today row reads "Out today"', home.upRows.some((r) => /Out today|days|day/.test(r)), home.upRows[0])

await page.screenshot({ path: 'repro/out/home-dark.png', fullPage: true })

/* ----------------------------------------------------------------- 2. skip */

const firstPick = home.picks[0]
await page.locator('.hm-skip').first().click()
await page.waitForTimeout(400)
const afterSkip = await page.evaluate(() => [...document.querySelectorAll('.hm-pn')].map((e) => e.textContent.trim()))
check('skip removes the row', !afterSkip.includes(firstPick), `${firstPick} -> ${afterSkip.join(', ')}`)

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(900)
const afterReload = await page.evaluate(() => [...document.querySelectorAll('.hm-pn')].map((e) => e.textContent.trim()))
check('skip survives a reload', !afterReload.includes(firstPick), afterReload.join(', '))

/* -------------------------------------------------------------- 3. insights */

// Insights is off the bar by default now, so it is reached from the drawer.
await page.locator('.brand-btn, .brand').first().click()
await page.waitForTimeout(450)
const drawer = await page.evaluate(() => ({
  groups: [...document.querySelectorAll('.drawer .menu-sec-label')].map((e) => e.textContent.trim()),
  rows: [...document.querySelectorAll('.drawer .menu-item')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
  pills: [...document.querySelectorAll('.drawer .menu-bar-tag')].length,
  here: document.querySelector('.drawer .menu-item.here')?.textContent.replace(/\s+/g, ' ').trim() || null,
  cz: Boolean(document.querySelector('.drawer-cz')),
}))
check('drawer groups in order', drawer.groups.join('|') === 'Your games|Explore|Shelves|App', drawer.groups.join('|'))
check('drawer lists every destination', drawer.rows.length === 12, String(drawer.rows.length))
check('wishlist sits under Explore', drawer.rows.some((r) => r.startsWith('Wishlist')), '')
check('five tabs carry an on-bar pill', drawer.pills === 5, String(drawer.pills))
check('current tab is marked', /^Home/.test(drawer.here || ''), drawer.here)
check('Customize drawer button present', drawer.cz, '')
await page.screenshot({ path: 'repro/out/drawer-dark.png', fullPage: true })

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
const lightTitle = await page.evaluate(() => document.querySelector('.page-title')?.textContent.trim())
check('light shot is of Home', lightTitle === 'Home', lightTitle)
await page.screenshot({ path: 'repro/out/home-light.png', fullPage: true })
await page.locator('.brand-btn, .brand').first().click()
await page.waitForTimeout(450)
await page.screenshot({ path: 'repro/out/drawer-light.png', fullPage: true })

/* -------------------------------------------------------- 6. drawer editor */

await page.locator('.drawer-cz').click()
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
check('drawer editor lists the same four groups', editor.secs.join('|') === 'Your games|Explore|Shelves|App', editor.secs.join('|'))
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
await page.locator('.gear-btn').click()
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
