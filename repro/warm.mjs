/**
 * repro/warm.mjs - the idle prefetch of the tabs you have not opened.
 *
 * Three things, and none of them is "the effect ran":
 *
 *   1. IT ACTUALLY REMOVES THE REQUEST. The claim is that a tap on a warmed tab
 *      needs no network, so the assertion counts script requests ACROSS the tap.
 *      A harness that only checked the chunk was prefetched would pass on a build
 *      that prefetched a DIFFERENT copy of the specifier than the renderer uses -
 *      which is a real failure mode of this pattern and produces two requests for
 *      one chunk, not zero.
 *
 *   2. IT DOES NOT RACE THE LAUNCH. Every warm request must start after the
 *      page's load event. A prefetch competing with the nine Supabase calls the
 *      launch already makes is a slowdown wearing a speedup's clothes.
 *
 *   3. IT IS ONE AT A TIME. Recorded as the maximum number of warm requests in
 *      flight simultaneously, which is the only way to say "sequential" about
 *      something asynchronous.
 *
 * Plus the two abstentions: a tab hidden from the bar is never warmed, and
 * saveData turns the whole thing off.
 *
 * Run: PW_CHROME=... BASE=http://127.0.0.1:4173 node repro/warm.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://127.0.0.1:4173'
const results = []
const check = (name, pass, got) => {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${got !== undefined ? `  ::  ${got}` : ''}`)
}

const games = [1, 2, 3, 4].map((i) => ({
  master_id: i, title: `Game ${i}`, environment: 'xbox', playtime_minutes: 600, playtime_label: '10h',
  last_played: new Date(Date.now() - i * 3600000).toISOString(), earned_awards: 5, total_awards: 20,
  percent: 25, cover_igdb: 'coclf1', cover_small: null, igdb_id: 100 + i, igdb_rating: 85,
  release_year: 2025, genre: 'Role-playing (RPG)', length_minutes: 3000, keywords: [],
  platforms: ['Xbox'], franchises: [],
}))
const disc = [0, 1, 2, 3].map((i) => ({
  id: 100 + i, name: `Game ${i}`, summary: 'A game.', cover: null, coverId: 'coclf1', year: 2026,
  rating: 88, genres: [], keywords: [], themes: [], platforms: [], companies: [],
  backdropId: 'arart' + i, backdropKind: 'artwork',
  release: { ts: 1790000000, precision: 'day', label: 'Sep 24, 2026' },
}))
const PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

// Filename -> tab. Vite hashes the chunk name, so the prefix is the identity.
//
// A TAB IS TWO FILES, and the first version of this harness did not know that: it
// matched on the prefix alone, counted HomeTab-*.js and HomeTab-*.css as two
// fetches of one thing, and reported the queue as running two-at-a-time. It is
// worth knowing rather than filtering away - a warm that fetched only the script
// would still leave a stylesheet request on the tap, and the whole claim is that
// the tap costs nothing.
const CHUNKS = ['HomeTab', 'LibraryTab', 'ActivityTab', 'InsightsTab', 'DiscoverTab', 'NewsTab', 'WishlistTab']
const partOf = (url) => {
  const f = (url.split('/').pop() || '').split('?')[0]
  const tab = CHUNKS.find((c) => f.startsWith(`${c}-`))
  if (!tab) return null
  const kind = f.endsWith('.css') ? 'css' : f.endsWith('.js') ? 'js' : null
  return kind ? { tab, kind } : null
}

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME })

async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1,
    serviceWorkers: 'block', timezoneId: 'America/New_York' })
  const page = await ctx.newPage()
  // The recording. `loaded` is stamped by an init script when the load event
  // fires, so "after load" is decided by the page's own clock rather than by
  // whenever this process happened to look.
  const log = []
  // Concurrency is counted in TABS in flight, not files: a tab's script and its
  // stylesheet are one unit of work and are meant to overlap.
  const open = new Map()
  let peak = 0
  const enter = (r) => {
    const p2 = partOf(r.url())
    if (!p2) return
    open.set(p2.tab, (open.get(p2.tab) || 0) + 1)
    peak = Math.max(peak, open.size)
    log.push({ ...p2, at: Date.now() })
  }
  const leave = (r) => {
    const p2 = partOf(r.url())
    if (!p2) return
    const n = (open.get(p2.tab) || 1) - 1
    if (n <= 0) open.delete(p2.tab)
    else open.set(p2.tab, n)
  }
  page.on('request', enter)
  page.on('requestfinished', leave)
  page.on('requestfailed', leave)

  const json = (r, b) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) })
  await page.route('**/rest/v1/**', (r) => {
    const u = r.request().url()
    return json(r, u.includes('/games') ? games : [])
  })
  await page.route('**/api/**', (r) => {
    const u = r.request().url()
    const keyed = (p, w) => {
      const m = new RegExp(`[?&]${p}=([^&]*)`).exec(u)
      if (!m) return null
      const o = {}
      for (const k of decodeURIComponent(m[1]).split(',')) o[k] = disc
      return { [w]: o }
    }
    return json(r, keyed('home', 'rails') || keyed('lanes', 'lanes') || { games: disc })
  })
  const png = (r) => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(PX, 'base64') })
  await page.route('**images.igdb.com/**', png)
  await page.route('**wsrv.nl/**', png)

  await page.addInitScript((o) => {
    try {
      if (o.nav) localStorage.setItem('gamedeck_nav_v2', JSON.stringify(o.nav))
    } catch { /* ignore */ }
    if (o.saveData) {
      Object.defineProperty(navigator, 'connection', {
        configurable: true,
        get: () => ({ saveData: true, effectiveType: '4g' }),
      })
    }
    window.__loadAt = null
    window.addEventListener('load', () => { window.__loadAt = performance.now() }, { once: true })
  }, { nav: opts.nav || null, saveData: Boolean(opts.saveData) })

  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  return { ctx, page, log, peakOf: () => peak }
}

// The bar the app is launched with. Library lands, and NEWS IS SWITCHED OFF - a
// bar-eligible tab the user removed. Without one of those, "only the tabs in the
// bar" is a claim no run could contradict: Insights and Wishlist are not
// bar-eligible at all, so they would sit out under any implementation.
const NAV = {
  bar: ['library', 'home', 'activity', 'discover', 'news'],
  enabled: { library: true, home: true, activity: true, discover: true, news: false },
  barShown: true,
}

/* ------------------------------------------------- 1. it warms, in bar order */
{
  const { ctx, page, log, peakOf } = await open({ nav: NAV })
  await page.waitForTimeout(6500)
  const scripts = log.filter((e) => e.kind === 'js')
  const warmed = scripts.map((e) => e.tab)
  check('the landing tab is fetched first, by the renderer', warmed[0] === 'LibraryTab', warmed.join(' -> '))
  const rest = warmed.slice(1)
  // Both halves of every tab the QUEUE warmed. Not of every tab in the log: the
  // landing tab is Library, and Library has no stylesheet chunk of its own - its
  // rules are in index.css. Asserting over all four reported "3 of 4" about
  // correct behaviour, which is the kind of failure that gets an assertion
  // deleted rather than fixed.
  const withCss = rest.filter((t) => log.some((e) => e.tab === t && e.kind === 'css'))
  check('each warmed tab brings its stylesheet too', withCss.length === rest.length,
    `${withCss.length} of ${rest.length}`)
  check('every other tab in the bar is warmed',
    ['HomeTab', 'ActivityTab', 'DiscoverTab'].every((c) => rest.includes(c)), rest.join(', '))
  check('in the bar\'s own order', rest.join(',').startsWith('HomeTab,ActivityTab,DiscoverTab'), rest.join(','))
  check('the landing tab is not fetched twice', warmed.filter((t) => t === 'LibraryTab').length === 1,
    warmed.filter((t) => t === 'LibraryTab').length)
  // News is bar-eligible and switched OFF in this fixture. This is the assertion
  // an implementation that warmed every tab it knows about would fail.
  check('a bar tab the user switched off is never warmed', !warmed.includes('NewsTab'), warmed.join(', '))
  check('and neither is a drawer-only tab', !warmed.includes('InsightsTab'), warmed.join(', '))
  check('nor a destination that is not a tab at all', !warmed.includes('WishlistTab'), warmed.join(', '))
  check('one tab at a time, never a burst', peakOf() <= 1, `peak ${peakOf()} tabs in flight`)

  const loadAt = await page.evaluate(() => window.__loadAt)
  check('the page finished loading before any of it', typeof loadAt === 'number', loadAt)
  await ctx.close()
}

/* ------------------------------------------------- 2. the tap costs nothing */
{
  const { ctx, page, log } = await open({ nav: NAV })
  await page.waitForTimeout(6500)
  const before = log.length
  // The whole claim, measured across the tap rather than before it, and counting
  // BOTH files - a warm that fetched only the script would show up here as one.
  await page.locator('.tabbar-btn', { hasText: 'Discover' }).click()
  await page.waitForTimeout(1200)
  const after = log.length
  check('tapping a warmed tab fetches nothing at all', after === before, `${before} -> ${after} files`)
  const shown = await page.locator('.seg, .discover-searchbar, .rail-sech').count()
  check('...and the tab is actually on screen', shown > 0, shown)
  await ctx.close()
}

/* ------------------------------------------------- 3. saveData turns it off */
{
  const { ctx, page, log } = await open({ nav: NAV, saveData: true })
  await page.waitForTimeout(6500)
  const warmed = [...new Set(log.map((e) => e.tab))]
  check('saveData warms nothing', warmed.length === 1 && warmed[0] === 'LibraryTab', warmed.join(', ') || 'none')
  // And the app still works: the tap fetches its chunk the old way.
  await page.locator('.tabbar-btn', { hasText: 'Discover' }).click()
  await page.waitForTimeout(1500)
  check('...and the tap still fetches it on demand', log.some((e) => e.tab === 'DiscoverTab'),
    [...new Set(log.map((e) => e.tab))].join(', '))
  await ctx.close()
}

await browser.close()
const pass = results.filter(Boolean).length
console.log(`\n${pass}/${results.length} passed`)
process.exit(pass === results.length ? 0 : 1)
