import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  BAR_CATALOG,
  DEST_CATALOG,
  KEY,
  MIN_VISIBLE,
  getNavConfig,
  isBarTab,
  resetNavConfig,
  setNavConfig,
  visibleKeys,
} from '../src/lib/navConfig.js'

function makeStorage(initial = {}) {
  const store = new Map(Object.entries(initial))
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  }
}

function withStorage(storage, fn) {
  const prevLocal = globalThis.localStorage
  const prevWindow = globalThis.window
  const events = []
  globalThis.localStorage = storage
  globalThis.window = {
    dispatchEvent: (e) => events.push(e),
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  try {
    return fn(events)
  } finally {
    if (prevLocal === undefined) delete globalThis.localStorage
    else globalThis.localStorage = prevLocal
    if (prevWindow === undefined) delete globalThis.window
    else globalThis.window = prevWindow
  }
}

test('the destination catalog covers every reachable place, with no drawer-only kinds', () => {
  assert.deepEqual(
    DEST_CATALOG.map((d) => d.key),
    ['home', 'discover', 'library', 'activity', 'rankings', 'insights', 'foryou', 'news'],
  )
  // Entry-point-only destinations are still tabs (they render), just not
  // bar-eligible.
  for (const d of DEST_CATALOG) assert.equal(d.kind, 'tab')
  assert.deepEqual(
    BAR_CATALOG.map((d) => d.key),
    ['home', 'discover', 'library', 'activity', 'rankings'],
  )
})

test('the default bar follows the approved Expo order', () => {
  withStorage(makeStorage(), () => {
    const config = getNavConfig()
    assert.deepEqual(config.bar, ['home', 'discover', 'library', 'activity'])
    assert.deepEqual(visibleKeys(config), ['home', 'discover', 'library', 'activity'])
    assert.equal(config.enabled.rankings, false)
    assert.equal(config.labels, true)
    assert.equal(config.barShown, true)
  })
})

test('migration adopts the Expo order but keeps membership, labels and visibility', () => {
  const stored = {
    order: ['home', 'library', 'activity', 'insights', 'rankings', 'discover', 'news', 'wishlist', 'foryou'],
    bar: ['home', 'library', 'discover', 'activity'],
    enabled: { home: true, library: true, discover: false, activity: true, rankings: false },
    labels: true,
    barShown: false,
    collapsed: { games: true },
  }
  withStorage(makeStorage({ [KEY]: JSON.stringify(stored) }), () => {
    const config = getNavConfig()
    assert.deepEqual(config.bar, ['home', 'discover', 'library', 'activity'])
    // discover was disabled in the stored config, so it is hidden.
    assert.deepEqual(visibleKeys(config), ['home', 'library', 'activity'])
    assert.equal(config.labels, true)
    assert.equal(config.barShown, false)
    // Drawer-era state is not carried over.
    assert.ok(!('order' in config))
    assert.ok(!('collapsed' in config))
  })
})

test('a tab the user had on the bar stays on the bar after migration', () => {
  const stored = {
    bar: ['home', 'library', 'discover', 'activity', 'rankings'],
    enabled: { home: true, library: true, discover: true, activity: true, rankings: true },
  }
  withStorage(makeStorage({ [KEY]: JSON.stringify(stored) }), () => {
    const config = getNavConfig()
    assert.deepEqual(visibleKeys(config), ['home', 'discover', 'library', 'activity', 'rankings'])
  })
})

test('entry-point-only destinations are never bar tabs', () => {
  assert.equal(isBarTab('insights'), false)
  assert.equal(isBarTab('foryou'), false)
  assert.equal(isBarTab('news'), false)
  assert.equal(isBarTab('home'), true)
  assert.equal(isBarTab('rankings'), true)
  assert.equal(isBarTab('nope'), false)
})

test('setNavConfig merges and resetNavConfig restores the default', () => {
  withStorage(makeStorage(), () => {
    setNavConfig({ labels: false })
    assert.equal(getNavConfig().labels, false)
    // The bar order survives a membership-only patch.
    assert.deepEqual(getNavConfig().bar, ['home', 'discover', 'library', 'activity'])
    const reset = resetNavConfig()
    assert.equal(reset.labels, true)
    assert.deepEqual(getNavConfig().bar, ['home', 'discover', 'library', 'activity'])
  })
})

test('a custom bar order survives a reload after migration', () => {
  withStorage(makeStorage(), () => {
    // First read migrates and stamps barModel: 2 on write.
    setNavConfig({ bar: ['library', 'home', 'activity', 'discover'] })
    const reloaded = getNavConfig()
    assert.deepEqual(reloaded.bar, ['library', 'home', 'activity', 'discover'])
    assert.deepEqual(
      visibleKeys(reloaded),
      ['library', 'home', 'activity', 'discover'],
    )
    // Unknown keys are dropped and missing defaults are appended, not rebuilt.
    setNavConfig({ bar: ['activity', 'home', 'bogus'] })
    assert.deepEqual(getNavConfig().bar, ['activity', 'home', 'discover', 'library'])
  })
})

test('MIN_VISIBLE still guards the bar editor floor', () => {
  assert.equal(MIN_VISIBLE, 2)
})

test('the drawer is fully gone from the app shell', async () => {
  const [app, brand, tabbar, settings, css] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Brand.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/TabBar.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/SettingsPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
  ])
  for (const [name, src] of [['App', app], ['Brand', brand], ['TabBar', tabbar], ['SettingsPage', settings]]) {
    assert.doesNotMatch(src, /openMenu|closeMenu|menuOpen/, `${name} has no drawer state`)
  }
  assert.doesNotMatch(app, /CustomizeNav|components\/Menu\.jsx/)
  assert.doesNotMatch(settings, /onOpenDrawer|label="Drawer"/)
  assert.doesNotMatch(brand, /Open menu|aria-haspopup/)
  // No drawer component files remain.
  await assert.rejects(readFile(new URL('../src/components/Menu.jsx', import.meta.url), 'utf8'))
  await assert.rejects(
    readFile(new URL('../src/components/CustomizeNav.jsx', import.meta.url), 'utf8'),
  )
  // No drawer CSS remains.
  assert.doesNotMatch(css, /\.drawer\b|\.drawer-|\.menu-fb|\.menu-foot|\.brand-caret/)
  // The bar editor survives: CustomizeBar still imports from navConfig.
  const customizeBar = await readFile(
    new URL('../src/components/CustomizeBar.jsx', import.meta.url),
    'utf8',
  )
  assert.match(customizeBar, /from '\.\.\/lib\/navConfig\.js'/)
})

test('every destination is reachable in the finished build', async () => {
  const [app, home, library, activity, tabbar, browse] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/HomeTab.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/LibraryTab.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ActivityTab.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/TabBar.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/DiscoverBrowse.jsx', import.meta.url), 'utf8'),
  ])
  // Bottom bar: Home, Discover, Library, Activity.
  assert.match(app, /visibleTabs/)
  // Search: detached button, rendered even when the bar is hidden.
  assert.match(tabbar, /searchOnly/)
  assert.match(app, /searchOnly=\{!nav\.barShown\}/)
  // Settings: header gear on Home.
  assert.match(app, /HeaderSettingsButton/)
  // For You / Rankings / Insights: Home "Jump back in" tiles.
  assert.match(home, /key: 'foryou'/)
  assert.match(home, /key: 'insights'/)
  assert.match(home, /key: 'rankings'/)
  // News: featured top story + More news.
  assert.match(home, /onOpenTab\('news'\)/)
  // Library is one collection; Rankings remains on Home and Wishlist in Browse.
  assert.doesNotMatch(library, /onOpenRankings|onOpenWishlist|gd-entries/)
  assert.match(app, /<LibraryTab \/>/)
  assert.match(browse, /row.kind === 'wishlist'/)
  assert.match(browse, /onClick=\{\(\) => setOpenRail\(row\)\}/)
  // Insights: Activity entry point.
  assert.match(activity, /onOpenInsights/)
})
