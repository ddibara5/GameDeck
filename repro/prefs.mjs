/**
 * repro/prefs.mjs - Discover's standing preferences, against the BUILT app.
 *
 * The bug this locks down is not a rendering bug, which is why it needs a
 * harness rather than a look: hide-owned and the platform picker both EXISTED
 * before this change and both worked. They were component state, so they reset
 * on every mount, and the same two choices had to be made on every visit. A
 * screenshot of a correctly filtered Discover cannot tell you whether the filter
 * was remembered or whether you just set it.
 *
 * So the assertions here are about memory and about the request, not about
 * pixels: what the batched rail call actually asks IGDB for on a cold start,
 * whether it survives a reload, and whether Reset in the filter sheet leaves the
 * standing preference alone (it must - every other group in that sheet is a
 * one-off narrowing and this one is not).
 *
 * Run: PW_CHROME=... BASE=http://127.0.0.1:4173 node repro/prefs.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://127.0.0.1:4173'
const results = []
const check = (name, pass, got) => {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${got !== undefined ? `  ::  ${got}` : ''}`)
}

// One of these is in the stubbed library below, so it must disappear from every
// rail while hide-owned is on and come back the moment it is off. Without a
// deliberate overlap the hide-owned assertion passes against a filter that does
// nothing.
const OWNED_NAME = 'Clair Obscur: Expedition 33'
const NAMES = [
  'Hollow Knight: Silksong', OWNED_NAME, 'Blue Prince', 'Split Fiction',
  'Kingdom Come: Deliverance II', 'Avowed', 'Monster Hunter Wilds', 'Doom: The Dark Ages',
]
const day = (n) => Math.floor((Date.now() + n * 86400000) / 1000)
const rail = (seed) =>
  NAMES.map((name, i) => ({
    id: seed * 100 + i, name, cover: null, year: 2025, rating: 80 + ((i + seed) % 15),
    released: day((i - 4) * 30), genres: ['Adventure'], platforms: ['Xbox', 'PC'],
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

// Every /api/discover URL the app asks for, in order. This is the actual
// subject of most of the file.
const asked = []
const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
await page.route('**/rest/v1/**', (route) =>
  route.request().url().includes('/games') ? json(route, [{ title: OWNED_NAME }]) : json(route, [])
)
// Generic first: Playwright matches the LAST registered route.
await page.route('**/api/**', (route) => json(route, {}))
await page.route('**/api/discover**', (route) => {
  asked.push(route.request().url())
  return json(route, { rails: { popular: rail(1), upcoming: rail(2), recent: rail(3), highly_rated: rail(4) } })
})
const stub = (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>' })
await page.route('**/wsrv.nl/**', stub)
await page.route('**/images.igdb.com/**', stub)

// Discover lands on the For you feed now, and everything in this file is about
// Browse, so every visit here goes through the segment. Deliberately not
// changed to assert on whichever segment happens to be first: the two surfaces
// answer different questions and this one is Browse's.
const openDiscover = async () => {
  await page.getByRole('button', { name: /^Discover/ }).first().click()
  await page.waitForTimeout(400)
  await page.getByRole('tab', { name: 'Browse', exact: true }).click()
  await page.waitForTimeout(1500)
}
const homeCalls = () => asked.filter((u) => u.includes('home='))
const lastHome = () => homeCalls()[homeCalls().length - 1] || ''
const strip = () =>
  page.evaluate(() => {
    const el = document.querySelector('.showing-strip')
    if (!el) return null
    return {
      chips: [...el.querySelectorAll('.showing-chip')].map((c) => c.textContent.trim()),
      button: el.querySelector('.showing-clear')?.textContent.trim() || null,
    }
  })
const railNames = () =>
  page.evaluate(() => [...document.querySelectorAll('.discover-browse .shelf-card-title')].map((e) => e.textContent.trim()))

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await openDiscover()

/* ------------------------------------------- cold start, nothing stored */

check(
  'a cold start already asks IGDB for Xbox and PlayStation only',
  /[?&]platform=xbox%2Cpsn(&|$)/.test(lastHome()),
  lastHome().replace(/^.*\/api\/discover\?/, '') || '(no home call)'
)

const s1 = await strip()
check('the strip says what is being hidden', Boolean(s1), s1 ? JSON.stringify(s1) : '(no strip)')
check(
  'and names the standing platform set',
  Boolean(s1) && s1.chips.includes('Xbox + PlayStation'),
  s1 ? s1.chips.join(' | ') : '-'
)
check(
  'and says in-library games are out',
  Boolean(s1) && s1.chips.includes('Not in library'),
  s1 ? s1.chips.join(' | ') : '-'
)

const n1 = await railNames()
check('rails rendered', n1.length > 0, `${n1.length} cards`)
check(
  'a game already in the library is not offered as a discovery',
  n1.length > 0 && !n1.includes(OWNED_NAME),
  n1.includes(OWNED_NAME) ? `${OWNED_NAME} still on screen` : 'hidden'
)

/* ------------------------------------------------ the session escape hatch */

await page.click('.showing-clear')
await page.waitForTimeout(1200)
check(
  'Everything drops the platform narrowing from the request',
  !/[?&]platform=/.test(lastHome()),
  lastHome().replace(/^.*\/api\/discover\?/, '')
)
const n2 = await railNames()
check(
  'and gives the owned game back',
  n2.includes(OWNED_NAME),
  n2.includes(OWNED_NAME) ? 'shown' : 'still hidden'
)

/* ----------------------------------------------------- and it is session only */

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await openDiscover()
const s2 = await strip()
check(
  'Everything does not survive a reload',
  Boolean(s2) && !s2.chips.includes('Everything') && s2.chips.includes('Not in library'),
  s2 ? s2.chips.join(' | ') : '(no strip)'
)

/* ------------------------------------------------- a changed set persists */

await page.click('.discover-searchbar .filter-btn')
await page.waitForTimeout(300)
await page.getByRole('button', { name: 'Switch', exact: true }).click()
await page.waitForTimeout(300)
// Reset clears the one-off groups. It must NOT clear this one.
await page.getByRole('button', { name: 'Reset', exact: true }).click()
await page.waitForTimeout(300)
await page.getByRole('button', { name: 'Show results', exact: true }).click()
await page.waitForTimeout(1200)
const s3 = await strip()
check(
  'Reset leaves the standing platform set alone',
  Boolean(s3) && s3.chips.includes('Xbox + PlayStation + Switch'),
  s3 ? s3.chips.join(' | ') : '(no strip)'
)

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await openDiscover()
const s4 = await strip()
check(
  'and the chosen set is still there on the next visit',
  Boolean(s4) && s4.chips.includes('Xbox + PlayStation + Switch'),
  s4 ? s4.chips.join(' | ') : '(no strip)'
)
check(
  'which is what the request asks for too',
  /[?&]platform=xbox%2Cpsn%2Cswitch(&|$)/.test(lastHome()),
  lastHome().replace(/^.*\/api\/discover\?/, '')
)

await page.screenshot({ path: 'repro/out/prefs-standing.png', fullPage: true })

check('no page errors or console errors', problems.length === 0, problems.slice(0, 3).join(' || '))

await browser.close()
const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) console.log('FAILED: ' + failed.map((f) => f.name).join(', '))
process.exit(failed.length ? 1 : 0)
