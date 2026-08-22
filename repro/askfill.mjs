/**
 * repro/askfill.mjs - the Ask view fills the column instead of subtracting one.
 *
 * `.chat-page` used to size itself as `100vh` minus a list of everything above
 * it. The list named the header, the top inset and the Discover top bar, and
 * 982721f then moved the large page title into App.jsx above every tab without
 * adding it, so the pane was 48px too tall from that day: the composer sat 36px
 * behind the floating tab bar and the page overflowed by 60.
 *
 * What is asserted is the composed geometry, not the CSS. The pane must FILL
 * what is left rather than merely fit inside it, because a pane that is too
 * SHORT also clears the bar and would pass a clearance-only check.
 *
 * Run: PW_CHROME=... BASE=http://127.0.0.1:4173 node repro/askfill.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://127.0.0.1:4173'
const results = []
const check = (name, pass, got) => {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${got !== undefined ? `  ::  ${got}` : ''}`)
}

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'block', timezoneId: 'America/New_York' })
const page = await ctx.newPage()
const problems = []
page.on('pageerror', (e) => problems.push('pageerror :: ' + e.message))
const json = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
await page.route('**/rest/v1/**', (r) => json(r, []))
await page.route('**/api/**', (r) => json(r, { games: [] }))
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.locator('.tabbar-btn', { hasText: 'Discover' }).first().click()
await page.waitForTimeout(1200)
await page.getByRole('tab', { name: 'Ask AI' }).click()
await page.waitForTimeout(1000)

const m = await page.evaluate(() => {
  const box = (s) => {
    const el = document.querySelector(s)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }
  }
  const app = document.querySelector('.app')
  const cs = getComputedStyle(app)
  const px = (n) => parseFloat(cs.getPropertyValue(n)) || 0
  return {
    page: box('.chat-page'), row: box('.chat-input-row'), bar: box('.tabbar'), msgs: box('.chat-messages'),
    // Derived from the VIEWPORT and the app's own reserved space, deliberately
    // not from .app-main's laid-out box. That box grows with the overflow, so
    // measuring against it made "the pane fills the column" pass on the broken
    // build too: the pane and the box were both 60px too long together.
    usableBottom: Math.round(window.innerHeight - (px('--tabbar-height') + px('--safe-bottom') + 12)),
    overflow: document.documentElement.scrollHeight - window.innerHeight,
    viewport: window.innerHeight,
  }
})
console.log(JSON.stringify(m))

check('the Ask view rendered', Boolean(m.page && m.row && m.bar), m.page ? 'yes' : 'no')
check('the composer clears the floating tab bar', m.row.bottom <= m.bar.top, `composer ends ${m.row.bottom}, bar starts ${m.bar.top}`)
check('the page does not overflow the viewport', m.overflow <= 0, `${m.overflow}px`)
// Fills, not merely fits. Within a pixel of the usable bottom.
check('the pane fills the column rather than fitting inside it',
  Math.abs(m.page.bottom - m.usableBottom) <= 1, `pane ends ${m.page.bottom}, column ends ${m.usableBottom}`)
check('the message list still has room to scroll in', m.msgs.h > 150, `${m.msgs.h}px`)
check('no page errors', problems.length === 0, problems.join(' | '))

await browser.close()
const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed} of ${results.length} passed`)
process.exit(failed ? 1 : 0)
