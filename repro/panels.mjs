/**
 * repro/panels.mjs - the canvas lists and Activity day groups, against the
 * BUILT app.
 *
 * Two claims, and neither is "the class is there". Both are about the COMPOSED
 * result: the pixel a reader actually sees under the type, and the gap a reader
 * actually sees between two blocks. Every number below differs from the value
 * written in the stylesheet, which is the reason the CSS is not the assertion.
 *
 * Run against BOTH builds. Against the previous build, the canvas checks fail
 * because each homogeneous list still carries an opaque rounded outer slab.
 *
 * Run: PW_CHROME=... BASE=http://127.0.0.1:4173 node repro/panels.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://127.0.0.1:4173'
const results = []
const check = (name, pass, got) => {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${got !== undefined ? `  ::  ${got}` : ''}`)
}
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol

const NAMES = ['Persona 5 Royal', 'Kristala', 'Crimson Desert', 'Mistfall Hunter', 'Where Winds Meet', 'Beast of Reincarnation']
const games = NAMES.map((title, i) => ({
  master_id: i + 1, title, environment: 'xbox', playtime_minutes: 600 + i * 90, playtime_label: '10h',
  last_played: new Date(Date.now() - i * 3600000 * 8).toISOString(), earned_awards: 5, total_awards: 20,
  percent: 25, cover_igdb: null, cover_small: null, igdb_id: 100 + i, igdb_rating: 85, release_year: 2025,
  genre: 'Role-playing (RPG)', length_minutes: 3000, keywords: ['soulslike', 'open world'], platforms: ['Xbox'],
}))
// Five days, one row each, which is what the real feed looks like: 11 of Dave's
// 12 day groups hold exactly one row.
const acts = [
  ['2026-08-21', 220, 1, 34, 23], ['2026-08-20', 84, 0, 33, 22], ['2026-08-18', 65, 1, 33, 22],
  ['2026-08-17', 98, 0, 31, 21], ['2026-08-16', 377, 5, 31, 21],
].map(([event_date, minutes_delta, achievements_delta, percent_after, earned_awards_after]) => ({
  master_id: 1, title: 'Persona 5 Royal', environment: 'xbox', event_date, minutes_delta,
  achievements_delta, percent_after, earned_awards_after, total_awards: 52, cover_small: null,
  playtime_minutes_after: 2000, last_played: event_date + 'T20:00:00Z', is_new: false,
}))
const disc = ['Mortal Shell II', 'Duskfade', 'Code Violet', 'Onimusha: Way of the Sword', 'Control Resonant', 'Aniimo'].map((name, i) => ({
  id: 900 + i, name, summary: 'A game.', cover: null, coverId: null, year: 2026, rating: 88 - i,
  genres: ['Role-playing (RPG)'], keywords: ['soulslike'], themes: ['Action'],
  platforms: ['Series X|S', 'PS5'], companies: [], release: { ts: 1790000000, precision: 'day', label: 'Sep 24, 2026' },
}))

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, serviceWorkers: 'block', timezoneId: 'America/New_York' })
const page = await ctx.newPage()
const problems = []
page.on('pageerror', (e) => problems.push('pageerror :: ' + e.message))
const json = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
await page.route('**/rest/v1/**', (r) => {
  const u = r.request().url()
  return json(r, u.includes('/games') ? games : u.includes('recent_activity') ? acts : [])
})
// Two response shapes on one endpoint: `?lanes=` answers with { lanes: {...} },
// everything else with { games }. Answering { games } to both leaves the For You
// feed on its empty state with the chips above it still rendered, so every
// assertion below it would have measured nothing and passed.
await page.route('**/api/**', (r) => {
  const u = r.request().url()
  const m = /[?&]lanes=([^&]*)/.exec(u)
  if (!m) return json(r, { games: disc })
  const lanes = {}
  for (const k of decodeURIComponent(m[1]).split(',')) lanes[k] = disc
  return json(r, { lanes })
})
await page.goto(BASE, { waitUntil: 'networkidle' })

/* ----------------------------------------------------------- Library */
await page.locator('.tabbar-btn', { hasText: 'Library' }).first().click()
await page.waitForTimeout(1200)

const library = await page.evaluate(() => {
  const listNode = document.querySelector('.game-list')
  const rows = [...document.querySelectorAll('.game-list .game-card')]
  if (!listNode || rows.length < 3) return { count: rows.length }
  const list = getComputedStyle(listNode)
  const row = getComputedStyle(rows[0])
  const second = getComputedStyle(rows[1])
  return {
    count: rows.length,
    listBg: list.backgroundColor,
    listBorder: list.borderTopWidth,
    listRadius: parseFloat(list.borderTopLeftRadius),
    listLeft: Math.round(listNode.getBoundingClientRect().left),
    rowBg: row.backgroundColor,
    rowPadLeft: Math.round(parseFloat(row.paddingLeft)),
    firstTopBorder: row.borderTopWidth,
    secondSides: ['Top', 'Right', 'Bottom', 'Left'].map((k) => second['border' + k + 'Width']),
  }
})
console.log('library', JSON.stringify(library))
check('the Library rendered rows to measure', library.count >= 3, library.count)
check('the Library list sits directly on the canvas', library.listBg === 'rgba(0, 0, 0, 0)', library.listBg)
check('and has no outer hairline or radius', library.listBorder === '0px' && library.listRadius === 0, `${library.listBorder} / ${library.listRadius}px`)
check('the list supplies the 16px gutter and rows add no inset', library.listLeft === 16 && library.rowPadLeft === 0, `left=${library.listLeft}px row=${library.rowPadLeft}px`)
check('Library rows are transparent', library.rowBg === 'rgba(0, 0, 0, 0)', library.rowBg)
check('Library rows use only between-row dividers',
  library.firstTopBorder === '0px' && library.secondSides[0] === '1px' && library.secondSides.slice(1).every((w) => w === '0px'),
  `${library.firstTopBorder} / ${library.secondSides.join('/')}`)

/* ---------------------------------------------- Discover / For you */
await page.locator('.tabbar-btn', { hasText: 'Discover' }).first().click()
await page.waitForTimeout(2200)

const fy = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.fy-row-wrap')]
  if (rows.length < 3) return { count: rows.length }
  const s = getComputedStyle(rows[0])
  const feed = getComputedStyle(document.querySelector('.fy-feed'))
  const cov = document.querySelector('.cover.fy-cov')
  const cr = cov ? cov.getBoundingClientRect() : null
  const heart = getComputedStyle(document.querySelector('.fy-row-wrap .wish-heart'))
  const g = (a, b) => Math.round(b.getBoundingClientRect().top - a.getBoundingClientRect().bottom)
  return {
    count: rows.length,
    bg: s.backgroundColor,
    border: s.borderTopWidth,
    radius: parseFloat(s.borderTopLeftRadius),
    feedBg: feed.backgroundColor,
    feedBorder: feed.borderTopWidth,
    feedRadius: parseFloat(feed.borderTopLeftRadius),
    firstTopBorder: getComputedStyle(rows[0]).borderTopWidth,
    // A card is bordered on four sides. The old layout was bordered on ONE, and
    // only from the second row down: a divider, not a card. Reading borderTop
    // alone cannot tell those apart, which is how the first version of this
    // check failed against correct code.
    sides: ['Top', 'Right', 'Bottom', 'Left'].map((k) => getComputedStyle(rows[1])['border' + k + 'Width']),
    cover: cr ? [Math.round(cr.width), Math.round(cr.height)] : null,
    heartBg: heart.backgroundColor,
    gap: g(rows[0], rows[1]),
    gap2: g(rows[1], rows[2]),
  }
})
console.log('fy', JSON.stringify(fy))
check('the For You feed rendered rows to measure', fy.count >= 3, fy.count)
// The page and lane controls already establish this as one feed. The outer slab
// is gone; rows retain only their between-row separator.
check('the For You feed sits directly on the canvas', fy.feedBg === 'rgba(0, 0, 0, 0)', fy.feedBg)
check('and has no outer hairline or radius', fy.feedBorder === '0px' && fy.feedRadius === 0, `${fy.feedBorder} / ${fy.feedRadius}px`)
check('a pick has no fill of its own', fy.bg === 'rgba(0, 0, 0, 0)', fy.bg)
// Divided, not bordered: the divider is BETWEEN rows, so the first row must not
// carry one. Reading row[1] alone cannot tell a divider from a card - that is
// the mistake the four-sided check was written to catch, kept and pointed the
// other way.
check('a pick is divided by a hairline, not bordered on four sides',
  fy.sides[0] === '1px' && fy.sides.slice(1).every((w) => w === '0px'), fy.sides.join('/'))
check('...and the first pick has no divider above it', fy.firstTopBorder === '0px', fy.firstTopBorder)
check('the poster is 66x88', fy.cover && fy.cover[0] === 66 && fy.cover[1] === 88, JSON.stringify(fy.cover))
check('the heart dropped its glass puck', fy.heartBg === 'rgba(0, 0, 0, 0)', fy.heartBg)
check('rows sit flush, with no ground showing between them', fy.gap === 0 && fy.gap2 === 0, `${fy.gap} / ${fy.gap2}`)

const head = await page.evaluate(() => {
  const q = (s) => document.querySelector(s).getBoundingClientRect()
  const t = q('.page-title'), sub = q('.page-subtitle'), seg = q('.discover-seg'), strip = q('.showing-strip')
  return {
    titleToSub: Math.round(sub.top - t.bottom),
    subToSeg: Math.round(seg.top - sub.bottom),
    segToStrip: Math.round(strip.top - seg.bottom),
    firstContent: Math.round(strip.top),
  }
})
console.log('head', JSON.stringify(head))
// 116px of fixed bar around 76px of content spent the slack above the subtitle
// and below the control: 16 / 20 / 26. The control is now evenly framed.
check('the header is tight', head.titleToSub <= 8, head.titleToSub)
// Within a pixel: the space below the control includes the bar's own hairline,
// which is the boundary a reader sees rather than slack.
check('the control is evenly framed', near(head.subToSeg, head.segToStrip, 1), `${head.subToSeg} above / ${head.segToStrip} below`)
check('content starts higher than it did', head.firstContent < 200, head.firstContent)

/* ---------------------------------------------- Activity */
await page.locator('.tabbar-btn', { hasText: 'Activity' }).first().click()
await page.waitForTimeout(1600)

const act = await page.evaluate(() => {
  const panels = [...document.querySelectorAll('.day-card')]
  if (panels.length < 3) return { count: panels.length }
  const s = getComputedStyle(panels[0])
  const labels = [...document.querySelectorAll('.activity-group-label')]
  const row = document.querySelector('.activity-row')
  return {
    count: panels.length,
    bg: s.backgroundColor,
    border: s.borderTopWidth,
    radius: parseFloat(s.borderTopLeftRadius),
    // The rail and the node were retired: 180 days of the feed is 1.08 rows per
    // day, so the rail was a 45px stub with one dot on it twelve times. What is
    // asserted now is that the gutter they held went back to the row.
    nodes: document.querySelectorAll('.activity-node').length,
    rowPadLeft: row ? Math.round(parseFloat(getComputedStyle(row).paddingLeft)) : null,
    panelLeft: Math.round(panels[0].getBoundingClientRect().left),
    labelToPanel: Math.round(panels[0].getBoundingClientRect().top - labels[0].getBoundingClientRect().bottom),
    panelToLabel: Math.round(labels[1].getBoundingClientRect().top - panels[0].getBoundingClientRect().bottom),
    labelToPanel2: Math.round(panels[1].getBoundingClientRect().top - labels[1].getBoundingClientRect().bottom),
    rowsInFirst: panels[0].querySelectorAll('.activity-row').length,
  }
})
console.log('act', JSON.stringify(act))
check('the feed rendered day panels to measure', act.count >= 3, act.count)
check('a day group sits directly on the canvas', act.bg === 'rgba(0, 0, 0, 0)', act.bg)
check('and has no outer hairline or radius', act.border === '0px' && act.radius === 0, `${act.border} / ${act.radius}px`)
check('the spine is gone', act.nodes === 0, `${act.nodes} nodes`)
check('the group itself supplies the 16px screen gutter', act.panelLeft === 16 && act.rowPadLeft === 0, `left=${act.panelLeft}px row=${act.rowPadLeft}px`)
check('the day rhythm is even', act.labelToPanel === act.labelToPanel2, `${act.labelToPanel} / ${act.labelToPanel2}`)
check('a label sits closer to its own day than to the one above', act.labelToPanel < act.panelToLabel, `${act.labelToPanel} under vs ${act.panelToLabel} over`)

check('no page errors', problems.length === 0, problems.join(' | '))
await browser.close()
const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed} of ${results.length} passed`)
process.exit(failed ? 1 : 0)
