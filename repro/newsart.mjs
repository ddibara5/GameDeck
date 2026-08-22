/**
 * repro/newsart.mjs - where News story art is fetched from, and how big.
 *
 * The tab hotlinked the publisher's own asset: nine press CDNs across one week
 * of stories, at whatever size the publisher happened to store, into a 64px
 * square. Three separate problems in one line of markup:
 *
 *   - NOT CACHED. sw.js cache-firsts `images.igdb.com` and `wsrv.nl`; every
 *     other cross-origin request hits `if (url.origin !== self.location.origin)
 *     return` and is not cached at all. Every visit to News refetched all of it.
 *   - NOT SIZED. One row's real image is a 1600px flickr original.
 *   - HOTLINKED FROM THIS ORIGIN, so a host with referer-based hotlink
 *     protection is entitled to refuse, which looks from here like a broken
 *     image and is indistinguishable from one.
 *
 * And four rows in the live table hold `?w=400&#038;h=600` - HTML entities the
 * ingest never decoded - which is not an address and can never load.
 *
 * The last assertion is the one worth having: it parses the SERVED sw.js and
 * requires every host the tab actually asks for to be inside the worker's
 * cache-first branch. That is the claim "these are cached" stated as something
 * that breaks when it stops being true, rather than as a comment.
 *
 * Run: PW_CHROME=... BASE=http://127.0.0.1:4173 node repro/newsart.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://127.0.0.1:4173'
const results = []
const check = (name, ok, got) => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${got !== undefined ? `  ::  ${got}` : ''}`)
}

const WEEK = '2026-08-17'
const src = (n, u) => ({ name: n, url: u })

// Every row here is a real shape from the live table.
const ENTITY_URL =
  'https://store-images.s-microsoft.com/image/apps.40582.140627.a1b2.c3d4.jpg?w=400&#038;h=600'
const PLAIN_URL =
  'https://live.staticflickr.com/65535/55448091777_338691e2dc_h.jpg'
const DEAD_URL =
  'https://assets-prd.ignimgs.com/2026/08/21/this-one-is-gone-1787336530884.png'
const COVER = 'https://images.igdb.com/igdb/image/upload/t_cover_big/cocaa5.jpg'

const NEWS = [
  { id: 1, week_of: WEEK, rank: 0, title: 'Entity-encoded article image',
    summary: 'A row whose image url arrived HTML-escaped.', image_url: ENTITY_URL,
    primary_url: 'https://example.com/a', sources: [src('Xbox Wire', 'https://example.com/a')],
    published_at: '2026-08-21T12:00:00Z', created_at: '2026-08-21T18:00:00Z',
    game_name: null, game_igdb_id: null, game_cover: null },
  { id: 2, week_of: WEEK, rank: 1, title: 'Plain press-CDN article image',
    summary: 'The ordinary case: a 1600px original in a 64px square.', image_url: PLAIN_URL,
    primary_url: 'https://example.com/b', sources: [src('IGN', 'https://example.com/b')],
    published_at: '2026-08-21T11:00:00Z', created_at: '2026-08-21T18:00:00Z',
    game_name: null, game_igdb_id: null, game_cover: null },
  { id: 3, week_of: WEEK, rank: 2, title: 'Article image that fails, cover behind it',
    summary: 'The chain has to advance, not blank the tile.', image_url: DEAD_URL,
    primary_url: 'https://example.com/c', sources: [src('GameSpot', 'https://example.com/c')],
    published_at: '2026-08-21T10:00:00Z', created_at: '2026-08-21T18:00:00Z',
    game_name: 'Grand Theft Auto VI', game_igdb_id: 52189, game_cover: COVER },
  { id: 4, week_of: WEEK, rank: 3, title: 'Cover only, no article image',
    summary: 'The 52-of-138 case.', image_url: null,
    primary_url: 'https://example.com/d', sources: [src('IGN', 'https://example.com/d')],
    published_at: '2026-08-21T09:00:00Z', created_at: '2026-08-21T18:00:00Z',
    game_name: 'Grand Theft Auto VI', game_igdb_id: 52189, game_cover: COVER },
  { id: 5, week_of: WEEK, rank: 4, title: 'Neither image nor cover',
    summary: 'The 20-of-138 case. An empty tile is correct here.', image_url: null,
    primary_url: 'https://example.com/e', sources: [src('Eurogamer', 'https://example.com/e')],
    published_at: '2026-08-21T08:00:00Z', created_at: '2026-08-21T18:00:00Z',
    game_name: null, game_igdb_id: null, game_cover: null },
]

const SVG = (w, h, fill) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${fill}"/></svg>`

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, serviceWorkers: 'block' })
const page = await ctx.newPage()
const asked = []
const json = (r, b) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) })

await page.route('**/rest/v1/**', (r) => json(r, []))
await page.route('**/rest/v1/news**', (r) => json(r, NEWS))
await page.route('**/rest/v1/games**', (r) => json(r, []))
await page.route('**/api/**', (r) => json(r, {}))
await page.route('**/www.google.com/s2/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: SVG(16, 16, '#888') }))
// Everything that is or claims to be art. Recorded, then answered - except the
// one url standing in for a dead publisher asset, which 404s so the fallback
// chain has something real to fall back FROM.
for (const pat of ['**images.igdb.com/**', '**wsrv.nl/**', '**staticflickr.com/**', '**s-microsoft.com/**', '**ignimgs.com/**']) {
  await page.route(pat, (r) => {
    const u = r.request().url()
    asked.push(u)
    if (u.includes(encodeURIComponent(DEAD_URL)) || u.includes('this-one-is-gone')) {
      return r.fulfill({ status: 404, body: '' })
    }
    return r.fulfill({ status: 200, contentType: 'image/svg+xml', body: SVG(264, 374, '#2f4a63') })
  })
}

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.evaluate(() => { try { localStorage.setItem('gamedeck_theme_v1', 'dark') } catch { /* private mode */ } })
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(700)
try {
  await page.getByRole('button', { name: /^News/ }).first().click({ timeout: 4000 })
} catch {
  await page.locator('.brand-btn').first().click()
  await page.waitForTimeout(400)
  await page.locator('.drawer .menu-item', { hasText: /news/i }).first().click()
}
await page.waitForTimeout(1800)
// loading="lazy" means a row below the fold is never fetched, and an unfetched
// image cannot be asserted about. Scroll the list so every row is real.
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
await page.waitForTimeout(1200)
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(600)

const rows = await page.evaluate(() =>
  [...document.querySelectorAll('.news-row')].map((el) => ({
    title: el.querySelector('.news-row-title')?.textContent?.trim() || '',
    img: el.querySelector('.news-row-thumb img')?.getAttribute('src') || null,
    noart: !!el.querySelector('.news-row-noart'),
  })))

check('all five stories render', rows.length === 5, rows.length)

// 1. Nothing is hotlinked. Both allowed hosts are exactly the two the service
//    worker cache-firsts, which is the whole point of routing through them.
const CDN = ['wsrv.nl', 'images.igdb.com']
const hostOf = (u) => { try { return new URL(u).hostname } catch { return '?' } }
const imgHosts = [...new Set(rows.filter((r) => r.img).map((r) => hostOf(r.img)))]
check('every thumbnail is served from a cached CDN host', imgHosts.every((h) => CDN.includes(h)), imgHosts.join(', '))

const askedHosts = [...new Set(asked.map(hostOf))]
check('no press CDN is requested directly', askedHosts.every((h) => CDN.includes(h)), askedHosts.join(', '))

// 2. The entity-encoded url is DECODED before it is handed to the CDN. The
//    inner url has to come back as a working address, not as the escaped text.
const entityRow = rows.find((r) => r.title.startsWith('Entity-encoded'))
const inner = (() => {
  try { return new URL(entityRow.img).searchParams.get('url') } catch { return null }
})()
check('the entity-encoded url is decoded', inner != null && inner.includes('?w=400&h=600') && !inner.includes('&#038;'), inner ? inner.slice(-24) : 'none')

// 3. Everything is asked for at the size of the slot it is going into.
const widthOf = (u) => { try { return Number(new URL(u).searchParams.get('w')) || null } catch { return null } }
const rowWidths = [...new Set(rows.filter((r) => r.img).map((r) => widthOf(r.img)))]
check('every row thumbnail is requested at 128px', rowWidths.length === 1 && rowWidths[0] === 128, rowWidths.join(', '))

// 4. An IGDB cover still cannot be asked to enlarge past its bucket.
const coverAsks = asked.filter((u) => u.includes(encodeURIComponent('images.igdb.com')) || hostOf(u) === 'images.igdb.com')
const overBucket = coverAsks.filter((u) => (widthOf(u) || 0) > 264)
check('no IGDB cover is asked to upscale past t_cover_big', overBucket.length === 0, overBucket.length ? overBucket[0].slice(0, 70) : 'none')

// 5. A dead article image drops to the game's cover rather than blanking.
const deadRow = rows.find((r) => r.title.startsWith('Article image that fails'))
const deadInner = (() => { try { return new URL(deadRow.img).searchParams.get('url') || deadRow.img } catch { return deadRow.img } })()
check('a dead article image falls back to the cover', !deadRow.noart && /cocaa5/.test(deadInner || ''), deadRow.noart ? 'blank' : String(deadInner).slice(-28))

// 6. Neither: an empty tile, and no <img> pretending to be one.
const emptyRow = rows.find((r) => r.title.startsWith('Neither'))
check('a story with no art at all draws an empty tile', emptyRow.noart && !emptyRow.img, emptyRow.noart ? 'empty tile' : 'has an image')

// 7. The sheet asks for a bigger picture than the row. Opened on the PRESS-CDN
//    row on purpose: the cover-only row answers this with 264 whatever the band
//    asks for, because an IGDB bucket cap is still in front of it, and a number
//    the assertion cannot move is not an assertion.
const openSheet = async (titleStart) => {
  await page.locator('.news-row', { hasText: titleStart }).first().click()
  await page.waitForTimeout(1100)
  const out = await page.evaluate(() => ({
    img: document.querySelector('.ns-band-img')?.getAttribute('src') || null,
    fill: document.querySelector('.ns-band-fill')?.getAttribute('src') || null,
  }))
  // The sheet has no Escape handler and no close button: it is dismissed by
  // tapping the backdrop, and the tap has to land on the backdrop ITSELF, so it
  // goes at the top of the viewport above the sheet's own box.
  await page.mouse.click(196, 6)
  await page.waitForTimeout(800)
  return out
}

const article = await openSheet('Plain press-CDN article image')
const bandW = article.img ? widthOf(article.img) : null
check('the sheet band asks for a full-width picture', bandW === 800, `${bandW}`)
check('...from the same cached host', article.img != null && CDN.includes(hostOf(article.img)), article.img ? hostOf(article.img) : 'none')

// A cover in the band takes the bucket cap instead, and its blurred backdrop -
// scaled 140% and blurred 24px - is fetched smaller still.
const covered = await openSheet('Cover only, no article image')
const coverBandW = covered.img ? widthOf(covered.img) : null
const fillW = covered.fill ? widthOf(covered.fill) : null
check('a cover in the band keeps its bucket cap', coverBandW === 264, `${coverBandW}`)
check('the blurred fill asks for less than the sharp copy', fillW != null && coverBandW != null && fillW < coverBandW, `fill ${fillW} vs band ${coverBandW}`)

// 8. The worker and the app agree. Parsed from the SERVED sw.js rather than
//    asserted from memory, so this fails if either side moves.
const swText = await page.evaluate(async () => (await fetch('/sw.js')).text())
const branch = swText.slice(swText.indexOf('const { request } = event'))
const swHosts = CDN.filter((h) => branch.includes(`'${h}'`) || branch.includes(`"${h}"`))
check('sw.js cache-firsts every host the tab uses', swHosts.length === CDN.length, swHosts.join(', '))
const limit = Number((swText.match(/IMG_CACHE_LIMIT\s*=\s*(\d+)/) || [])[1] || 0)
check('the image cache is big enough for covers and news together', limit >= 400, limit)

await browser.close()
const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
