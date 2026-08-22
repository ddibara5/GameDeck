/**
 * Does the Library still render a "Continue playing" rail?
 *
 * Run against BOTH builds. The fixture is built so the rail WOULD appear: ten
 * games played inside the last few days, no game_status rows, so every one of
 * them is `playing` by the recency rule HomeShelf filtered on. A fixture that
 * cannot exhibit the thing reads as a pass, which is how this check would have
 * been worthless.
 */
import { chromium } from 'playwright'
const BASE = process.env.BASE || 'http://127.0.0.1:4173'
const EXPECT = process.env.EXPECT // 'present' | 'absent'
const NAMES = ['Persona 5 Royal', 'Kristala', 'Crimson Desert', 'Mistfall Hunter', 'Where Winds Meet',
  'Beast of Reincarnation', 'Dinoblade', 'Hades II', 'Satisfactory', 'Corsair Cove']
const games = NAMES.map((title, i) => ({
  master_id: i + 1, title, environment: 'xbox', playtime_minutes: 600 + i * 90, playtime_label: '10h',
  last_played: new Date(Date.now() - i * 3600000 * 8).toISOString(), earned_awards: 5, total_awards: 20,
  percent: 25, cover_igdb: null, cover_small: null, igdb_id: 100 + i, igdb_rating: 85, release_year: 2025,
  genre: 'Role-playing (RPG)', length_minutes: 3000, keywords: ['soulslike'], platforms: ['Xbox'],
}))
const browser = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'block', timezoneId: 'America/New_York' })
const page = await ctx.newPage()
const problems = []
page.on('pageerror', (e) => problems.push('pageerror :: ' + e.message))
const json = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
await page.route('**/rest/v1/**', (r) => json(r, r.request().url().includes('/games') ? games : []))
await page.route('**/api/**', (r) => json(r, {}))
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.locator('.tabbar-btn', { hasText: 'Library' }).first().click()
await page.waitForTimeout(1200)
const s = await page.evaluate(() => ({
  shelves: document.querySelectorAll('.shelf').length,
  titles: [...document.querySelectorAll('.shelf-title')].map((e) => e.textContent),
  posters: document.querySelectorAll('.shelf-poster').length,
  rows: document.querySelectorAll('.game-card').length,
  firstRow: (document.querySelector('.game-title') || {}).textContent || null,
  // the top of the list, measured: how far down the page the first game sits
  firstRowTop: Math.round((document.querySelector('.game-card') || { getBoundingClientRect: () => ({ top: -1 }) }).getBoundingClientRect().top),
}))
console.log(JSON.stringify(s))
const present = s.shelves > 0 && s.titles.includes('Continue playing')
let ok = true
const check = (n, p, g) => { if (!p) ok = false; console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${g !== undefined ? '  ::  ' + g : ''}`) }
if (EXPECT === 'present') {
  check('the fixture DOES produce a Continue playing rail on this build', present, s.titles.join('|'))
  check('and the rail has posters in it', s.posters >= 5, s.posters)
} else {
  check('no Continue playing rail', !present, s.titles.join('|') || '(no .shelf-title)')
  check('no shelf of any kind on the Library tab', s.shelves === 0, s.shelves)
  check('the list still renders', s.rows >= 10, s.rows)
  check('the first game is the most recently played', s.firstRow === 'Persona 5 Royal', s.firstRow)
  check('the list starts higher up the page', s.firstRowTop > 0 && s.firstRowTop < 320, s.firstRowTop)
}
check('no page errors', problems.length === 0, problems.join(' | '))
await browser.close()
process.exit(ok ? 0 : 1)
