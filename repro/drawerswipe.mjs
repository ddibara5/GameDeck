/*
 * The left-edge swipe that opens the app drawer, measured against the BUILT app.
 *
 * App suppresses its own drawer swipe while a full-screen overlay is up, by
 * consulting overlaysOpen() from lib/useEdgeBack.js. That counter is the thing
 * under test: if an overlay registers while it is merely MOUNTED rather than
 * while it is VISIBLE, the count never returns to zero and the drawer swipe is
 * dead for the whole session.
 *
 * So this asserts both directions. A test that only checked "the drawer opens"
 * would pass on a build that had stopped suppressing anything.
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:4173'

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROME || undefined,
  // A left-edge drag is exactly Chromium's overscroll back-navigation gesture,
  // which fires before the page sees it and leaves a blank document. On iOS the
  // installed app has no such gesture. Without this flag every assertion below
  // measures an unloaded page and "the drawer did not open" is always true.
  args: ['--disable-features=OverscrollHistoryNavigation,TouchpadOverscrollHistoryNavigation'],
})
const ctx = await browser.newContext({
  viewport: { width: 390, height: 900 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  serviceWorkers: 'block',
  timezoneId: 'America/New_York',
})
const page = await ctx.newPage()

const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
await page.route('**/rest/v1/**', (route) => json(route, []))
await page.route('**/api/**', (route) => json(route, {}))

// A real left-edge drag. Raw CDP touch rather than page.touchscreen, because the
// handler reads touchmove deltas and a tap emits none. One session for the whole
// run: attaching and detaching per swipe raced with Playwright's own channel.
const cdp = await ctx.newCDPSession(page)
async function edgeSwipe(y = 400) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 8, y }] })
  for (const x of [20, 45, 80, 130, 180]) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(500)
}

// The drawer has no Escape handler; it closes on its scrim. The scrim is
// full-screen and the drawer sits on top of its left half, so the tap has to
// land on the right or the drawer intercepts it.
async function closeDrawer() {
  const scrim = page.locator('.drawer-scrim')
  if (await scrim.count()) await scrim.first().click({ position: { x: 340, y: 400 } })
  await page.waitForSelector('.drawer', { state: 'detached', timeout: 5000 })
}

const seen = () => page.evaluate(() => ({
  drawer: !!document.querySelector('.drawer:not(.closing)'),
  customize: !!document.querySelector('.settings-page:not(.closing)'),
}))

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('.page-title', { timeout: 10000 })
await page.waitForTimeout(400)

// 1. Cold app, nothing open: the swipe must open the drawer.
await edgeSwipe()
const cold = await seen()
await closeDrawer()

// 2. After visiting Insights, which mounts its own Customize page CLOSED.
//    This is the regression: a closed overlay must not count as open.
await page.getByRole('button', { name: /insights/i }).first().click()
await page.waitForTimeout(800)
await page.getByRole('button', { name: /library/i }).first().click()
await page.waitForTimeout(600)
await edgeSwipe()
const afterInsights = await seen()
await closeDrawer()

// 3. With a Customize page genuinely OPEN, the swipe must close it and must NOT
//    open the drawer behind it. This is what the registration is FOR.
await page.getByRole('button', { name: /insights/i }).first().click()
await page.waitForTimeout(800)
await page.getByRole('button', { name: /customize cards/i }).click()
await page.waitForSelector('.cz-row')
await edgeSwipe()
const overOverlay = await seen()

await browser.close()

const bad = []
const want = (cond, msg) => { if (!cond) bad.push(msg) }

console.log('cold app        :', cold)
console.log('after Insights  :', afterInsights)
console.log('over overlay    :', overOverlay)

want(cold.drawer, 'edge swipe on a cold app did not open the drawer')
want(afterInsights.drawer, 'edge swipe stopped working after Insights mounted its closed Customize page')
want(!overOverlay.customize, 'edge swipe over the open Customize page did not close it')
want(!overOverlay.drawer, 'edge swipe over the open Customize page opened the drawer behind it')

if (bad.length) {
  console.error('\nFAIL:')
  bad.forEach((b) => console.error('  - ' + b))
  process.exit(1)
}
console.log('\nPASS: drawer swipe works, and is suppressed only while an overlay is actually up')
