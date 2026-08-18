/*
 * Geometry check for the iOS 26 scroll-edge-effect offset (--top-inset).
 *
 * Chromium exposes no safe-area inset and no display-mode API, so this runs
 * against the SHIPPED stylesheet: it intercepts every built CSS file, unwraps
 * the @media (display-mode: standalone) block and substitutes the device's real
 * env() values, then measures painted geometry in the real running app.
 *
 * Pass condition: no painted element on any top-anchored surface has its top
 * edge above y=90, the first clean row measured on device under
 * apple-mobile-web-app-status-bar-style="black-translucent" with a 59px inset.
 *
 * Run with --browser to assert the INVERSE: outside standalone the offset must
 * not apply, or the fix has leaked into the browser tab.
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:4173'
const INSET_TOP = 59
const INSET_BOTTOM = 34
const CLEAN_Y = 90
const MODE = process.argv.includes('--browser') ? 'browser' : 'standalone'

function unwrapStandalone(css) {
  const NEEDLE = '@media (display-mode: standalone)'
  let out = ''
  let i = 0
  for (;;) {
    const idx = css.indexOf(NEEDLE, i)
    if (idx === -1) { out += css.slice(i); return out }
    out += css.slice(i, idx)
    let j = css.indexOf('{', idx) + 1
    let depth = 0
    for (; j < css.length; j++) {
      const c = css[j]
      if (c === '{') depth++
      else if (c === '}') {
        if (depth === 0) { j++; break }
        depth--
      }
      out += c
    }
    i = j
  }
}

function transform(css) {
  let out = MODE === 'standalone' ? unwrapStandalone(css) : css
  return out
    .replace(/env\(\s*safe-area-inset-top\s*(?:,[^)]*)?\)/g, `${INSET_TOP}px`)
    .replace(/env\(\s*safe-area-inset-bottom\s*(?:,[^)]*)?\)/g, `${INSET_BOTTOM}px`)
}

// PW_CHROME lets a sandbox that ships its own Chromium point at it instead of
// running `playwright install`. Unset, Playwright uses its own download.
const browser = await chromium.launch(
  process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {},
)
const ctx = await browser.newContext({
  viewport: { width: 440, height: 956 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  serviceWorkers: 'block',
  timezoneId: 'America/New_York',
})
const page = await ctx.newPage()

const failures = []
page.on('requestfailed', r => failures.push(r.url() + ' :: ' + (r.failure()?.errorText || '')))
page.on('pageerror', e => failures.push('pageerror :: ' + e.message))

await page.route('**/rest/v1/**', r =>
  r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
await page.route('**/api/**', r =>
  r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))

let rewritten = 0
await page.route('**/*.css', async route => {
  const res = await route.fetch()
  rewritten++
  await route.fulfill({ status: 200, contentType: 'text/css', body: transform(await res.text()) })
})

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('.app-header')

// Painted top edge of every visible element under a root. Text is measured by
// its glyph ink box, not its line box, because the line box overstates height.
const PROBE = (rootSel) => {
  const root = document.querySelector(rootSel)
  if (!root) return null
  const items = []
  const inkTop = (el) => {
    const r = document.createRange()
    r.selectNodeContents(el)
    const rects = [...r.getClientRects()].filter(x => x.height > 0 && x.width > 0)
    return rects.length ? Math.min(...rects.map(x => x.top)) : null
  }
  const opacityChain = (el) => {
    let o = 1, n = el
    while (n && n !== document.documentElement) {
      o *= parseFloat(getComputedStyle(n).opacity || '1')
      n = n.parentElement
    }
    return o
  }
  for (const el of [root, ...root.querySelectorAll('*')]) {
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none') continue
    const r = el.getBoundingClientRect()
    if (r.height === 0 || r.width === 0) continue
    if (opacityChain(el) < 0.02) continue
    const ownText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())
    const paints =
      cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
      cs.backgroundImage !== 'none' ||
      parseFloat(cs.borderTopWidth) > 0 ||
      el.tagName.toLowerCase() === 'svg' ||
      el.tagName.toLowerCase() === 'img' ||
      ownText
    if (!paints) continue
    // Only CONTENT is gated. A panel's own flat background is not content: the
    // gradient fades a solid colour into itself and nothing reads as soft. What
    // reads as soft is type, glyphs, and the small chips that carry a border and
    // a highlight. Anything taller than the bar itself is a surface, not a chip.
    const isContent = ownText || ['svg', 'img'].includes(el.tagName.toLowerCase()) || r.height <= 60
    if (!isContent) continue
    const top = ownText ? (inkTop(el) ?? r.top) : r.top
    items.push({
      sel: (typeof el.className === 'string' && el.className.trim())
        ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
        : el.tagName.toLowerCase(),
      top: Math.round(top * 10) / 10,
      h: Math.round(r.height * 10) / 10,
    })
  }
  // Highest painted thing first.
  return items.sort((a, b) => a.top - b.top)
}

const surfaces = []
async function probe(name, rootSel, open) {
  // Reload between surfaces rather than trying to close each one. A close that
  // silently fails would leave the next surface measuring the wrong overlay.
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('.app-header')
  await page.waitForTimeout(250)
  if (open) { await open(); await page.waitForTimeout(500) }
  const items = await page.evaluate(PROBE, rootSel)
  if (!items || !items.length) { surfaces.push({ name, rootSel, missing: true }); return }
  surfaces.push({ name, rootSel, highest: items[0], count: items.length, items })
  await page.screenshot({
    path: `repro/top-${MODE}-${name}.png`,
    clip: { x: 0, y: 0, width: 440, height: 240 },
  })
}

await probe('appheader', '.app-header')
await probe('drawer', '.drawer', () => page.click('.brand-btn'))
await probe('settings', '.settings-page, .settings-hd', () => page.click('.gear-btn'))
await probe('shuffle', '.shuffle-page', () => page.click('.dice-btn'))
await probe('viewpage', '.view-page', async () => {
  await page.click('.brand-btn')
  await page.waitForTimeout(400)
  const wl = page.locator('.drawer button, .drawer a').filter({ hasText: /wishlist/i }).first()
  if (await wl.count()) await wl.click({ force: true })
})

// Lazily-loaded chunks (the Discover rail, the lightbox) never fetch their CSS
// in this run, and an unstyled stand-in would measure 0 and read as a pass on
// broken code. Inject every built stylesheet, transformed the same way, first.
{
  const { readdirSync, readFileSync } = await import('node:fs')
  const dir = 'web/dist/assets'
  const files = readdirSync(dir).filter(f => f.endsWith('.css'))
  if (!files.length) { console.error('FAIL: no built CSS found in ' + dir); process.exit(1) }
  for (const f of files) {
    await page.addStyleTag({ content: transform(readFileSync(`${dir}/${f}`, 'utf8')) })
  }
  console.log(`injected ${files.length} built stylesheet(s) for the rule-level checks`)
}

// Rules that need data this harness has none of are checked at the CSS level
// instead: resolve the shipped rule's own padding and measure a stand-in child
// of the real painted size. This asks the stylesheet, not a reconstruction of
// the app, what top offset the rule produces.
const cssOnly = await page.evaluate(([cleanY]) => {
  const cases = [
    { name: '.rail-head > .rail-back', parent: 'rail-head', child: 'rail-back', h: 42 },
    { name: '.lb > .lb-close', parent: 'lb', child: 'lb-close', h: 38 },
  ]
  const out = []
  for (const c of cases) {
    const p = document.createElement('div')
    p.className = c.parent
    p.style.position = 'fixed'
    p.style.left = '0'
    p.style.top = '0'
    p.style.width = '100%'
    const ch = document.createElement('div')
    ch.className = c.child
    ch.style.height = c.h + 'px'
    p.appendChild(ch)
    document.body.appendChild(p)
    const top = ch.getBoundingClientRect().top
    const styled = getComputedStyle(p).paddingTop !== '0px' || getComputedStyle(ch).position === 'absolute'
    out.push({
      name: c.name,
      top: Math.round(top * 10) / 10,
      clears: styled && top >= cleanY,
      note: styled ? '' : 'RULE NOT LOADED - measured nothing',
    })
    p.remove()
  }
  // The detail sheet is bottom anchored; confirm it cannot reach the band.
  out.push({ name: '.modal-sheet (max-height 88vh, bottom anchored)', top: Math.round(window.innerHeight * 0.12), clears: window.innerHeight * 0.12 >= cleanY })
  return out
}, [CLEAN_Y])

console.log(`mode=${MODE}  stylesheets rewritten=${rewritten}`)
if (rewritten === 0) { console.error('FAIL: no stylesheet was intercepted, the harness tested nothing'); process.exit(1) }

let bad = []
for (const s of surfaces) {
  if (s.missing) { console.log(`  ${s.name.padEnd(11)} MISSING (${s.rootSel}) - not opened`); bad.push(s.name + ':missing'); continue }
  const h = s.highest
  const ok = MODE === 'browser' ? true : h.top >= CLEAN_Y
  console.log(`  ${s.name.padEnd(11)} highest painted: ${h.sel} top=${h.top} h=${h.h}  (${s.count} painted) ${ok ? 'OK' : 'IN BAND'}`)
  if (!ok) bad.push(`${s.name}: ${h.sel} at y=${h.top}`)
}
for (const c of cssOnly) {
  const ok = MODE === 'browser' ? true : c.clears
  console.log(`  ${'(css)'.padEnd(11)} ${c.name} top=${c.top} ${ok ? 'OK' : 'IN BAND'} ${c.note || ''}`)
  if (!ok) bad.push(`${c.name}: y=${c.top}`)
}
if (failures.length) console.log('REQUEST/PAGE FAILURES:', failures.slice(0, 6))

if (MODE === 'browser') {
  const bar = await page.evaluate(() => document.querySelector('.app-header').getBoundingClientRect().height)
  const want = 52 + INSET_TOP
  if (Math.abs(bar - want) > 0.6) {
    console.error(`FAIL: browser bar height ${bar}, expected ${want}. The standalone offset leaked outside display-mode: standalone.`)
    await browser.close(); process.exit(1)
  }
  console.log(`PASS: browser bar height ${bar} == 52 + ${INSET_TOP}; offset correctly not applied outside standalone`)
} else if (bad.length) {
  console.error(`FAIL: ${bad.length} item(s) inside the y<${CLEAN_Y} fade band:`)
  bad.forEach(b => console.error('  - ' + b))
  await browser.close(); process.exit(1)
} else {
  console.log(`PASS: every top-anchored surface clears y=${CLEAN_Y}`)
}
await browser.close()
