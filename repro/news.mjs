/**
 * repro/news.mjs - the News tab's compact row and the story sheet.
 *
 * The tab used to render one full-width card per story carrying the article
 * art, the whole summary, the relevance line, the matched game and the source
 * links. On a real week that measured 704-941px against 772px of list area:
 * ZERO whole cards on a screen, and 42 stories was eighteen of them.
 *
 * The fixture is built out of that same real week, and specifically out of its
 * WORST cases, because a fixture of short headlines and two-line summaries
 * cannot fail any of the assertions below:
 *
 *  - the longest real headline (73 chars) and the longest real summary (839),
 *    so "nothing is clipped" and "the row carries no summary" both have
 *    something to catch.
 *  - one story with a library match AND 7 outlets, which is the only case that
 *    can prove the row's single right-hand slot goes to the relevance hook.
 *  - one story with 3 outlets and no match, which is the only case that can
 *    prove the outlet chip still appears when that slot is free.
 *
 * Run: PW_CHROME=... BASE=http://127.0.0.1:PORT node repro/news.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://127.0.0.1:4173'

let pass = 0
let fail = 0
const failures = []
function check(name, ok, detail = '') {
  if (ok) pass++
  else { fail++; failures.push(name) }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ::  ${detail}` : ''}`)
}

const WEEK = '2026-08-17'
const LONG_SUMMARY =
  'Robin Atkin Downes, who voiced Robert in The Last of Us and multiple characters across Naughty Dog\'s Uncharted series, confirmed on social media he\'s joined the cast of Intergalactic: The Heretic Prophet. He didn\'t reveal his role but posted an enthusiastic video about the project. Downes is a prolific voice actor with credits across dozens of major games. Intergalactic is Naughty Dog\'s first new IP since The Last of Us and stars Tati Gabrielle as bounty hunter Jordan A. Mun in a retro-futuristic sci-fi setting. No release date yet but this casting signals production is well underway. Not directly in your wheelhouse but Naughty Dog\'s pedigree in narrative action-adventure makes this worth tracking.'
const GTA_SUMMARY =
  'Another wave of GTA 6 gameplay leaked this week, showing combat, basketball, and other mechanics, all watermarked with a Solana meme coin. Take-Two filed DMCA subpoenas in New York federal court demanding Microsoft and Discord hand over user data to identify the leaker.'

const src = (n, u) => ({ name: n, url: u })
const NEWS = [
  {
    // Library match AND seven outlets: the only row that can prove which chip wins.
    id: 117, week_of: WEEK, rank: 0,
    title: "Take-Two Subpoenas Microsoft and Discord Hunting GTA 6 Leaker 'Cyberleek'",
    summary: GTA_SUMMARY,
    image_url: null,
    primary_url: 'https://gameranx.com/updates/id/563781/',
    sources: [
      src('Gameranx', 'https://gameranx.com/updates/id/563781/'),
      src('IGN', 'https://www.ign.com/articles/gta6-a'),
      src('GameSpot', 'https://www.gamespot.com/articles/gta6-b'),
      src('This Week in Videogames', 'https://thisweekinvideogames.com/news/gta6'),
      src('Gameranx', 'https://gameranx.com/updates/id/563777/'),
      src('IGN', 'https://www.ign.com/articles/gta6-c'),
      src('Push Square', 'https://www.pushsquare.com/news/gta6'),
    ],
    published_at: '2026-08-21T12:26:01+00:00', created_at: '2026-08-21T18:21:24Z',
    game_name: 'Grand Theft Auto VI', game_igdb_id: 52189,
    game_cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big/cocaa5.jpg',
  },
  {
    // The longest headline of the week, 73 characters, and its longest summary.
    id: 120, week_of: WEEK, rank: 1,
    title: "Naughty Dog's Intergalactic Adds Last of Us and Uncharted Veteran to Cast",
    summary: LONG_SUMMARY,
    image_url: null,
    primary_url: 'https://www.gamespot.com/articles/naughty-dogs-intergalactic/',
    sources: [src('GameSpot - All News', 'https://www.gamespot.com/articles/naughty-dogs-intergalactic/')],
    published_at: '2026-08-21T17:49:10+00:00', created_at: '2026-08-21T18:21:23Z',
    game_name: 'Intergalactic: The Heretic Prophet', game_igdb_id: 325611,
    game_cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co95gc.jpg',
  },
  {
    // No match, three outlets: the free right-hand slot.
    id: 115, week_of: WEEK, rank: 2,
    title: 'US Video Game Spending Dropped 10% in July, Lowest Since 2020',
    summary: 'Circana data shows total US game spending fell to $4.5 billion in July 2026, down 10% year-over-year. Physical software hit an all-time July low.',
    image_url: null,
    primary_url: 'https://www.gamespot.com/articles/us-spending/',
    sources: [
      src('GameSpot - All News', 'https://www.gamespot.com/articles/us-spending/'),
      src('IGN', 'https://www.ign.com/articles/us-spending'),
      src('Eurogamer', 'https://www.eurogamer.net/us-spending'),
    ],
    published_at: '2026-08-20T13:00:00+00:00', created_at: '2026-08-20T21:00:28Z',
    game_name: null, game_igdb_id: null, game_cover: null,
  },
  {
    id: 114, week_of: WEEK, rank: 3,
    title: '19 Games Have Broken Achievement Lists in Current Xbox Sales',
    summary: 'TrueAchievements reports 19 titles in active Xbox sales have broken achievement lists, including Call of Duty: Black Ops 7 and Mortal Kombat X.',
    image_url: null,
    primary_url: 'https://www.trueachievements.com/news/xbox-sales-broken',
    sources: [src('TrueAchievements News Feed', 'https://www.trueachievements.com/news/xbox-sales-broken')],
    published_at: '2026-08-20T13:24:34+00:00', created_at: '2026-08-20T21:00:27Z',
    game_name: null, game_igdb_id: null, game_cover: null,
  },
  {
    id: 113, week_of: WEEK, rank: 4,
    title: 'Horizon 3 Still in Early Development, Tiny Team Assigned',
    summary: 'Bloomberg reports Horizon 3 remains years away with only a skeleton crew currently working on the project at Guerrilla Games.',
    image_url: null,
    primary_url: 'https://www.playstationlifestyle.net/2026/08/20/horizon-3/',
    sources: [src('PlayStation LifeStyle', 'https://www.playstationlifestyle.net/2026/08/20/horizon-3/')],
    published_at: '2026-08-20T13:08:40+00:00', created_at: '2026-08-20T21:00:26Z',
    game_name: 'Horizon 3', game_igdb_id: null, game_cover: null,
  },
  {
    id: 112, week_of: WEEK, rank: 5,
    title: 'Driving Is Hard: Bathtub Rage Game Launches on Xbox',
    summary: 'Elegant Horse Studios shipped Driving Is Hard, a coffee-break joke turned full release where you pilot a bathtub through obstacle courses.',
    image_url: null,
    primary_url: 'https://news.xbox.com/en-us/2026/08/20/driving-is-hard/',
    sources: [src('Xbox Wire', 'https://news.xbox.com/en-us/2026/08/20/driving-is-hard/')],
    published_at: '2026-08-20T17:30:00+00:00', created_at: '2026-08-20T21:00:25Z',
    game_name: 'Driving Is Hard', game_igdb_id: 315385, game_cover: null,
  },
  {
    id: 110, week_of: WEEK, rank: 6,
    title: 'Riot Ending Active Development on 2XKO Fighting Game in December',
    summary: 'Riot announced 2XKO, its League of Legends fighting game, will cease active development in December 2026 after less than a year post-launch.',
    image_url: null,
    primary_url: 'https://www.ign.com/articles/riot-2xko',
    sources: [src('IGN', 'https://www.ign.com/articles/riot-2xko')],
    published_at: '2026-08-20T19:59:52+00:00', created_at: '2026-08-20T21:00:24Z',
    game_name: '2XKO', game_igdb_id: 126460, game_cover: null,
  },
]

// Played in January, so the match is tier 3 "In your library" rather than tier
// 5 "Because you're playing" - the wording the assertions below look for.
const GAMES = [{
  master_id: 'm-gta6', environment: 'xbox', title: 'Grand Theft Auto VI',
  platforms: ['Series X|S'], earned_awards: 4, total_awards: 50, percent: 8,
  playtime_minutes: 158, playtime_label: '2h 38m', last_played: '2026-01-04T10:00:00Z',
  cover_small: null, updated_at: '2026-01-04T10:00:00Z', length_minutes: null,
  genre: 'Action', release_year: 2026,
  cover_igdb: 'https://images.igdb.com/igdb/image/upload/t_cover_big/cocaa5.jpg',
  igdb_id: 52189, igdb_rating: 96, franchises: ['Grand Theft Auto'],
}]

const json = (r, b) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) })
const png = (r) => r.fulfill({
  status: 200, contentType: 'image/svg+xml',
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="264" height="374"><rect width="264" height="374" fill="#2f4a63"/></svg>',
})

async function open(browser) {
  // hasTouch, because two of the assertions below are about a touch drag and
  // TouchEvent does not exist in a context without it.
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  // Generic BEFORE specific: the last matching route wins in Playwright.
  await page.route('**/rest/v1/**', (r) => json(r, []))
  await page.route('**/rest/v1/news**', (r) => json(r, NEWS))
  await page.route('**/rest/v1/games**', (r) => json(r, GAMES))
  await page.route('**/api/**', (r) => json(r, {}))
  await page.route('**/images.igdb.com/**', png)
  await page.route('**/wsrv.nl/**', png)
  await page.route('**/www.google.com/s2/**', png)

  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.evaluate(() => { try { localStorage.setItem('gamedeck_theme_v1', 'dark') } catch { /* private mode */ } })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  try {
    await page.getByRole('button', { name: /^News/ }).first().click({ timeout: 4000 })
  } catch {
    await page.locator('.brand-btn, .brand').first().click()
    await page.waitForTimeout(400)
    await page.locator('.drawer .menu-item', { hasText: /news/i }).first().click()
  }
  await page.waitForTimeout(1500)
  return { ctx, page }
}

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME })
const { ctx, page } = await open(browser)

/* ---------- the list ---------- */

const list = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.news-row')]
  return {
    count: rows.length,
    heights: [...new Set(rows.map((r) => Math.round(r.getBoundingClientRect().height)))],
    tags: [...new Set(rows.map((r) => r.tagName))],
    clipped: rows
      .map((r) => r.querySelector('.news-row-title'))
      .filter((t) => t && t.scrollHeight > t.clientHeight + 1).length,
    titles: rows.map((r) => r.querySelector('.news-row-title')?.textContent || ''),
  }
})
check('the tab renders rows at all', list.count >= 7, `${list.count} rows`)
// One height, and that height is the CONTENT's. 128 was the first draft and it
// left 20px of slack for align-items: center to spread around the text. The
// uniformity is the part worth guarding: it is what fails if the meta line ever
// wraps again.
check('every row is exactly 108px', list.heights.length === 1 && list.heights[0] === 108, `heights: ${list.heights.join(', ')}`)
check('the row is a real button, not a div with an onClick', list.tags.length === 1 && list.tags[0] === 'BUTTON', list.tags.join(','))
// Guarded on the count. Against the previous build this measured "0 of 0
// clipped" and PASSED, which is the vacuous pass this project has been bitten
// by twice: an assertion that cannot fail when the feature is absent is not an
// assertion about the feature.
check(
  'no headline is cut, including the 73-character one',
  list.count >= 7 && list.clipped === 0,
  `${list.clipped} of ${list.count} clipped; longest title ${list.titles.length ? Math.max(...list.titles.map((t) => t.length)) : 0} chars`
)

// THE POINT OF THE CHANGE. A row that still carried the summary would pass
// every assertion above and none of the density this was done for.
const carries = await page.evaluate((needle) => {
  const rows = [...document.querySelectorAll('.news-row')]
  return rows.filter((r) => r.textContent.includes(needle)).length
}, LONG_SUMMARY.slice(0, 60))
check(
  'no row carries the summary',
  list.count >= 7 && carries === 0,
  `${carries} of ${list.count} rows contain the first 60 chars of the long summary`
)

// Density, measured the way it is actually experienced: scroll the list to the
// top of the screen and count rows that fit whole above the tab bar.
const density = await page.evaluate(() => {
  const first = document.querySelector('.news-row')
  if (!first) return null
  first.scrollIntoView({ block: 'start' })
  const bar = document.querySelector('.tabbar')
  const floor = bar ? bar.getBoundingClientRect().top : window.innerHeight
  const rows = [...document.querySelectorAll('.news-row')]
  const top = rows[0].getBoundingClientRect().top
  return {
    fit: rows.filter((r) => {
      const b = r.getBoundingClientRect()
      return b.top >= top - 1 && b.bottom <= floor + 1
    }).length,
    area: Math.round(floor - top),
  }
})
check('at least five whole stories fit on a screen', density && density.fit >= 5, `${density?.fit} whole rows in ${density?.area}px`)

/* ---------- the right-hand slot ---------- */

const chips = await page.evaluate(() => {
  const byTitle = (frag) =>
    [...document.querySelectorAll('.news-row')].find((r) => (r.textContent || '').includes(frag))
  const read = (r) => ({
    why: r?.querySelector('.news-row-why')?.textContent.trim() || null,
    heat: r?.querySelector('.news-row-heat')?.textContent.trim() || null,
  })
  return { gta: read(byTitle('Take-Two Subpoenas')), spend: read(byTitle('US Video Game Spending')) }
})
check(
  'a story with a library match shows the hook, not the outlet count',
  chips.gta.why === 'In your library' && chips.gta.heat === null,
  `why: ${chips.gta.why}  heat: ${chips.gta.heat}`
)
check(
  'a story with no hook and 3 outlets shows the outlet count',
  chips.spend.why === null && chips.spend.heat === '3 outlets',
  `why: ${chips.spend.why}  heat: ${chips.spend.heat}`
)

/* ---------- the sheet ---------- */

await page.locator('.news-row', { hasText: 'Naughty Dog' }).first().click()
await page.waitForTimeout(700)

const sheet = await page.evaluate((full) => {
  const s = document.querySelector('.modal-sheet.news-sheet')
  if (!s) return null
  const band = s.querySelector('.ns-band')
  const title = s.querySelector('.ns-title')
  const sum = s.querySelector('.ns-sum')
  return {
    present: true,
    title: title?.textContent || '',
    hasFullSummary: (sum?.textContent || '') === full,
    bandBottom: band ? Math.round(band.getBoundingClientRect().bottom) : null,
    titleTop: title ? Math.round(title.getBoundingClientRect().top) : null,
    sources: [...s.querySelectorAll('.news-source-link')].map((a) => a.getAttribute('href')),
    game: s.querySelector('.news-game-name')?.textContent || null,
  }
}, LONG_SUMMARY)

check('tapping a row opens the story sheet', Boolean(sheet), sheet ? 'present' : 'no .news-sheet')
check('the sheet carries the WHOLE summary, not a clamp of it', sheet?.hasFullSummary === true, `${sheet?.hasFullSummary}`)
check('and the headline the row showed', (sheet?.title || '').startsWith("Naughty Dog's Intergalactic"), sheet?.title?.slice(0, 40))
check('and the matched game', sheet?.game === 'Intergalactic: The Heretic Prophet', String(sheet?.game))
// Geometry, not contrast: the art ENDS before the headline begins, so there is
// no per-image argument about how legible white text is over a press photo.
check(
  'the art stops before the headline starts',
  sheet && sheet.bandBottom !== null && sheet.bandBottom <= sheet.titleTop,
  `band ends ${sheet?.bandBottom}px, headline starts ${sheet?.titleTop}px`
)

/* ---------- swipe down, from the art ---------- */

// A synthetic touch drag, in TWO calls with a frame between them.
//
// This is not fussiness. useSheetDrag's onTouchEnd reads `dragY` from the
// closure it was created in, so it only sees the drag if React has re-rendered
// since the last touchmove. Firing start, moves and end inside one evaluate()
// batches all of it into a single tick, onTouchEnd reads dragY === 0, and the
// sheet stays open no matter how far the "finger" moved. The first version of
// this harness did exactly that and reported a real feature as broken.
async function dragDown(page, selector, dy) {
  const started = await page.evaluate(
    ([sel, dist]) => {
      const el = document.querySelector(sel)
      if (!el) return false
      const r = el.getBoundingClientRect()
      const x = Math.round(r.left + r.width / 2)
      const y = Math.round(r.top + Math.min(r.height / 2, 60))
      window.__dragEl = el
      window.__dragXY = [x, y + dist]
      const touch = (cy) => new Touch({ identifier: 1, target: el, clientX: x, clientY: cy })
      const fire = (type, cy) =>
        el.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches: [touch(cy)],
            changedTouches: [touch(cy)],
          })
        )
      fire('touchstart', y)
      for (let i = 1; i <= 6; i++) fire('touchmove', y + (dist * i) / 6)
      return true
    },
    [selector, dy]
  )
  if (!started) return false
  await page.waitForTimeout(120)
  await page.evaluate(() => {
    const el = window.__dragEl
    const [x, y] = window.__dragXY
    const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y })
    el.dispatchEvent(
      new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [t] })
    )
  })
  return true
}

const bandInZone = await page.evaluate(
  () => Boolean(document.querySelector('.sheet-drag-zone .ns-band'))
)
check('the art is inside the drag zone, not beside it', bandInZone === true, String(bandInZone))

// Does the gesture reach the sheet AT ALL? Without this, "dragging the body
// does not close it" passes just as well when the drag mechanism is inert, and
// the assertion after it would be measuring nothing.
await page.evaluate(([sel]) => {
  const el = document.querySelector(sel)
  const r = el.getBoundingClientRect()
  const x = Math.round(r.left + r.width / 2)
  const y = Math.round(r.top + 40)
  const touch = (cy) => new Touch({ identifier: 1, target: el, clientX: x, clientY: cy })
  const fire = (type, cy) =>
    el.dispatchEvent(
      new TouchEvent(type, { bubbles: true, cancelable: true, touches: [touch(cy)], changedTouches: [touch(cy)] })
    )
  fire('touchstart', y)
  fire('touchmove', y + 60)
}, ['.ns-band'])
await page.waitForTimeout(120)
const moved = await page.evaluate(() => document.querySelector('.news-sheet')?.style.transform || '')
check('a drag on the art moves the sheet with the finger', /translateY\(\d/.test(moved), `transform: ${moved || '(none)'}`)
await page.evaluate(() => {
  const el = document.querySelector('.ns-band')
  const t = new Touch({ identifier: 1, target: el, clientX: 100, clientY: 100 })
  el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [t] }))
})
await page.waitForTimeout(300)

// A drag on the BODY must not dismiss. Without this the assertion below would
// pass just as well if the handlers were bolted to the whole sheet, which would
// eat the sheet's own scrolling - the exact thing useSheetDrag warns about.
await dragDown(page, '.ns-sum', 220)
await page.waitForTimeout(500)
const bodyDragOpen = Boolean(await page.$('.news-sheet'))
check('dragging the summary does NOT close the sheet', bodyDragOpen, bodyDragOpen ? 'still open' : 'closed')

await dragDown(page, '.ns-band', 220)
await page.waitForTimeout(600)
const stillOpen = Boolean(await page.$('.news-sheet'))
check('dragging the art DOES close it', !stillOpen, stillOpen ? 'still open' : 'closed')

// Reopened, because the assertions after this one expect a sheet.
await page.locator('.news-row', { hasText: 'Naughty Dog' }).first().click()
await page.waitForTimeout(700)

await page.keyboard.press('Escape').catch(() => {})
await page.evaluate(() => document.querySelector('.modal-backdrop')?.click())
await page.waitForTimeout(600)

const afterClose = await page.evaluate(() => ({
  sheet: Boolean(document.querySelector('.news-sheet')),
  read: [...document.querySelectorAll('.news-row')].filter((r) => r.classList.contains('read')).length,
}))
check('the sheet closes', afterClose.sheet === false)
check('opening a story marks it read', afterClose.read === 1, `${afterClose.read} rows read`)

/* ---------- every source, which the row could not show ---------- */

await page.locator('.news-row', { hasText: 'Take-Two Subpoenas' }).first().click()
await page.waitForTimeout(700)
const gtaSheet = await page.evaluate(() => {
  const s = document.querySelector('.news-sheet')
  return {
    links: [...s.querySelectorAll('.news-source-link')].length,
    heat: s.querySelector('.news-heat')?.textContent.trim() || null,
    why: s.querySelector('.news-why')?.textContent.trim() || null,
  }
})
// Seven raw sources, five unique outlets after dedupe.
check('the sheet lists every deduped source', gtaSheet.links === 5, `${gtaSheet.links} links`)
check('the outlet count the row gave up still shows here', gtaSheet.heat === '5 outlets', String(gtaSheet.heat))
check('and the relevance line, in full', (gtaSheet.why || '').startsWith('In your library'), String(gtaSheet.why))

await ctx.close()
await browser.close()
console.log(`\n${pass}/${pass + fail} passed`)
if (fail) console.log('failed:', failures.join(' | '))
process.exit(fail ? 1 : 0)
