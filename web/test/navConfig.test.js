import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { DEST_CATALOG, GROUP_LABEL, getNavConfig } from '../src/lib/navConfig.js'

test('drawer is a compact place map with shelf filters and actions elsewhere', () => {
  assert.deepEqual(Object.values(GROUP_LABEL), ['Your games', 'Explore'])
  assert.deepEqual(
    DEST_CATALOG.map((destination) => destination.key),
    ['home', 'library', 'activity', 'insights', 'rankings', 'discover', 'news', 'wishlist'],
  )
  assert.ok(!DEST_CATALOG.some((destination) => ['backlog', 'playing', 'finished', 'shuffle', 'settings'].includes(destination.key)))
})

test('the compact drawer keeps every surviving destination in its intended group', () => {
  const groups = DEST_CATALOG.map((destination) => destination.group)
  assert.deepEqual(groups, ['games', 'games', 'games', 'games', 'games', 'explore', 'explore', 'explore'])
})

test('legacy drawer state regroups surviving rows without resetting the bar', () => {
  const stored = {
    order: ['home', 'library', 'activity', 'insights', 'discover', 'news', 'wishlist', 'shuffle', 'backlog', 'playing', 'finished', 'rankings'],
    bar: ['library', 'home', 'discover', 'activity', 'news', 'rankings'],
    enabled: { library: true, home: true, discover: true, activity: false, news: false, rankings: false },
    labels: false,
  }
  global.localStorage = { getItem: () => JSON.stringify(stored) }
  const config = getNavConfig()
  delete global.localStorage
  assert.deepEqual(config.order, ['home', 'library', 'activity', 'insights', 'rankings', 'discover', 'news', 'wishlist'])
  assert.deepEqual(config.bar, stored.bar)
  assert.equal(config.labels, false)
})

test('drawer geometry and pinned actions stay compact', async () => {
  const [css, menu] = await Promise.all([
    readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Menu.jsx', import.meta.url), 'utf8'),
  ])
  assert.match(css, /\.drawer\s*\{[\s\S]*?width:\s*min\(80vw, 320px\)/)
  assert.match(menu, /\n\s*Shuffle\s*\n\s*<\/button>/)
  assert.match(menu, /\n\s*Settings\s*\n\s*<\/button>/)
  assert.doesNotMatch(menu, /\n\s*Customize\s*\n\s*<\/button>/)
  assert.doesNotMatch(menu, /GameDeck · \{counts\.library\} games/)
})
