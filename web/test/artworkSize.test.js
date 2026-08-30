import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const values = new Map()
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
}

const attrs = new Map()
globalThis.document = {
  documentElement: {
    setAttribute: (key, value) => attrs.set(key, value),
  },
}

const { getArtworkSize, setArtworkSize } = await import('../src/lib/theme.js')

test('legacy shelf and list preferences migrate to their larger global size', () => {
  values.clear()
  values.set('gamedeck_shelf_size_v1', 's')
  values.set('gamedeck_list_size_v1', 'large')

  assert.equal(getArtworkSize(), 'l')
  assert.equal(values.get('gamedeck_artwork_size_v1'), 'l')
})

test('the artwork preference persists and updates the root attribute', () => {
  values.clear()
  attrs.clear()

  assert.equal(setArtworkSize('s'), 's')
  assert.equal(values.get('gamedeck_artwork_size_v1'), 's')
  assert.equal(attrs.get('data-artwork'), 's')

  assert.equal(setArtworkSize('not-a-size'), 'm')
  assert.equal(attrs.get('data-artwork'), 'm')
})

test('one token system reaches every repeatable game-art surface', () => {
  const root = new URL('../src/', import.meta.url)
  const css = (path) => readFileSync(new URL(path, root), 'utf8')

  assert.match(css('cardSize.css'), /data-artwork='s'/)
  assert.match(css('cardSize.css'), /data-artwork='m'/)
  assert.match(css('cardSize.css'), /data-artwork='l'/)
  assert.match(css('components/home.css'), /var\(--game-art-release\)/)
  assert.match(css('components/insights.css'), /var\(--game-art-feature\)/)
  assert.match(css('components/activity.css'), /var\(--game-art-compact\)/)
  assert.match(css('components/discover.css'), /var\(--game-art-rail\)/)
  assert.match(css('components/wishlist.css'), /var\(--game-art-grid-columns\)/)
  assert.match(css('components/rankings.css'), /var\(--game-art-duel\)/)
})

test('Settings exposes one artwork control and an informational scope list', () => {
  const settings = readFileSync(new URL('../src/components/SettingsPage.jsx', import.meta.url), 'utf8')

  assert.match(settings, /label="Game artwork"/)
  assert.match(settings, /label="Cover size"/)
  assert.match(settings, /Applies everywhere/)
  assert.doesNotMatch(settings, /Shelf posters|List rows|getShelfSize|getListSize/)
})
