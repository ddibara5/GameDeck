/**
 * repro/bundle.mjs - what a deploy costs, and what Browse pays for Ask AI.
 *
 * Three claims, and none of them is "the config has manualChunks in it":
 *
 *   1. a deploy re-downloads the app and NOT React. Proved by building twice
 *      with one source file changed and comparing filenames - a content hash is
 *      the whole mechanism, so the test has to exercise the hash.
 *   2. the markdown parser is not in the chunk that Browse and For you load.
 *      Proved by driving the tab and watching the network, not by reading the
 *      import graph - which is how the first version of this change was caught
 *      still fetching it on Browse.
 *   3. the plain-text fallback keeps the reply's line breaks. It is on screen
 *      for a frame or two and nothing else would ever notice if it did not.
 *
 * Run: PW_CHROME=... BASE=http://127.0.0.1:4173 node repro/bundle.mjs
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || 'http://127.0.0.1:4173'
const WEB = path.resolve(new URL('..', import.meta.url).pathname, 'web')
const results = []
const check = (name, ok, got) => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${got !== undefined ? `  ::  ${got}` : ''}`)
}
const kb = (n) => (n / 1000).toFixed(1) + 'kB'

/* ---------- 1. what is in which chunk ---------- */

const dist = path.join(WEB, 'dist/assets')
const js = fs.readdirSync(dist).filter((f) => f.endsWith('.js'))
const read = (f) => fs.readFileSync(path.join(dist, f), 'utf8')
const find = (prefix) => js.find((f) => f.startsWith(prefix + '-'))

const entry = find('index')
const vreact = find('vendor-react')
const vdb = find('vendor-db')
const disc = find('DiscoverTab')
const mk = js.find((f) => /blockquote/.test(read(f)) && /fences|Lexer/.test(read(f)))

check('there is a react vendor chunk', Boolean(vreact), vreact || 'none')
check('there is a db vendor chunk', Boolean(vdb), vdb || 'none')
// The entry is where every launch's app code lives. React being out of it is the
// point.
//
// The marker matters: `createRoot` was the first thing tried and it is present
// in the entry as a CALL, from main.jsx, so it reported React in a chunk that
// does not contain it. `Minified React error` is a string react-dom ships in its
// production build and nothing else in this app writes.
const REACT_INSIDE = /Minified React error|__reactFiber\$/
check('React is NOT in the entry chunk',
  Boolean(entry) && !REACT_INSIDE.test(read(entry)) && REACT_INSIDE.test(read(vreact)),
  `${entry} ${kb(fs.statSync(path.join(dist, entry)).size)}`)
check('the markdown parser is its own chunk', Boolean(mk) && mk !== disc && mk !== entry, mk || 'none')
check('...and is not in the Discover chunk', Boolean(disc) && !/blockquote/.test(read(disc)),
  `${disc} ${kb(fs.statSync(path.join(dist, disc)).size)}`)

/* ---------- 2. a deploy renames the app chunk and nothing else ---------- */
// The mechanism IS the content hash, so this builds twice with one app file
// changed rather than reasoning about what the hash would do.
const touched = path.join(WEB, 'src/lib/format.js')
const original = fs.readFileSync(touched, 'utf8')
const out = path.join(WEB, 'dist-deploytest')
// A COMMENT is not a deploy. The first version of this appended one, esbuild
// stripped it, the bytes came out identical, the hash did not move and the test
// reported that a deploy does not rename the app chunk. The probe has to be a
// change that survives minification, so it edits a literal that ships.
const PROBE = [/&output=webp&q=82`/, '&output=webp&q=81`']
if ((original.match(PROBE[0]) || []).length !== 1) {
  check('the deploy probe still has exactly one anchor to edit', false, 'format.js changed shape')
}
try {
  fs.writeFileSync(touched, original.replace(PROBE[0], PROBE[1]))
  execFileSync('npx', ['vite', 'build', '--outDir', 'dist-deploytest', '--emptyOutDir'], {
    cwd: WEB,
    stdio: 'pipe',
    env: {
      ...process.env,
      VITE_SUPABASE_URL: 'https://eiskobjlvxzwvucgpenk.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'stub-anon-key',
    },
  })
  const after = fs.readdirSync(path.join(out, 'assets')).filter((f) => f.endsWith('.js'))
  const nameOf = (list, prefix) => list.find((f) => f.startsWith(prefix + '-')) || 'missing'
  const stableReact = nameOf(after, 'vendor-react') === vreact
  const stableDb = nameOf(after, 'vendor-db') === vdb
  const movedEntry = nameOf(after, 'index') !== entry
  check('a change to app code does not rename the React chunk', stableReact, `${vreact} -> ${nameOf(after, 'vendor-react')}`)
  check('...nor the db chunk', stableDb, `${vdb} -> ${nameOf(after, 'vendor-db')}`)
  check('...and DOES rename the app chunk', movedEntry, `${entry} -> ${nameOf(after, 'index')}`)
  // Guarded, because this file is meant to be RUN against the build before the
  // split as well - and there the vendor chunks do not exist. A harness that
  // throws on the old build reports nothing about it.
  const sizeOf = (f) => (f && f !== 'missing' && fs.existsSync(path.join(dist, f)) ? fs.statSync(path.join(dist, f)).size : 0)
  const cost = fs.statSync(path.join(out, 'assets', nameOf(after, 'index'))).size
  const wouldHaveBeen = cost + sizeOf(vreact) + sizeOf(vdb)
  console.log(`note   a deploy now moves ${kb(cost)} of the ${kb(wouldHaveBeen)} that used to be one chunk`)
} finally {
  fs.writeFileSync(touched, original)
  fs.rmSync(out, { recursive: true, force: true })
}

/* ---------- 3. Browse does not pay for Ask AI ---------- */

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'block' })
const page = await ctx.newPage()
const chunks = []
page.on('request', (r) => {
  const u = r.url()
  if (u.includes('/assets/') && u.endsWith('.js')) chunks.push(u.split('/assets/')[1])
})
const json = (r, x) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) })
await page.route('**/rest/v1/**', (r) => json(r, []))
await page.route('**/api/chat**', (r) =>
  json(r, { reply: '## A heading\n\nSome **bold** text and a list:\n\n- one\n- two' }))
await page.route('**/api/**', (r) => (r.request().url().includes('/api/chat') ? r.fallback() : json(r, { games: [] })))
await page.route('**images.igdb.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>' }))
await page.route('**wsrv.nl/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>' }))
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(900)

await page.locator('.tabbar-btn', { hasText: 'Discover' }).first().click()
await page.waitForTimeout(1600)
await page.getByRole('tab', { name: 'Browse' }).click()
await page.waitForTimeout(2000)
const afterBrowse = [...chunks]
check('opening Browse does not fetch the markdown parser',
  !afterBrowse.some((c) => c.startsWith('marked')), afterBrowse.filter((c) => c.startsWith('marked')).join(',') || 'not fetched')
check('...and Browse rendered', (await page.locator('.shelf, .rail, .lane-chip, .showing-strip').count()) > 0, 'yes')

await page.getByRole('tab', { name: 'Ask AI' }).click()
await page.waitForTimeout(2200)
check('opening Ask AI does fetch it', chunks.some((c) => c.startsWith('marked')),
  chunks.filter((c) => c.startsWith('marked')).join(',') || 'never fetched')

/* ---------- 4. and a reply is still markdown ---------- */
const box = page.locator('.chat-input-row textarea, .chat-input-row input').first()
let replied = false
try {
  await box.fill('hello')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2500)
  replied = true
} catch { /* the composer is behind an access key on some builds */ }
if (replied) {
  const md = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.chat-bubble.assistant')].pop()
    return b ? { h: b.querySelectorAll('h2').length, strong: b.querySelectorAll('strong').length, li: b.querySelectorAll('li').length, plain: b.querySelectorAll('.chat-md-plain').length } : null
  })
  check('an assistant reply still renders as markdown, not as text',
    Boolean(md) && md.h === 1 && md.strong === 1 && md.li === 2 && md.plain === 0, JSON.stringify(md))
  // The fallback is on screen for a frame or two, so nothing else would notice
  // if its whitespace rule went missing - and without it the swap from plain to
  // parsed is a reflow rather than a change of typography.
  const ws = await page.evaluate(() => {
    const el = document.createElement('div')
    el.className = 'chat-md-plain'
    document.body.appendChild(el)
    const w = getComputedStyle(el).whiteSpace
    el.remove()
    return w
  })
  check('the plain-text fallback keeps the reply line breaks', ws === 'pre-wrap', ws)
} else {
  check('an assistant reply still renders as markdown, not as text', false, 'could not send a message')
}

await browser.close()
const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
