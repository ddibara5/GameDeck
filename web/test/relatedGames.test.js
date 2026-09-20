import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const api = readFileSync(new URL('../api/discover.js', import.meta.url), 'utf8')
const discover = readFileSync(new URL('../src/lib/discover.js', import.meta.url), 'utf8')
const sheet = readFileSync(new URL('../src/components/GameSheet.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/components/gameSheet.css', import.meta.url), 'utf8')
const indexCss = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

test('detail hydration requests and normalizes IGDB related games without bloating rails', () => {
  assert.match(api, /DETAIL_GAME_FIELDS = .*similar_games/)
  assert.match(api, /similarGameIds:/)
  assert.match(api, /DETAIL_GAME_FIELDS.*where id/s)
  assert.match(discover, /GAME_DETAIL_CACHE_VERSION = 'v2'/)
  assert.match(discover, /fetchGamesByIds/)
})

test('GameSheet renders one related-games rail for both Discover and Library details', () => {
  assert.match(sheet, /Related games/)
  assert.match(sheet, /Games similar to/)
  assert.match(sheet, /libraryByIgdb/)
  assert.match(sheet, /Wishlisted/)
  assert.match(sheet, /variant: 'owned'/)
  assert.match(sheet, /variant: 'discover'/)
  assert.match(css, /\.gs-related-strip/)
  assert.match(css, /\.gs-related-card/)
})

test('bottom navigation weight matches the lighter sibling-app treatment', () => {
  assert.match(indexCss, /\.tabbar-btn,\s*\.tabbar-btn\.active\s*\{\s*font-weight: var\(--w-semi\)/s)
  assert.match(indexCss, /\.tabbar-icon svg,\s*\.global-search-trigger svg\s*\{\s*stroke-width: 1\.8/s)
})
