/**
 * Which source does each surface actually ask for, and how big does it render it?
 *
 * The fixture gives every game BOTH a cover_igdb and an Exophase cover_small, so
 * the src each surface ends up with is a statement about its own choice rather
 * than about what data happened to exist. Sizes are read off the laid-out box;
 * images themselves never load here and do not need to.
 *
 * Exophase cover_small is 109x60 - a landscape banner, not a poster - so a 3:4
 * box crops it to roughly 45x60 before scaling. That is the number the upscale
 * column is computed against.
 */
import { chromium } from 'playwright'
const BASE = process.env.BASE || 'http://127.0.0.1:4173'
const DPR = Number(process.env.DPR || 3)
const SMALL = 'https://m.exophase.com/xbox/games/s/dg41b3j.png?x'
const NAMES = ['Persona 5 Royal', 'Kristala', 'Crimson Desert', 'Mistfall Hunter', 'Where Winds Meet', 'Beast of Reincarnation']
const games = NAMES.map((title, i) => ({
  master_id: i + 1, title, environment: 'xbox', playtime_minutes: 600 + i * 90, playtime_label: '10h',
  last_played: new Date(Date.now() - i * 3600000 * 8).toISOString(), earned_awards: 5, total_awards: 20,
  percent: 25, cover_igdb: 'coclf1', cover_small: SMALL, igdb_id: 100 + i, igdb_rating: 85,
  release_year: 2025, genre: 'Role-playing (RPG)', length_minutes: 3000,
  keywords: ['soulslike', 'open world'], platforms: ['Xbox'],
}))
const acts = [
  ['2026-08-21', 220, 1, 34, 23], ['2026-08-20', 84, 0, 33, 22], ['2026-08-18', 65, 1, 33, 22],
].map(([event_date, minutes_delta, achievements_delta, percent_after, earned_awards_after]) => ({
  master_id: 1, title: 'Persona 5 Royal', environment: 'xbox', event_date, minutes_delta,
  achievements_delta, percent_after, earned_awards_after, total_awards: 52, cover_small: SMALL,
  playtime_minutes_after: 2000, last_played: event_date + 'T20:00:00Z', is_new: false,
}))
const disc = ['Mortal Shell II', 'Duskfade', 'Code Violet'].map((name, i) => ({
  id: 900 + i, name, summary: 'A game.', cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big/coclf1.jpg',
  coverId: 'coclf1', year: 2026, rating: 88 - i, genres: ['Role-playing (RPG)'], keywords: ['soulslike'],
  themes: ['Action'], platforms: ['Series X|S', 'PS5'], companies: [],
  release: { ts: 1790000000, precision: 'day', label: 'Sep 24, 2026' },
}))

const b = await chromium.launch({ executablePath: process.env.PW_CHROME })
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'block', timezoneId: 'America/New_York' })
const page = await ctx.newPage()
const json = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
await page.route('**/rest/v1/**', (r) => {
  const u = r.request().url()
  return json(r, u.includes('/games') ? games : u.includes('recent_activity') ? acts : [])
})
await page.route('**/api/**', (r) => {
  const u = r.request().url()
  const m = /[?&]lanes=([^&]*)/.exec(u)
  if (!m) return json(r, { games: disc })
  const lanes = {}
  for (const k of decodeURIComponent(m[1]).split(',')) lanes[k] = disc
  return json(r, { lanes })
})
// Images are FULFILLED, not aborted: Cover falls back to an initial letter on
// error and unmounts the <img>, so aborting made every surface report "no image"
// and the audit measured nothing. A 1x1 png keeps the element in the tree; what
// is recorded is the URL each surface asked for.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const asked = []
for (const pat of ['**images.igdb.com/**', '**m.exophase.com/**', '**wsrv.nl/**']) {
  await page.route(pat, (r) => { asked.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'image/png', body: PNG }) })
}
await page.goto(BASE, { waitUntil: 'domcontentloaded' })

const SRC_SIZE = { t_cover_small: 90, t_cover_big: 264, t_720p: 540, t_1080p: 1080, exophase: 45 }
const classify = (raw) => {
  if (!raw) return ['none', 0]
  // Cover routes IGDB art through wsrv.nl with the real URL percent-encoded
  // inside it, so the bucket has to be read out of the wrapper before anything
  // can be said about the source size.
  const wrapped = /[?&]url=([^&]+)/.exec(raw)
  const src = wrapped ? decodeURIComponent(wrapped[1]) : raw
  const m = /upload\/(t_[a-z0-9_]+)\//.exec(src)
  if (m) return [m[1], SRC_SIZE[m[1]] || 0]
  if (src.includes('exophase')) return ['exophase 109x60', SRC_SIZE.exophase]
  return ['other', 0]
}
const rows = []
const scan = async (label) => {
  const found = await page.evaluate(() => [...document.querySelectorAll('.cover, .news-row-thumb, .ns-band')].map((el) => {
    const img = el.tagName === 'IMG' ? el : el.querySelector('img')
    const r = el.getBoundingClientRect()
    return { cls: el.className, w: Math.round(r.width), h: Math.round(r.height), src: img ? img.getAttribute('src') : null }
  }).filter((x) => x.w > 0))
  const seen = new Set()
  for (const f of found) {
    const key = label + '|' + f.cls + '|' + f.w + 'x' + f.h
    if (seen.has(key)) continue
    seen.add(key)
    const [kind, srcW] = classify(f.src)
    const needW = f.w * DPR
    rows.push({ label, cls: f.cls, box: `${f.w}x${f.h}`, kind, srcW, needW, up: srcW ? +(needW / srcW).toFixed(2) : null })
  }
}
await page.waitForTimeout(1800)
await scan('Home')
for (const tab of ['Library', 'Activity', 'Discover', 'News']) {
  const btn = page.locator('.tabbar-btn', { hasText: tab }).first()
  if (!(await btn.count())) continue
  await btn.click()
  await page.waitForTimeout(1800)
  await scan(tab)
}
// Insights is drawer-only (navConfig: `bar: false, fixed: 'drawer only'`), so it
// has no tab-bar button and would silently never be audited.
await page.locator('.tabbar-btn', { hasText: 'Home' }).first().click()
await page.waitForTimeout(1200)
await page.locator('.hm-tile', { hasText: /week/i }).first().click().catch(() => {})
await page.waitForTimeout(1800)
await scan('Insights')
console.log('\n' + 'surface'.padEnd(10) + 'element'.padEnd(26) + 'box'.padEnd(10) + 'source'.padEnd(20) + 'needs'.padEnd(8) + 'has'.padEnd(7) + 'upscale')
for (const r of rows) {
  const flag = r.up && r.up > 1.05 ? '  <-- UPSCALED' : ''
  console.log(r.label.padEnd(10) + String(r.cls).slice(0, 25).padEnd(26) + r.box.padEnd(10) + r.kind.padEnd(20) +
    String(r.needW).padEnd(8) + String(r.srcW).padEnd(7) + (r.up ? r.up + 'x' : '-') + flag)
}
console.log('\nevery image URL the app asked for, deduped by size bucket:')
const buckets = {}
for (const u of asked) { const [k] = classify(u); buckets[k] = (buckets[k] || 0) + 1 }
for (const [k, n] of Object.entries(buckets)) console.log('  ' + String(n).padStart(4) + '  ' + k)

// ---- assertions, so this is a guard rather than a report ----------------
let ok = true
const check = (name, pass, got) => { if (!pass) ok = false; console.log(`\n${pass ? 'PASS' : 'FAIL'}  ${name}${got !== undefined ? `  ::  ${got}` : ''}`) }

// Five surfaces render a library cover. Fewer than five means one of them did
// not render and its row went unaudited, which reads as a pass.
const labels = [...new Set(rows.map((r) => r.label))]
check('every surface that renders a cover was reached', labels.length >= 5, labels.join(', '))

const upscaled = rows.filter((r) => r.up && r.up > 1)
check('no cover is asked to upscale', upscaled.length === 0,
  upscaled.map((r) => `${r.label} ${r.box} ${r.up}x from ${r.kind}`).join(' | ') || 'none')

// The fallback is allowed to exist; it is not allowed to be the thing that gets
// requested while an IGDB id sits in the same row. Every fixture game has one.
const fell = rows.filter((r) => r.kind.startsWith('exophase'))
check('no surface reaches for the platform banner over IGDB art', fell.length === 0,
  fell.map((r) => r.label).join(', ') || 'none')
check('and nothing requested one over the wire', !Object.keys(buckets).some((k) => k.startsWith('exophase')),
  Object.keys(buckets).join(', '))

await b.close()
process.exit(ok ? 0 : 1)
