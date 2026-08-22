/**
 * repro/stale.mjs - the sheet takes a colour and paints no key art.
 *
 * Dave's report, 22 Aug, against the shipped build: a wishlist sheet showed the
 * new tinted card and no backdrop at all.
 *
 * The network was never wrong. /api/discover?ids=340113 returns backdropId on
 * production, and /api/tint serves the 27KB jpeg for it. The wrong data was on
 * the DEVICE: `swr` returns a hit without revalidating for the whole of maxAge,
 * discover:game:<id> has a 7-day maxAge, and 1c1b809 added backdropId to the
 * cached record without bumping the SCHEMA prefix idbCache.js keeps for exactly
 * that. So every game opened in the previous week kept its pre-artworks record.
 *
 * That is why this fixture PINS THE NETWORK TO THE CORRECT SHAPE in every run.
 * The only variable is what is already on disk. A fixture that also varied the
 * response could not tell the two causes apart, and telling them apart is the
 * whole job.
 *
 * Run: PW_CHROME=... BASE=http://127.0.0.1:PORT node repro/stale.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://127.0.0.1:4173'
const ID = 340113
// Deliberately the OLD prefix. The fix does not delete these records, it stops
// reading them, so the assertion has to seed one under the key the old build
// wrote and watch the new build ignore it.
const OLD_KEY = `v1:discover:game:${ID}`
const NEW_KEY = `v2:discover:game:${ID}`

let pass = 0
let fail = 0
const check = (name, ok, detail = '') => {
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ::  ${detail}` : ''}`)
}

// The live payload, as deployed /api/discover?ids=340113 returns it today.
const FRESH = {
  id: ID, name: 'Star Wars Zero Company',
  summary: 'Command an elite squad through a gritty and authentic story.',
  cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big/coc7a0.jpg',
  coverId: 'coc7a0', year: 2026,
  release: { ts: 1787788800, precision: 'day', label: 'Aug 27, 2026' },
  rating: null, genres: ['Strategy'], platforms: ['Series X|S', 'PC', 'PS5'],
  screenshots: ['https://images.igdb.com/igdb/image/upload/t_screenshot_med/scwdbm.jpg'],
  artworks: ['https://images.igdb.com/igdb/image/upload/t_screenshot_med/ar5zgs.jpg'],
  backdropId: 'ar5zgs', backdropKind: 'artwork',
  companies: [{ name: 'Bit Reactor', developer: true }],
  url: 'https://www.igdb.com/games/star-wars-zero-company',
}
// The same record as written to disk BEFORE 1c1b809: identical but for the
// three fields that commit added.
const STALE = (() => {
  const s = { ...FRESH }
  delete s.artworks
  delete s.backdropId
  delete s.backdropKind
  return s
})()

const WISH_ROW = {
  igdb_id: ID, title: 'Star Wars Zero Company',
  cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big/coc7a0.jpg',
  year: 2026, note: null, created_at: '2026-08-01T00:00:00Z',
  released: 1787788800, date_precision: 'day', release_label: 'Aug 27, 2026',
  last_synced: null,
}

// Cover dark blue, key art warm orange. Different colour families on purpose,
// so the card's own colour says WHICH picture it came from.
const COVER_HEX = '#16344a'
const ART_HEX = '#c2601a'
const svg = (r, hex, w, h) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${hex}"/></svg>` })
const json = (r, b) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) })

const idb = {
  put: (page, key, value) =>
    page.evaluate(
      ([k, v]) =>
        new Promise((resolve) => {
          const req = indexedDB.open('gamedeck', 1)
          req.onupgradeneeded = () => {
            const db = req.result
            if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' })
          }
          req.onsuccess = () => {
            const tx = req.result.transaction('cache', 'readwrite')
            tx.objectStore('cache').put({ key: k, value: v, ts: Date.now() })
            tx.oncomplete = () => resolve(true)
            tx.onerror = () => resolve(false)
          }
          req.onerror = () => resolve(false)
        }),
      [key, value]
    ),
  get: (page, key) =>
    page.evaluate(
      (k) =>
        new Promise((resolve) => {
          const req = indexedDB.open('gamedeck', 1)
          req.onsuccess = () => {
            const g = req.result.transaction('cache', 'readonly').objectStore('cache').get(k)
            g.onsuccess = () => resolve(g.result ? g.result.value : null)
            g.onerror = () => resolve(null)
          }
          req.onerror = () => resolve(null)
        }),
      key
    ),
}

async function run(browser, { seedOld }) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()

  // Generic BEFORE specific: the LAST matching route wins in Playwright, so a
  // generic registered afterwards swallows the specific one.
  await page.route('**/rest/v1/**', (r) => json(r, []))
  await page.route('**/rest/v1/wishlist**', (r) => json(r, [WISH_ROW]))
  await page.route('**/api/**', (r) => json(r, {}))
  await page.route('**/api/discover**', (r) => json(r, { games: [FRESH] }))
  await page.route('**/api/tint**', (r) =>
    /kind=(artwork|screenshot)/.test(r.request().url())
      ? svg(r, ART_HEX, 569, 320)
      : svg(r, COVER_HEX, 90, 128)
  )
  await page.route('**/images.igdb.com/**', (r) => svg(r, COVER_HEX, 64, 90))
  await page.route('**/wsrv.nl/**', (r) => svg(r, COVER_HEX, 64, 90))

  await page.goto(BASE, { waitUntil: 'networkidle' })
  if (seedOld) {
    const written = await idb.put(page, OLD_KEY, STALE)
    // A seed that silently failed would make this harness prove nothing, so it
    // is read back rather than assumed.
    const back = await idb.get(page, OLD_KEY)
    check(
      'the pre-fix record really is on disk, and really has no backdropId',
      written && back && !Object.prototype.hasOwnProperty.call(back, 'backdropId'),
      `written: ${written}  keys: ${back ? Object.keys(back).length : 'none'}`
    )
  }
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(500)

  // The wishlist is a drawer overlay, not a tab. Reached the way a user reaches it.
  await page.locator('.brand-btn, .brand').first().click()
  await page.waitForTimeout(500)
  await page.locator('.drawer .menu-item', { hasText: /wishlist/i }).first().click()
  await page.waitForTimeout(1200)
  const card = await page.$('.wl-face, .wl-gc')
  if (!card) { await ctx.close(); return { opened: false } }
  await card.click()
  await page.waitForTimeout(2200)

  const out = await page.evaluate(() => {
    const s = document.querySelector('.modal-sheet')
    if (!s) return null
    const img = s.querySelector('.gs-hero-img')
    return {
      tint: s.style.getPropertyValue('--gs-tint'),
      hero: Boolean(img),
      heroSrc: img ? img.getAttribute('src') : null,
    }
  })
  const wroteNew = await idb.get(page, NEW_KEY)
  const oldStill = await idb.get(page, OLD_KEY)
  await ctx.close()
  return { opened: true, ...out, wroteNew: Boolean(wroteNew && wroteNew.backdropId), oldStill: Boolean(oldStill) }
}

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME })
const seeded = await run(browser, { seedOld: true })
const clean = await run(browser, { seedOld: false })
console.log('seeded:', JSON.stringify(seeded))
console.log('clean: ', JSON.stringify(clean))

check('both runs opened a sheet', seeded.opened && clean.opened, `seeded ${seeded.opened}  clean ${clean.opened}`)

// The report, and the fix for it. A device carrying the pre-fix record must
// paint the key art anyway, because the key it is filed under is no longer read.
check(
  'a device carrying the pre-fix record still paints the key art',
  seeded.opened && seeded.hero === true,
  `hero: ${seeded.hero}  src: ${seeded.heroSrc}`
)
check(
  'and its colour comes from the key art, not the cover',
  seeded.tint === clean.tint,
  `seeded ${seeded.tint}  clean ${clean.tint}`
)
// This is what separates the fix from a coincidence: it went to the network and
// filed the answer under the new key.
check(
  'because it refetched and filed the answer under the new key',
  seeded.wroteNew === true,
  `v2 record with backdropId: ${seeded.wroteNew}`
)
// Honest about what the fix does NOT do. The old record is orphaned, not
// deleted, and saying so here stops a future reader assuming a cleanup exists.
check(
  'the old record is left where it was - orphaned, not deleted',
  seeded.oldStill === true,
  `v1 key still present: ${seeded.oldStill}`
)
check('a clean device paints it too', clean.opened && clean.hero === true, `hero: ${clean.hero}`)

await browser.close()
console.log(`\n${pass}/${pass + fail} passed`)
process.exit(fail ? 1 : 0)
