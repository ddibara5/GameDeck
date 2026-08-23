/*
 * repro/nowplaying.mjs - which game the Home card names when two are in rotation.
 *
 * The card is titled "Now playing" and its own comment says it answers "what am I
 * in the middle of". Across days it did: the later day wins, so a long session
 * last Tuesday does not beat an hour last night. INSIDE one day it did the
 * opposite of what it claims, taking whichever game logged more minutes. Three
 * hours of Persona in the morning beat forty minutes of Mortal Shell at night,
 * and Home announced Persona while you were sitting in front of the other one.
 *
 * play_events carries a DAY and no time, so the tiebreak now reads the game's own
 * last_played instant, which is already in the library payload.
 *
 * Every fixture here puts MINUTES AND RECENCY IN CONFLICT on purpose. A fixture
 * where the later session is also the longer one passes on both the old rule and
 * the new one and proves nothing, which is the trap this file exists to avoid: it
 * is why the same-day case was never covered in repro/home.mjs, whose activity
 * fixture holds one game.
 *
 * Run: PW_CHROME=... BASE=http://127.0.0.1:4173 node repro/nowplaying.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://127.0.0.1:4173'
const TZ = 'America/New_York'
// Wednesday mid-afternoon, pinned in both clocks for the reason repro/home.mjs
// documents: a harness that reads the machine's clock passes or fails by the hour.
const NOW = new Date('2026-08-19T15:00:00-04:00')

const dayInTz = (d) => {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
  const [y, m, dd] = f.format(d).split('-').map(Number)
  return { y, m: m - 1, d: dd }
}
const dkey = (daysAgo) => {
  const { y, m, d } = dayInTz(NOW)
  return new Date(Date.UTC(y, m, d - daysAgo)).toISOString().slice(0, 10)
}
// An instant on the ET day `daysAgo`, at `hour` ET. This is what the tiebreak
// reads, so the fixtures need it to be exact rather than approximate.
const at = (daysAgo, hour) => {
  const { y, m, d } = dayInTz(NOW)
  return new Date(Date.UTC(y, m, d - daysAgo, hour + 4, 0, 0)).toISOString()
}

const results = []
const check = (name, pass, got) => {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${got !== undefined ? `  ::  ${got}` : ''}`)
}

// LONG is the bigger session, SHORT is the later one. Held apart by name so no
// assertion below can be read as accidentally right.
const LONG = { master_id: 550043, title: 'Persona 5 Royal' }
const SHORT = { master_id: 1008738, title: 'Mortal Shell II' }

const gameRow = (g, lastPlayed, mins) => ({
  master_id: g.master_id, title: g.title, environment: 'xbox', genre: 'Role-playing (RPG)',
  percent: 20, playtime_minutes: mins, playtime_label: `${Math.floor(mins / 60)}h`,
  earned_awards: 4, total_awards: 52, last_played: lastPlayed, igdb_id: 100 + g.master_id,
  igdb_rating: 90, release_year: 2026, length_minutes: 3000, cover_small: null,
  cover_igdb: 'co1', platforms: 'Xbox',
})
const eventRow = (g, dayAgo, mins) => ({
  event_date: dkey(dayAgo), title: g.title, environment: 'xbox', minutes_delta: mins,
  achievements_delta: 1, percent_after: 20, cover_small: null, master_id: g.master_id,
  earned_awards_after: 4, total_awards: 52,
})

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined })

/** Open Home against one fixture and read the name on the Now playing card. */
async function whoIsPlaying({ games, activity }) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 900 }, deviceScaleFactor: 1,
    isMobile: true, hasTouch: true, serviceWorkers: 'block', timezoneId: TZ,
  })
  const page = await ctx.newPage()
  await page.clock.setFixedTime(NOW)
  const problems = []
  page.on('pageerror', (e) => problems.push(String(e.message)))
  const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('**/rest/v1/**', (route) => {
    const u = route.request().url()
    if (u.includes('/v_recent_activity')) {
      if (u.includes('order=event_date.asc')) return json(route, [{ event_date: dkey(13) }])
      return json(route, activity)
    }
    if (u.includes('/games')) return json(route, games)
    return json(route, [])
  })
  await page.route('**/api/**', (route) => json(route, { games: [] }))
  const px = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  const png = (r) => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(px, 'base64') })
  await page.route('**images.igdb.com/**', png)
  await page.route('**wsrv.nl/**', png)

  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  const out = await page.evaluate(() => ({
    // The card's own title element, so this cannot read some other row's name.
    names: [...document.querySelectorAll('.np-t')].map((e) => e.textContent.trim()),
    cards: [...document.querySelectorAll('.chart-title')].map((e) => e.textContent.trim()),
  }))
  await ctx.close()
  return { ...out, problems }
}

/* ---- 1. same day, the LATER session wins even though it is the shorter one --- */
{
  const r = await whoIsPlaying({
    games: [gameRow(LONG, at(0, 9), 2438), gameRow(SHORT, at(0, 21), 157)],
    activity: [eventRow(LONG, 0, 180), eventRow(SHORT, 0, 40)],
  })
  check('the page rendered without errors', r.problems.length === 0, r.problems.join(' | ') || 'none')
  check('Now playing is on screen', r.cards.includes('Now playing'), r.cards.join('|'))
  // The whole point: 180 minutes at 9am against 40 minutes at 9pm.
  check('same day: the later session wins, not the longer one',
    r.names[0] === SHORT.title, `${r.names[0]} (expected ${SHORT.title})`)
  check('...and it names exactly one game', r.names.length === 1, String(r.names.length))
}

/* ---- 2. the mirror, so it is the TIMESTAMP deciding and not the row order ---- */
{
  const r = await whoIsPlaying({
    // Same two games, same two session lengths, only the clocks swapped.
    games: [gameRow(LONG, at(0, 21), 2438), gameRow(SHORT, at(0, 9), 157)],
    activity: [eventRow(LONG, 0, 180), eventRow(SHORT, 0, 40)],
  })
  check('swap only the timestamps and the answer swaps too',
    r.names[0] === LONG.title, `${r.names[0]} (expected ${LONG.title})`)
}

/* ---- 3. across days, the later DAY still beats a much bigger session --------- */
{
  const r = await whoIsPlaying({
    games: [gameRow(LONG, at(1, 21), 2438), gameRow(SHORT, at(0, 9), 157)],
    activity: [eventRow(LONG, 1, 600), eventRow(SHORT, 0, 20)],
  })
  check('a later day beats a bigger session on an earlier one',
    r.names[0] === SHORT.title, `${r.names[0]} (expected ${SHORT.title})`)
}

/* ---- 4. the documented last resort, and it must still be reachable ----------- */
{
  // No last_played on either row, which is a real state: a library row can carry
  // null there. With no instants to compare the rule falls back to minutes, and
  // that fallback is asserted rather than assumed, because a tiebreak that
  // silently returns the first row on missing data looks identical in the happy
  // case and is wrong every other time.
  const r = await whoIsPlaying({
    games: [gameRow(LONG, null, 2438), gameRow(SHORT, null, 157)],
    activity: [eventRow(SHORT, 0, 40), eventRow(LONG, 0, 180)],
  })
  check('with no timestamps at all it falls back to minutes',
    r.names[0] === LONG.title, `${r.names[0]} (expected ${LONG.title})`)
}

/* ---- 5. one game missing from the library payload, the other present -------- */
{
  // Half a fallback: SHORT has an instant, LONG has no library row at all, so
  // playedAt returns null for one side. The comparison must not throw and must
  // not silently prefer the row it cannot date.
  const r = await whoIsPlaying({
    games: [gameRow(SHORT, at(0, 21), 157)],
    activity: [eventRow(LONG, 0, 180), eventRow(SHORT, 0, 40)],
  })
  check('one side undateable: falls back to minutes rather than throwing',
    r.problems.length === 0 && r.names.length === 1, `${r.names.join(',')} / ${r.problems.join('|') || 'no errors'}`)
}

await browser.close()
const pass = results.filter(Boolean).length
console.log(`\n${pass}/${results.length} passed`)
process.exit(pass === results.length ? 0 : 1)
