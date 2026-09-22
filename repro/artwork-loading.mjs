// Run with Playwright installed: node repro/artwork-loading.mjs
// Optional PLAYWRIGHT_MODULE, PW_CHROME and PW_LAMBDA_ARGS support CI runtimes.
import assert from 'node:assert/strict'
import { createServer } from '../web/node_modules/vite/dist/node/index.js'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const args = process.env.PW_LAMBDA_ARGS ? (await import(process.env.PW_LAMBDA_ARGS)).default.args : []
const server = await createServer({ root: new URL('../web/', import.meta.url).pathname, server: { host: '127.0.0.1', port: 0 } })
let browser
const art = (id) => `https://images.igdb.com/igdb/image/upload/t_cover_big/${id}.jpg`
const games = Array.from({ length: 20 }, (_, i) => ({ master_id: i + 1, title: `Fixture ${i + 1}`, cover_igdb: art(`rank${i + 1}`), playtime_minutes: 60 }))
const ranks = games.map((game, i) => ({ master_id: game.master_id, score: 2000 - i, comparison_count: 2, reaction: 'loved' }))
const pixel = '<svg xmlns="http://www.w3.org/2000/svg" width="192" height="272"><rect width="192" height="272" fill="teal"/></svg>'
try {
  await server.listen()
  browser = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined, args })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true })
  const errors = []
  page.on('pageerror', error => (errors.push(error.message), console.error(error.message)))
  const requests = []
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/__artwork-test') return route.fulfill({ contentType: 'text/html', body: await server.transformIndexHtml('/__artwork-test', '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/test/fixtures/artwork-loading.jsx"></script>') })
    if (url.hostname.endsWith('.supabase.co')) {
      if (route.request().method() !== 'GET') return route.abort()
      const rows = url.pathname.endsWith('/games') ? games : url.pathname.endsWith('/game_ranks') ? ranks : []
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) })
    }
    if (url.hostname === 'wsrv.nl' || url.hostname === 'images.igdb.com') {
      requests.push(url.href)
      await new Promise(resolve => setTimeout(resolve, 300))
      if (url.hostname === 'wsrv.nl' && url.searchParams.get('url')?.includes('fallback')) return route.fulfill({ status: 503, body: '' })
      return route.fulfill({ contentType: 'image/svg+xml', headers: { 'Cache-Control': 'public, max-age=3600' }, body: pixel })
    }
    if (url.hostname !== '127.0.0.1') return route.abort()
    return route.continue()
  })
  await page.goto(server.resolvedUrls.local[0] + '__artwork-test')
  await page.waitForFunction(() => window.artworkTest)
  const show = (view) => page.evaluate(view => window.artworkTest.show(view), view)
  const ready = () => page.waitForFunction(() => { const img = document.querySelector('.cover img'); return img?.complete && img.naturalWidth > 0 })

  // Cold visible cover; 64 CSS pixels at 3x should select 192px, not 264px.
  await show('cover')
  await ready()
  assert.equal(new URL(await page.locator('.cover img').evaluate(el => el.currentSrc)).searchParams.get('w'), '192')
  const initialRequests = requests.length
  await show('empty')
  const repeat = await page.evaluate(() => {
    window.artworkTest.show('repeat')
    const img = document.querySelector('.cover img')
    return { loading: img.loading, decoding: img.decoding }
  })
  assert.deepEqual(repeat, { loading: 'eager', decoding: 'sync' })
  await ready()
  assert.equal(requests.length, initialRequests, 'repeat cover downloaded again')

  // A failed resize service should not be tried again on every navigation.
  await page.evaluate(src => window.artworkTest.source(src), art('fallback'))
  await ready()
  assert.equal(await page.locator('.cover img').evaluate(el => el.currentSrc), art('fallback'))
  const afterFallback = requests.length
  await show('empty')
  await show('repeat')
  await ready()
  assert.equal(requests.length, afterFallback, 'remount retried the failed CDN')

  await show('empty')
  await page.evaluate(src => window.artworkTest.source(src), art('offscreen'))
  const beforeOffscreen = requests.length
  await show('offscreen')
  await page.waitForTimeout(400)
  assert.equal(await page.locator('.cover img').getAttribute('loading'), 'lazy')
  assert.equal(requests.length, beforeOffscreen, 'cold offscreen art was eagerly fetched')
  await show('empty')

  // Warm actual Rankings data and eight covers, then mount the actual page.
  const beforeWarm = requests.length
  await page.evaluate(() => window.artworkTest.warmRankings())
  const warmedRequests = requests.slice(beforeWarm)
  assert.equal(warmedRequests.length, 8)
  assert.ok(warmedRequests.every(url => new URL(url).searchParams.get('w') === '192'))
  await show('rankings')
  await page.waitForSelector('.rank-item:nth-child(8) img')
  await page.waitForFunction(() => [...document.querySelectorAll('.rank-item img')].slice(0, 8).every(img => img.complete && img.naturalWidth > 0))
  const firstEight = await page.locator('.rank-item img').evaluateAll(images => images.slice(0, 8).map(img => ({ loading: img.loading, priority: img.fetchPriority, sizes: img.sizes })))
  assert.ok(firstEight.every(img => img.loading === 'eager' && img.priority === 'high' && img.sizes === '64px'))
  assert.equal(requests.filter(url => warmedRequests.includes(url)).length, 8, 'Rankings downloaded a second version of warmed art')
  await show('empty')
  const beforeCancel = requests.length
  await page.evaluate(() => window.artworkTest.warmRankings(() => true))
  assert.equal(requests.length, beforeCancel, 'cancelled warm-up requested artwork')
  const homePreview = await page.evaluate(() => {
    window.artworkTest.seedHome({ deck: [{ game: { id: 123, title: 'Home cached cover', artwork: 'https://images.igdb.com/igdb/image/upload/t_cover_big/fixture.jpg' } }] })
    window.artworkTest.show('home')
    const first = document.querySelector('section[aria-label="For You"] img')?.alt
    window.artworkTest.show('empty')
    window.artworkTest.show('home')
    const second = document.querySelector('section[aria-label="For You"] img')?.alt
    window.artworkTest.show('empty')
    return [first, second]
  })
  assert.deepEqual(homePreview, ['Home cached cover', 'Home cached cover'], 'Home preview disappeared during remount')
  assert.deepEqual(errors, [])
  console.log('PASS: 3x responsive sizing; repeat navigation cache; CDN fallback reuse; offscreen lazy loading; eight-cover Rankings warm-up and cancellation; real Rankings priorities; real Home preview on first render and remount.')
} finally {
  if (browser) await browser.close()
  await server.close()
}
