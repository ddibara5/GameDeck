/**
 * repro/foryou.mjs - the For You feed, against the BUILT app.
 *
 * What this locks is the CLAIM the feed makes, which is not "here are some
 * games" but "here is why each of these is here". Three things have to hold or
 * the claim is false:
 *
 *   1. The reason on a row has to match the lane that produced it. A chip that
 *      says "Soulslike, like Kristala" on a row pulled from the platform lane is
 *      worse than no chip.
 *   2. The order has to be a round robin. If lane one fills the screen, the feed
 *      is a rail turned sideways and the other reasons never appear.
 *   3. A game reached by two lanes appears once.
 *
 * Plus the two rules the feed inherits from the standing preferences: it asks
 * for the stored platform set, and it never offers a game already in the
 * library.
 *
 * Run: PW_CHROME=... BASE=http://127.0.0.1:4173 node repro/foryou.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://127.0.0.1:4173'
const results = []
const check = (name, pass, got) => {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${got !== undefined ? `  ::  ${got}` : ''}`)
}

// The taste probe reads real library rows, so the stub has to look like one:
// keywords lowercased, playtime in minutes. Soulslike outweighs open world here,
// which is what decides lane ORDER, and the heaviest soulslike row is the
// exemplar the chip has to name.
const LIBRARY = [
  { title: 'Dark Souls III', keywords: ['soulslike', 'dark fantasy'], playtime_minutes: 18780, last_played: '2026-08-01' },
  { title: 'Kristala', keywords: ['soulslike', 'cat'], playtime_minutes: 900, last_played: '2026-08-08' },
  { title: 'Crimson Desert', keywords: ['open world'], playtime_minutes: 2700, last_played: '2026-08-07' },
  { title: 'Palworld', keywords: ['open world', 'survival'], playtime_minutes: 1620, last_played: '2026-07-30' },
  { title: 'Satisfactory', keywords: ['survival'], playtime_minutes: 2160, last_played: '2026-08-02' },
  // One game deep enough in the library to prove hide-owned reaches the feed.
  { title: 'Death Howl', keywords: ['soulslike'], playtime_minutes: 300, last_played: '2026-06-01' },
]
const OWNED_IN_FEED = 'Death Howl'
// A game the soulslike lane and the open world lane BOTH return, to prove the
// dedupe. It sits at index 1 in each so it is reached on the second pass.
const SHARED = { id: 9001, name: 'Mistfall Hunter' }

const lane = (seed, names) =>
  names.map((name, i) => ({
    id: name === SHARED.name ? SHARED.id : seed * 100 + i,
    name,
    cover: null,
    year: 2026,
    rating: 70 + i,
    released: Math.floor(Date.now() / 1000) - i * 86400,
    genres: ['Role-playing (RPG)'],
    platforms: ['Series X|S', 'PS5'],
  }))

const LANES = {
  new: lane(1, ['S.T.A.L.K.E.R. 2: Cost of Hope', 'Steins;Gate Re:Boot', 'Grim Trials']),
  soulslike: lane(2, ['Verho: Curse of Faces', SHARED.name, OWNED_IN_FEED, 'Mandragora']),
  survival: lane(3, ['Enshrouded II', 'Frostpunk 2', 'Icarus']),
  openworld: lane(4, ['Avowed II', SHARED.name, 'Fable']),
}

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

const asked = []
const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
await page.route('**/rest/v1/**', (route) => {
  const u = route.request().url()
  if (!u.includes('/games')) return json(route, [])
  // The taste probe selects keywords; the library-titles fetch selects title
  // only. Both hit `games`, so answer on what was asked for.
  return json(route, u.includes('keywords') ? LIBRARY : LIBRARY.map((r) => ({ title: r.title })))
})
await page.route('**/api/**', (route) => json(route, {}))
await page.route('**/api/discover**', (route) => {
  const u = route.request().url()
  asked.push(u)
  if (u.includes('lanes=')) return json(route, { lanes: LANES })
  return json(route, { rails: {} })
})
const stub = (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>' })
await page.route('**/wsrv.nl/**', stub)
await page.route('**/images.igdb.com/**', stub)

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await page.getByRole('button', { name: /^Discover/ }).first().click()
await page.waitForTimeout(2000)

const laneCall = () => asked.filter((u) => u.includes('lanes=')).pop() || ''
const rows = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.fy-row')].map((r) => ({
      name: r.querySelector('.fy-name')?.textContent.trim(),
      why: r.querySelector('.fy-why')?.textContent.trim(),
    }))
  )

/* ------------------------------------------------------- it is the landing */

const seg = await page.evaluate(() => {
  const b = document.querySelector('.discover-seg .seg-btn.active')
  return { active: b?.textContent.trim(), all: [...document.querySelectorAll('.discover-seg .seg-btn')].map((x) => x.textContent.trim()) }
})
check('For you is the segment Discover opens on', seg.active === 'For you', JSON.stringify(seg))
check('and Browse is still there beside it', seg.all.includes('Browse') && seg.all.includes('Ask AI'), seg.all.join(' | '))

/* ---------------------------------------------------------- what it asked */

// The order is arithmetic, not a guess, and the fixture above is built so the
// three lanes cannot tie: soulslike 18780 + 900 + 300 = 19980 minutes, open
// world 2700 + 1620 = 4320, survival 2160 + 1620 = 3780. Palworld is in two
// lanes on purpose, so a lane's total is a sum over games rather than a
// partition of the library.
check(
  'the lanes are ranked by hours played, heaviest first',
  /[?&]lanes=new%2Csoulslike%2Copenworld%2Csurvival(&|$)/.test(laneCall()),
  laneCall().replace(/^.*\/api\/discover\?/, '') || '(no lanes call)'
)
check(
  'and the feed asks for the standing platform set',
  /[?&]platform=xbox%2Cpsn(&|$)/.test(laneCall()),
  laneCall().replace(/^.*\/api\/discover\?/, '')
)

/* ------------------------------------------------------------- the feed */

const r = await rows()
check('the feed rendered', r.length > 0, `${r.length} rows`)

// A round robin, so the top of the feed is one row per reason. Four lanes ran,
// so the first four rows must come from four different ones.
const firstFour = r.slice(0, 4).map((x) => x.why)
check(
  'the first four rows give four different reasons',
  new Set(firstFour).size === 4,
  firstFour.join(' | ')
)

check(
  'the platform lane leads and says so',
  r[0] && r[0].why === 'New on your platforms',
  r[0] ? `${r[0].name} :: ${r[0].why}` : '-'
)
check(
  'a taste lane names the game it was derived from',
  r.some((x) => x.why === 'Soulslike, like Dark Souls III'),
  r.map((x) => x.why).join(' | ')
)
check(
  'and it names the HEAVIEST one, not the most recent',
  !r.some((x) => x.why === 'Soulslike, like Kristala'),
  r.find((x) => /Kristala/.test(x.why || ''))?.why || 'Kristala not cited'
)

check(
  'a game two lanes both returned appears once',
  r.filter((x) => x.name === SHARED.name).length === 1,
  `${r.filter((x) => x.name === SHARED.name).length} rows named ${SHARED.name}`
)

check(
  'a game already in the library never reaches the feed',
  !r.some((x) => x.name === OWNED_IN_FEED),
  r.some((x) => x.name === OWNED_IN_FEED) ? `${OWNED_IN_FEED} offered` : 'hidden'
)

// Dropping the owned row must not cost the soulslike lane its turn: it should
// still contribute as many rows as it has unowned games.
check(
  'dropping an owned game does not cost its lane a turn',
  r.filter((x) => /^Soulslike/.test(x.why || '')).length === 3,
  `${r.filter((x) => /^Soulslike/.test(x.why || '')).length} soulslike rows of 3 unowned`
)

/* -------------------------------------------------------- one lane only */

await page.getByRole('button', { name: 'Survival', exact: true }).click()
await page.waitForTimeout(500)
const only = await rows()
check(
  'a lane chip narrows the feed to that lane',
  only.length === 3 && only.every((x) => /^Survival/.test(x.why || '')),
  `${only.length} rows :: ${[...new Set(only.map((x) => x.why))].join(' | ')}`
)

await page.getByRole('button', { name: 'All lanes', exact: true }).click()
await page.waitForTimeout(500)
check('and All lanes puts them back', (await rows()).length === r.length, `${(await rows()).length} vs ${r.length}`)

await page.screenshot({ path: 'repro/out/foryou.png', fullPage: true })
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
await page.waitForTimeout(300)
await page.screenshot({ path: 'repro/out/foryou-light.png', fullPage: true })

check('no page errors or console errors', problems.length === 0, problems.slice(0, 3).join(' || '))

await browser.close()
const failed = results.filter((x) => !x.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) console.log('FAILED: ' + failed.map((f) => f.name).join(', '))
process.exit(failed.length ? 1 : 0)
