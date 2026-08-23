/**
 * repro/groundfast.mjs - the ground paints before the app does.
 *
 * Measured at 420ms Supabase latency before this change, three launches in a row
 * on `nowplaying`: launch one showed no art at all (the library cache is empty
 * when initGround runs), launch two painted at 927ms, launch three at 437ms - and
 * it stayed at 437 forever, because every launch redid a resolve that produced
 * the same answer as the last one.
 *
 * The assertions are about ORDER, not about a duration: the art has to be on the
 * root element BEFORE React has put `.app` in the document. A millisecond budget
 * would pass on a fast machine with the old code; "before the app shell" cannot.
 *
 * Both marks are taken INSIDE the page from an init script, because a Playwright
 * poll cannot tell a first-frame paint from one 80ms later.
 *
 * Run: PW_CHROME=... BASE=http://127.0.0.1:4173 node repro/groundfast.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://127.0.0.1:4173'
const LAT = Number(process.env.LAT || 420)
const results = []
const check = (name, ok, got) => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${got !== undefined ? `  ::  ${got}` : ''}`)
}

const games = Array.from({ length: 40 }, (_, i) => ({
  master_id: i + 1, title: 'Game ' + i, environment: 'xbox', playtime_minutes: 600,
  playtime_label: '10h', last_played: new Date(1787000000000 - i * 36e5).toISOString(),
  earned_awards: 5, total_awards: 20, percent: 25, cover_igdb: 'coclf1', cover_small: null,
  igdb_id: 100 + i, igdb_rating: 85, release_year: 2025, genre: 'RPG', length_minutes: 3000,
  platforms: ['Xbox'], updated_at: '2026-08-20T00:00:00Z', franchises: ['F'],
}))

// A picture per id, so "did the picture change" is answerable from the url.
const ART = (id) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">` +
  `<rect width="640" height="360" fill="#${(Number(String(id).replace(/\D/g, '')) % 5) + 3}a5f42"/>` +
  `<circle cx="470" cy="86" r="60" fill="#e8dfd0"/></svg>`

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME })

// One context across all launches: the point of the whole change is what the
// SECOND and THIRD launch cost, which only exists if the profile persists.
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'block' })

const tintHits = []
async function launch({ theme = 'dark', ground = 'nowplaying', deadArt = false } = {}) {
  const page = await ctx.newPage()
  const json = (r, x, d) => setTimeout(() => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) }), d)
  await page.route('**/rest/v1/**', (r) => json(r, r.request().url().includes('/games') ? games : [], LAT))
  await page.route('**/api/tint**', (r) => {
    const id = (/[?&]id=([^&]*)/.exec(r.request().url()) || [, '0'])[1]
    tintHits.push(id)
    if (deadArt) return setTimeout(() => r.fulfill({ status: 404, body: '' }), 120)
    setTimeout(() => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: ART(id) }), 120)
  })
  await page.route('**/api/**', (r) => {
    const u = r.request().url()
    if (u.includes('/api/tint')) return r.fallback()
    const ids = /[?&]ids=([^&]*)/.exec(u)
    if (ids) {
      return json(r, { games: decodeURIComponent(ids[1]).split(',').map((id) => ({
        id: Number(id), name: 'g', coverId: 'coclf1', backdropId: 'ar' + id, backdropKind: 'artwork',
        genres: [], keywords: [], themes: [], platforms: [], companies: [] })) }, LAT)
    }
    return json(r, { games: [] }, LAT)
  })
  const px = (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>' })
  await page.route('**images.igdb.com/**', px)
  await page.route('**wsrv.nl/**', px)
  await page.addInitScript(({ t, g }) => {
    try {
      localStorage.setItem('gamedeck_theme_v1', t)
      localStorage.setItem('gamedeck_ground_v1', g)
    } catch { /* private mode */ }
  }, { t: theme, g: ground })
  // Both marks come from inside the page. A Playwright poll cannot separate a
  // first-frame paint from one 80ms later, and "before the app shell" is the
  // whole claim.
  await page.addInitScript(() => {
    window.__t0 = performance.now()
    const hasArt = () => {
      const s = document.documentElement.style.getPropertyValue('--ground-src')
      return Boolean(s && s.startsWith('url('))
    }
    const mark = () => {
      if (hasArt() && window.__art == null) window.__art = performance.now() - window.__t0
      if (document.querySelector('.app') && window.__app == null) {
        window.__app = performance.now() - window.__t0
        // The claim is ORDER, and two timestamps taken in the same animation
        // frame are equal - which failed a strict `<` on a correct build. This
        // is the same question asked once: at the instant React first put .app
        // in the document, was the ground already on the root element?
        window.__artBeforeApp = hasArt()
      }
      if (window.__art == null || window.__app == null) requestAnimationFrame(mark)
    }
    requestAnimationFrame(mark)
  })
  await page.goto(BASE)
  await page.waitForTimeout(3800)
  const out = await page.evaluate(() => ({
    art: window.__art == null ? null : Math.round(window.__art),
    app: window.__app == null ? null : Math.round(window.__app),
    first: window.__artBeforeApp === true,
    attr: document.documentElement.getAttribute('data-ground'),
    src: document.documentElement.style.getPropertyValue('--ground-src'),
    veil: document.documentElement.style.getPropertyValue('--ground-veil-a'),
    paint: (() => { try { return JSON.parse(localStorage.getItem('gamedeck_ground_paint_v1') || 'null') } catch { return null } })(),
  }))
  await page.close()
  return out
}

/* ---------- 1. nowplaying: cold, then remembered ---------- */
const n1 = await launch()
check('a first launch with an empty library cache falls back to the wash', n1.attr === 'wash' && n1.art === null, `${n1.attr}, art ${n1.art}`)
const n2 = await launch()
check('the second launch resolves the picture', n2.attr === 'nowplaying' && n2.art !== null, `art at ${n2.art}ms`)
check('...and writes it down with a veil for this theme',
  Boolean(n2.paint?.nowplaying?.src && n2.paint?.nowplaying?.veil?.dark), JSON.stringify(n2.paint?.nowplaying?.veil))
const n3 = await launch()
check('the third launch has the art on the root before React renders .app',
  n3.first, `art ${n3.art}ms, app shell ${n3.app}ms, already there: ${n3.first}`)
check('...from the same picture, not a different one', n3.src === n2.src, n3.src.slice(0, 44))

/* ---------- 2. a veil is per theme, and is never borrowed ---------- */
const beforeTint = tintHits.length
const l1 = await launch({ theme: 'light' })
const lv = l1.paint?.nowplaying?.veil
check('switching theme re-measures rather than borrowing the other veil',
  tintHits.length > beforeTint && Boolean(lv?.light && lv?.dark), JSON.stringify(lv))
check('...and the two veils actually differ', lv?.light !== lv?.dark, `dark ${lv?.dark} vs light ${lv?.light}`)
const l2 = await launch({ theme: 'light' })
check('the light theme is instant on its second launch too', l2.first,
  `art ${l2.art}ms, app shell ${l2.app}ms, already there: ${l2.first}`)

/* ---------- 3. shuffle changes every launch AND is instant ---------- */
const s1 = await launch({ ground: 'shuffle' })
const s2 = await launch({ ground: 'shuffle' })
const s3 = await launch({ ground: 'shuffle' })
const s4 = await launch({ ground: 'shuffle' })
check('shuffle parks its next picture for the launch after it',
  Boolean(s2.paint?.shuffle?.pending?.src || s3.paint?.shuffle?.pending?.src),
  s3.paint?.shuffle?.pending?.src ? 'parked' : 'none')
check('shuffle still changes picture between launches', s3.src !== s4.src, `${s3.src.slice(-22)} then ${s4.src.slice(-22)}`)
check('...and is on the root before React renders anyway', s4.first,
  `art ${s4.art}ms, app shell ${s4.app}ms, already there: ${s4.first}`)

/* ---------- 4. a failed re-read does not take the remembered paint ---------- */
// Two ordinary launches first. The store is keyed by source, so this proves the
// nowplaying entry SURVIVED the shuffle runs above rather than re-earning it.
const back = await launch({ ground: 'nowplaying' })
check('switching back to a source it already knows is instant', back.first,
  `already there: ${back.first}`)
const d1 = await launch({ ground: 'nowplaying', deadArt: true })
check('a picture that will not load keeps the paint that was already measured',
  d1.attr === 'nowplaying' && d1.first, `${d1.attr}, already there: ${d1.first}`)

/* ---------- 5. the worker and the app agree about /api/tint ---------- */
{
  const page = await ctx.newPage()
  await page.goto(BASE)
  const sw = await page.evaluate(async () => (await fetch('/sw.js')).text())
  await page.close()
  const body = sw.slice(sw.indexOf('const { request } = event'))
  const imgBranch = body.slice(body.indexOf('images.igdb.com'), body.indexOf('Live data'))
  check('sw.js serves /api/tint from the image cache', /isTintImage/.test(imgBranch), imgBranch.match(/if \(([^)]*)\)/)?.[1]?.slice(0, 76))
  // The same condition has to be SUBTRACTED from the network-first api branch,
  // or the first matching rule wins and the cache branch is unreachable.
  check('...and excludes it from the network-first api branch', /!isTintImage\(url\)/.test(sw), /!isTintImage/.test(sw) ? 'excluded' : 'still network-first')
}

await browser.close()
const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
