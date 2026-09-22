// Run with Playwright installed: node repro/scroll-lock.mjs
// Optional PLAYWRIGHT_MODULE, PW_CHROME and PW_LAMBDA_ARGS support CI runtimes.
// Exercises the real CSS and lock without authentication or backend requests.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from '../web/node_modules/vite/dist/node/index.js'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const args = process.env.PW_LAMBDA_ARGS
  ? (await import(process.env.PW_LAMBDA_ARGS)).default.args : []
const root = new URL('../web/', import.meta.url).pathname
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } })
let browser
try {
  await server.listen()
  const base = server.resolvedUrls.local[0]
  browser = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined, args })
  const css = await readFile(new URL('../web/src/index.css', import.meta.url), 'utf8')
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
  for (const width of [390, 1024]) {
    await page.setViewportSize({ width, height: 844 })
    await page.route('**/__scroll-lock-test', route => route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body><div class="app"><header class="app-header">Header</header><main style="height:2600px">Source page</main><div class="app-dock">Dock</div></div></body></html>',
    }))
    await page.goto(base + '__scroll-lock-test')
    await page.addStyleTag({ content: css })
    const result = await page.evaluate(async () => {
      const { lockScroll } = await import('/src/lib/scrollLock.js')
      const frame = () => new Promise(resolve => requestAnimationFrame(resolve))
      const measure = () => ({
        scroll: window.scrollY,
        header: document.querySelector('.app-header').getBoundingClientRect().top,
        dock: document.querySelector('.app-dock').getBoundingClientRect().bottom,
        // A lock must not clip source-page content to body's 100% height.
        bottom: document.elementFromPoint(5, innerHeight - 1)?.tagName,
      })
      window.scrollTo(0, 350)
      await frame()
      const before = measure()
      const release = lockScroll()
      const nestedRelease = lockScroll()
      await frame()
      const during = measure()
      release()
      release() // An old cleanup must not release another owner's lock.
      const nestedLocked = getComputedStyle(document.documentElement).overflowY
      nestedRelease()
      await frame()
      const after = measure()

      // Check ordinary user scrolling is blocked at the root, while a modal's
      // independent scroller remains available. Leave both mounted for wheel checks.
      window.testRelease = lockScroll()
      const overlay = document.createElement('div')
      overlay.id = 'scroll-test-overlay'
      overlay.style.cssText = 'position:fixed;inset:0;z-index:300'
      overlay.innerHTML = '<div id="scroll-test-dialog" style="height:300px;width:280px;overflow-y:auto;overscroll-behavior:contain;background:white"><div style="height:1500px">Scrollable dialog</div></div>'
      document.body.append(overlay)
      return { before, during, after, nestedLocked, bodyOverflow: document.body.style.overflow }
    })
    assert.deepEqual(result.during, result.before, `source geometry changed on lock at ${width}px`)
    assert.deepEqual(result.after, result.before, `source geometry changed on release at ${width}px`)
    assert.equal(result.nestedLocked, 'hidden')
    assert.equal(result.bodyOverflow, '')
    await page.mouse.move(width - 20, 600)
    await page.mouse.wheel(0, 300)
    await page.waitForTimeout(100)
    assert.equal(await page.evaluate(() => scrollY), 350, 'background wheel escaped the lock')
    await page.mouse.move(100, 100)
    await page.mouse.wheel(0, 150)
    await page.waitForTimeout(100)
    assert.ok(await page.locator('#scroll-test-dialog').evaluate(el => el.scrollTop > 0), 'dialog cannot scroll')
    await page.evaluate(() => { document.querySelector('#scroll-test-overlay').remove(); window.testRelease() })
    await page.mouse.move(100, 500)
    await page.mouse.wheel(0, 200)
    await page.waitForTimeout(100)
    assert.ok(await page.evaluate(() => scrollY > 350), 'page cannot scroll after release')

    const restored = await page.evaluate(async () => {
      const { lockScroll } = await import('/src/lib/scrollLock.js')
      const style = document.documentElement.style
      style.setProperty('overflow-x', 'clip', 'important')
      style.setProperty('overflow-y', 'scroll')
      const release = lockScroll()
      release()
      return [style.overflowX, style.getPropertyPriority('overflow-x'), style.overflowY]
    })
    assert.deepEqual(restored, ['clip', 'important', 'scroll'])
    assert.deepEqual(await page.locator('vite-error-overlay').count(), 0)
    console.log(`PASS ${width}px: stable source/header/dock, nested locks, background blocked, dialog scrolls, styles and scrolling restored`)
  }
} finally {
  await browser?.close()
  await server.close()
}
