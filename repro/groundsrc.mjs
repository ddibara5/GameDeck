/**
 * repro/groundsrc.mjs - the two new ground sources, the intensity floor, and the
 * Settings reorganisation that carries them.
 *
 * ground.mjs already holds down the veil measurement and the contrast over it.
 * This file is about the four claims that measurement cannot make:
 *
 *   1. "Most played this week" is a DIFFERENT ANSWER from "Now playing", and the
 *      only way to say that is to build a week where they disagree and assert
 *      both against the same fixture. A harness that only checked that `weekly`
 *      resolves a picture would pass on an implementation that quietly returned
 *      the most recent game, which is the bug worth catching here.
 *
 *   2. A pin is a choice, so it must not be silently substituted. Pinning a game
 *      that is not in the library resolves to NOTHING, not to a fallback.
 *
 *   3. The slider raises the veil and cannot lower it. Asserted as an ordering
 *      against the measured floor at the same picture and theme, plus the
 *      contrast at intensity 0 - which is the end that could actually fail.
 *
 *   4. The art layers are keyed on the PAINT, not on the source name. The old
 *      stylesheet named `nowplaying` and `shuffle`, so between choosing a source
 *      and its picture arriving the veil painted over an empty background. The
 *      assertion is on the stylesheet itself: no rule may name a source.
 *
 * Run: PW_CHROME=... BASE=http://127.0.0.1:4173 node repro/groundsrc.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://127.0.0.1:4173'
const AA_BODY = 4.5
const results = []
const check = (name, pass, got) => {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${got !== undefined ? `  ::  ${got}` : ''}`)
}
const srgb = (c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) }
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b), hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05) }

const day = (back) => {
  const d = new Date(Date.now() - back * 86400000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// THE FIXTURE IS THE ASSERTION.
//
// Persona (master 1) was played MOST RECENTLY - four hours ago, and nothing else
// has been touched today. Kristala (master 2) is the game the WEEK was about: 600
// minutes across four days against Persona's 40. So "now playing" and "most played
// this week" have different answers on the same data, which is the entire point of
// adding the second source, and a fixture where one game led on both would have
// made a wrong implementation look correct.
//
// Crimson Desert (master 3) carries NO igdb_id. It leads the week on minutes, and
// it is there to prove the walk down byGame: a source that took byGame[0] blindly
// would resolve no picture at all and fall to the wash.
const games = [
  { master_id: 1, title: 'Persona 5 Royal', igdb_id: 100, last_played: new Date(Date.now() - 4 * 3600000).toISOString() },
  { master_id: 2, title: 'Kristala', igdb_id: 101, last_played: new Date(Date.now() - 3 * 86400000).toISOString() },
  { master_id: 3, title: 'Crimson Desert', igdb_id: null, last_played: new Date(Date.now() - 86400000).toISOString() },
  { master_id: 4, title: 'Mistfall Hunter', igdb_id: 103, last_played: null },
].map((g) => ({
  environment: 'xbox', playtime_minutes: 600, playtime_label: '10h', earned_awards: 5, total_awards: 20,
  percent: 25, cover_igdb: 'coclf1', cover_small: null, igdb_rating: 85, release_year: 2025,
  genre: 'Role-playing (RPG)', length_minutes: 3000, keywords: [], platforms: ['Xbox'], franchises: [], ...g,
}))

const act = (master_id, title, back, minutes_delta) => ({
  master_id, title, environment: 'xbox', event_date: day(back), minutes_delta, achievements_delta: 0,
  percent_after: 30, earned_awards_after: 6, total_awards: 52, cover_small: null,
  playtime_minutes_after: 2000, last_played: `${day(back)}T20:00:00Z`, is_new: false,
})
const WEEK = [
  act(3, 'Crimson Desert', 1, 700),
  act(2, 'Kristala', 1, 150), act(2, 'Kristala', 2, 150), act(2, 'Kristala', 3, 150), act(2, 'Kristala', 4, 150),
  act(1, 'Persona 5 Royal', 0, 40),
]

const disc = [0, 1, 2, 3].map((i) => ({
  id: 100 + i, name: games[i].title, summary: 'A game.', cover: null, coverId: 'coclf1', year: 2026,
  rating: 88, genres: ['Role-playing (RPG)'], keywords: [], themes: [], platforms: ['Series X|S'],
  companies: [], backdropId: 'arart' + i, backdropKind: 'artwork',
  release: { ts: 1790000000, precision: 'day', label: 'Sep 24, 2026' },
}))

// Same hostile picture ground.mjs uses: near black to near white with a specular
// blob. A veil that clears here clears a photograph.
const ART = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#141013"/><stop offset="0.34" stop-color="#7a5f42"/>
    <stop offset="0.52" stop-color="#e8dfd0"/><stop offset="0.72" stop-color="#4a453f"/>
    <stop offset="1" stop-color="#17140f"/></linearGradient></defs>
  <rect width="640" height="360" fill="url(#g)"/>
  <circle cx="470" cy="86" r="46" fill="#fff8ea"/></svg>`
const PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME })

async function open(theme, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1,
    serviceWorkers: 'block', timezoneId: 'America/New_York' })
  const page = await ctx.newPage()
  const json = (r, b) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) })
  await page.route('**/rest/v1/**', (r) => {
    const u = r.request().url()
    if (u.includes('recent_activity')) return json(r, opts.noWeek ? [] : WEEK)
    return json(r, u.includes('/games') ? games : [])
  })
  await page.route('**/api/**', (r) => {
    const u = r.request().url()
    if (u.includes('/api/tint')) return r.fallback()
    const keyed = (p, w) => {
      const m = new RegExp(`[?&]${p}=([^&]*)`).exec(u)
      if (!m) return null
      const o = {}
      for (const k of decodeURIComponent(m[1]).split(',')) o[k] = disc
      return { [w]: o }
    }
    return json(r, keyed('home', 'rails') || keyed('lanes', 'lanes') || { games: disc })
  })
  await page.route('**/api/tint**', (r) =>
    r.fulfill({ status: 200, contentType: 'image/svg+xml', body: ART }))
  const png = (r) => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(PX, 'base64') })
  await page.route('**images.igdb.com/**', png)
  await page.route('**wsrv.nl/**', png)
  await page.addInitScript((o) => {
    try {
      localStorage.setItem('gamedeck_theme_v1', o.t)
      if (o.g) localStorage.setItem('gamedeck_ground_v1', o.g)
      if (o.pin) localStorage.setItem('gamedeck_ground_pin_v1', JSON.stringify(o.pin))
      if (o.intensity != null) localStorage.setItem('gamedeck_ground_intensity_v1', String(o.intensity))
    } catch { /* ignore */ }
  }, { t: theme, g: opts.ground || null, pin: opts.pin || null, intensity: opts.intensity })
  // TWO LAUNCHES, and the second one is the test.
  //
  // Every art source resolves out of the IndexedDB library cache, and on a
  // first-ever launch that cache is empty - initGround runs before anything has
  // fetched the library, so it correctly falls back to the wash. `weekly` reads
  // the activity cache the same way. A single-launch harness measures that empty
  // state and reports every source as broken. The first pass here exists to fill
  // both caches; the reload is the launch being asserted, which is also the one a
  // real user has on every open after their first.
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2200)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2600)
  return { ctx, page }
}

const groundState = (page) => page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement)
  return {
    attr: document.documentElement.getAttribute('data-ground'),
    art: document.documentElement.hasAttribute('data-ground-art'),
    src: cs.getPropertyValue('--ground-src').trim(),
    veil: Number(cs.getPropertyValue('--ground-veil-a')) || null,
  }
})
const backdropOf = (st) => (/id=([^&"]+)/.exec(st.src || '') || [])[1] || null

const openSettings = async (page) => {
  await page.locator('.brand-btn').click()
  await page.waitForTimeout(450)
  await page.locator('.menu-fb', { hasText: 'Settings' }).click()
  await page.waitForTimeout(650)
}
const openBackground = async (page) => {
  await page.locator('.menu-item', { hasText: 'Background' }).first().click()
  await page.waitForTimeout(500)
}

/* ------------------------------------------ 1. the two sources disagree */
{
  const { ctx, page } = await open('dark', { ground: 'nowplaying' })
  const st = await groundState(page)
  check('now playing resolves the most recently played', backdropOf(st) === 'arart0', backdropOf(st))
  await ctx.close()
}
{
  const { ctx, page } = await open('dark', { ground: 'weekly' })
  const st = await groundState(page)
  // arart1 is Kristala. arart0 would mean it answered "now playing" under a new
  // name; null would mean it took byGame[0] (Crimson Desert, no igdb_id) and gave up.
  check('most played this week resolves the WEEK, not the last row', backdropOf(st) === 'arart1', backdropOf(st))
  // Both halves. Without the first, this passes vacuously on any build where the
  // source resolves nothing at all - which is exactly the build it is written for.
  check('...and it is a different picture from now playing',
    Boolean(backdropOf(st)) && backdropOf(st) !== 'arart0', backdropOf(st))
  check('...with a measured veil', st.veil > 0.2 && st.veil <= 0.92, st.veil)
  await ctx.close()
}
{
  const { ctx, page } = await open('dark', { ground: 'weekly', noWeek: true })
  const st = await groundState(page)
  check('a week with nothing logged falls back to the last played', backdropOf(st) === 'arart0', backdropOf(st))
  await ctx.close()
}

/* ------------------------------------------ 2. the pin is a choice */
{
  const { ctx, page } = await open('dark', { ground: 'pinned', pin: { master_id: 4, title: 'Mistfall Hunter' } })
  const st = await groundState(page)
  // master 4 has never been played at all, so "most recent" could never reach it.
  check('a pin resolves the pinned game', backdropOf(st) === 'arart3', backdropOf(st))
  await ctx.close()
}
{
  const { ctx, page } = await open('dark', { ground: 'pinned', pin: { master_id: 999, title: 'Not owned' } })
  const st = await groundState(page)
  check('a pin that names nothing resolves NOTHING, not a substitute', st.art === false, `art=${st.art} src=${st.src || 'none'}`)
  check('...and degrades to the wash', st.attr === 'wash', st.attr)
  const stored = await page.evaluate(() => localStorage.getItem('gamedeck_ground_v1'))
  check('...without discarding the preference', stored === 'pinned', stored)
  await ctx.close()
}
{
  const { ctx, page } = await open('dark', { ground: 'nowplaying' })
  await openSettings(page)
  await openBackground(page)
  await page.locator('.settings-sub .menu-item', { hasText: 'Pinned game' }).click()
  await page.waitForTimeout(500)
  await page.locator('.settings-sub .menu-item', { hasText: 'Choose a game' }).click()
  await page.waitForTimeout(900)
  const listed = await page.locator('.pin-row').allTextContents()
  check('the picker offers only games with key art', !listed.some((t) => /Crimson Desert/.test(t)), listed.map((t) => t.split('2')[0].trim()).join(', '))
  await page.locator('.pin-row', { hasText: 'Mistfall Hunter' }).click()
  await page.waitForTimeout(2400)
  const st = await groundState(page)
  check('picking a game pins it and paints it', backdropOf(st) === 'arart3', backdropOf(st))
  check('...and selects the pinned source', st.attr === 'pinned', st.attr)
  const pin = await page.evaluate(() => localStorage.getItem('gamedeck_ground_pin_v1'))
  check('...and remembers which game', /"master_id":4/.test(pin || ''), pin)
  const subs = await page.locator('.settings-sub').count()
  check('...and closes the picker, leaving Background open', subs === 1, `${subs} sub`)
  await ctx.close()
}

/* ------------------------------------------ 3. the intensity floor */
let floorDark = null
{
  const { ctx, page } = await open('dark', { ground: 'nowplaying', intensity: 0 })
  const st = await groundState(page)
  floorDark = st.veil
  check('intensity 0 paints the measured floor', st.veil > 0.2 && st.veil < 0.92, st.veil)
  await ctx.close()
}
{
  const { ctx, page } = await open('dark', { ground: 'nowplaying', intensity: 1 })
  const st = await groundState(page)
  check('intensity 1 is the ceiling', st.veil === 0.92, st.veil)
  check('...which is above the floor, never below', st.veil > floorDark, `${st.veil} > ${floorDark}`)
  await ctx.close()
}
{
  const { ctx, page } = await open('dark', { ground: 'nowplaying', intensity: 0.5 })
  const st = await groundState(page)
  check('a middle setting sits between the two', st.veil > floorDark && st.veil < 0.92, `${floorDark} < ${st.veil} < 0.92`)
  await ctx.close()
}
/* THE SLIDER, DRIVEN.
 *
 * Every assertion above sets the stored value and reloads, which is how a slider
 * that did nothing a user could see shipped: `--ground-veil-a` moved, the number
 * was right, and the picture behind it did not visibly change because the
 * measured floor sat at 0.76 of a 0.92 ceiling. A stored-value check cannot tell
 * those apart. This one drags the control and photographs the ground.
 */
{
  const { ctx, page } = await open('dark', { ground: 'nowplaying' })
  await openSettings(page)
  await openBackground(page)
  const slider = page.locator('.settings-slider')
  const box = await slider.boundingBox()
  // The bare ground, so a card is not averaged into the reading.
  const groundMean = async () => {
    const tag = await page.addStyleTag({
      content: '.settings-page > *, .app > *, .tabbar { visibility: hidden !important; }',
    })
    await page.waitForTimeout(120)
    const shot = await page.screenshot({ clip: { x: 40, y: 300, width: 300, height: 300 } })
    await tag.evaluate((el) => el.remove())
    return page.evaluate(async (b64) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
      const c = new OffscreenCanvas(img.width, img.height)
      const g = c.getContext('2d')
      g.drawImage(img, 0, 0)
      const px = g.getImageData(0, 0, img.width, img.height).data
      let sum = 0
      let n = 0
      for (let i = 0; i < px.length; i += 4) { sum += (px[i] + px[i + 1] + px[i + 2]) / 3; n += 1 }
      return Math.round((sum / n) * 100) / 100
    }, shot.toString('base64'))
  }
  const drag = async (frac) => {
    await page.mouse.move(box.x + 4, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * frac, box.y + box.height / 2, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(400)
  }

  const atLeft = await groundMean()
  const veilLeft = await page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue('--ground-veil-a')))
  await drag(0.99)
  const veilRight = await page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue('--ground-veil-a')))
  const atRight = await groundMean()
  const stored = await page.evaluate(() => localStorage.getItem('gamedeck_ground_intensity_v1'))

  check('dragging the slider moves the veil', veilRight > veilLeft, `${veilLeft} -> ${veilRight}`)
  check('...and persists what was chosen', Number(stored) > 0.9, stored)

  // THE TWO THAT MATTER, and the first version of this pair was too weak to
  // catch the bug it was written for.
  //
  // "Dragging changes the rendered pixel" passes on the broken build: the veil
  // moved 0.82 to 0.92 and the ground moved 17 of 255, which is a change, just
  // not one anybody could see. The defect was never that the control did
  // nothing - it was that the FLOOR was so high there was no picture left to
  // control. So the floor is asserted directly.
  //
  // 0.70 is a product decision, said plainly: below 30% of the picture surviving
  // at the floor this is a tinted page rather than a background, and the slider
  // is decoration. It is asserted against the deliberately hostile fixture -
  // near-black to near-white with a specular blob - so real key art has margin.
  console.log(`note   floor ${veilLeft}; ground mean ${atLeft} at the floor, ${atRight} at the ceiling`)
  check('the floor leaves a picture to control', veilLeft <= 0.7,
    `${veilLeft} - ${Math.round((1 - veilLeft) * 100)}% of the picture survives it`)
  check('...so the full travel is something you can see', Math.abs(atLeft - atRight) >= 30,
    `${Math.abs(atLeft - atRight).toFixed(1)} of 255 across the full travel`)

  await drag(0.01)
  const backVeil = await page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue('--ground-veil-a')))
  check('...and it goes back down again', backVeil < veilRight, `${veilRight} -> ${backVeil}`)
  // It can never go BELOW the measured floor, which is the whole safety argument.
  check('...but never below the measured floor', backVeil >= veilLeft - 0.001, `${backVeil} vs floor ${veilLeft}`)
  await ctx.close()
}

{
  // The end that could actually fail. Intensity 1 is trivially safe - more veil
  // is more contrast - so the assertion that matters is at 0, where the slider is
  // sitting exactly on the measured minimum.
  const { ctx, page } = await open('light', { ground: 'nowplaying', intensity: 0 })
  const sel = '.page-subtitle'
  const box = await page.locator(sel).first().boundingBox()
  const colour = await page.evaluate((s) => getComputedStyle(document.querySelector(s)).color.match(/\d+/g).slice(0, 3).map(Number), sel)
  await page.addStyleTag({ content: `${sel} { color: transparent !important; }` })
  const shot = await page.locator(sel).first().screenshot()
  const worst = await page.evaluate(async ({ b64, want }) => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
    const c = new OffscreenCanvas(img.width, img.height)
    const g = c.getContext('2d')
    g.drawImage(img, 0, 0)
    const px = g.getImageData(0, 0, img.width, img.height).data
    const sr = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) }
    const L = (r, gg, bb) => 0.2126 * sr(r) + 0.7152 * sr(gg) + 0.0722 * sr(bb)
    const target = L(want[0], want[1], want[2])
    // The pixel CLOSEST in luminance to the text, not the mean: over a picture the
    // two disagree, and the mean is the one that says a failure is fine.
    let best = null
    for (let i = 0; i < px.length; i += 4) {
      const l = L(px[i], px[i + 1], px[i + 2])
      if (best == null || Math.abs(l - target) < Math.abs(best - target)) best = l
    }
    const hi = Math.max(best, target), lo = Math.min(best, target)
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
  }, { b64: shot.toString('base64'), want: colour })
  check('light, intensity 0: the smallest type still clears AA', worst >= AA_BODY, `${worst} vs ${AA_BODY}`)
  await ctx.close()
}

/* ------------------------------------------ 4. the layers follow the paint */
{
  const { ctx, page } = await open('dark', { ground: 'off' })
  const named = await page.evaluate(() => {
    const out = []
    for (const sheet of document.styleSheets) {
      let rules
      try { rules = sheet.cssRules } catch { continue }
      for (const r of rules) {
        const sel = r.selectorText || ''
        if (/data-ground=['"]?(nowplaying|shuffle|weekly|pinned)/.test(sel)) out.push(sel)
      }
    }
    return out
  })
  // The old stylesheet named nowplaying and shuffle on both art layers, which is
  // what left the veil painting over an empty background while the picture
  // resolved - and what made a new source a CSS change.
  check('no stylesheet rule names a picture source', named.length === 0, named.join(' | ') || 'none')
  const st = await groundState(page)
  check('off carries no art marker', st.art === false, st.art)
  await ctx.close()
}
{
  const { ctx, page } = await open('dark', { ground: 'wash' })
  const st = await groundState(page)
  check('the wash carries no art marker', st.art === false, st.art)
  await ctx.close()
}
{
  const { ctx, page } = await open('dark', { ground: 'nowplaying' })
  const st = await groundState(page)
  check('a painted picture carries the art marker', st.art === true && Boolean(st.src), `${st.art}, ${st.src}`)
  await ctx.close()
}

/* ------------------------------------------ 5. the Settings reorganisation */
{
  const { ctx, page } = await open('dark', { ground: 'off' })
  await openSettings(page)
  const rootRows = await page.locator('.settings-page:not(.settings-sub) .menu-item').allTextContents()
  check('the four sync stamps are off the root list', !rootRows.some((t) => /Exophase/.test(t)), rootRows.length + ' rows')
  check('...behind one row that carries the OLDEST of them', rootRows.some((t) => /Sources/.test(t)), rootRows.find((t) => /Sources/.test(t)) || 'absent')

  // The subtitle, not the label. hasText is case-INSENSITIVE, so 'Sources' also
  // matches the Sync now row's "Pulls all four sources." - and .first() picked
  // that one, which fired a sync and opened nothing.
  await page.locator('.menu-item', { hasText: 'When each platform last reported' }).first().click()
  await page.waitForTimeout(500)
  const srcRows = await page.locator('.settings-sub .menu-item').allTextContents()
  const wanted = ['Steam', 'PlayStation', 'Xbox', 'Exophase']
  check('every source is on its own page', wanted.every((w) => srcRows.some((t) => t.includes(w))), srcRows.length + ' rows')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)

  await openBackground(page)
  const opts = await page.locator('.settings-sub .settings-group').first().locator('.menu-item').allTextContents()
  const six = ['Off', 'Theme wash', 'Now playing', 'Most played this week', 'Pinned game', 'Shuffle']
  check('all six sources are offered', six.every((w, i) => (opts[i] || '').startsWith(w)), opts.map((t) => t.split(/(?=[A-Z][a-z]+ [a-z])/)[0]).join(' / '))
  const sliderOff = await page.locator('.settings-slider').count()
  check('no slider under a flat ground', sliderOff === 0, sliderOff)

  await page.locator('.settings-sub .menu-item', { hasText: 'Now playing' }).click()
  await page.waitForTimeout(2200)
  const sliderOn = await page.locator('.settings-slider').count()
  check('the slider appears under a picture', sliderOn === 1, sliderOn)

  await page.locator('.settings-sub .menu-item', { hasText: 'Theme wash' }).click()
  await page.waitForTimeout(700)
  const sliderWash = await page.locator('.settings-slider').count()
  check('...and not under the wash, which has no picture to show', sliderWash === 0, sliderWash)
  await ctx.close()
}
{
  // Three levels deep, and Escape pops ONE. A single `sub` string could not
  // express this: the picker would have closed Background with it.
  const { ctx, page } = await open('dark', { ground: 'pinned' })
  await openSettings(page)
  await openBackground(page)
  await page.locator('.settings-sub .menu-item', { hasText: 'Choose a game' }).click()
  await page.waitForTimeout(700)
  const two = await page.locator('.settings-sub').count()
  check('the picker is a third level over Background', two === 2, `${two} subs`)
  const order = await page.evaluate(() => [...document.querySelectorAll('.settings-sub')]
    .map((el) => Number(getComputedStyle(el).zIndex)))
  check('...and it paints above it', order[1] > order[0], order.join(' < '))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  check('Escape pops one level', (await page.locator('.settings-sub').count()) === 1, await page.locator('.settings-sub').count())
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  check('...and again', (await page.locator('.settings-sub').count()) === 0, await page.locator('.settings-sub').count())
  check('...leaving Settings open', (await page.locator('.settings-page').count()) === 1, await page.locator('.settings-page').count())
  await ctx.close()
}

await browser.close()
const pass = results.filter(Boolean).length
console.log(`\n${pass}/${results.length} passed`)
process.exit(pass === results.length ? 0 : 1)
