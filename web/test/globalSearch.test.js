import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  buildAppLocation,
  defaultSearchScope,
  filterTitleMatches,
  readAppLocation,
} from '../src/lib/appLocation.js'

test('global search defaults to the current product context', () => {
  assert.equal(defaultSearchScope({ activeTab: 'library' }), 'library')
  assert.equal(defaultSearchScope({ activeTab: 'discover' }), 'catalog')
  assert.equal(defaultSearchScope({ activeTab: 'home', view: 'wishlist' }), 'wishlist')
  assert.equal(defaultSearchScope({ activeTab: 'home' }), 'all')
})

test('shell locations preserve unrelated auth parameters', () => {
  const href = 'https://gamedeck.example/?code=auth-code&tab=home#session'
  const next = buildAppLocation(href, {
    tab: 'discover',
    view: null,
    searchOpen: true,
    searchScope: 'catalog',
  })
  assert.equal(next, '/?code=auth-code&tab=discover&search=1&scope=catalog#session')
  assert.deepEqual(
    readAppLocation(`https://gamedeck.example${next}`, new Set(['home', 'discover']), 'home'),
    { tab: 'discover', view: null, searchOpen: true, searchScope: 'catalog' },
  )
})

test('title matching is case-insensitive, bounded, and stable', () => {
  const games = [{ title: 'Star Wars Outlaws' }, { title: 'STAR WARS Zero Company' }, { title: 'Avowed' }]
  assert.deepEqual(filterTitleMatches(games, 'star wars', (game) => game.title, 1), [games[0]])
})

test('the detached search utility and full-screen search remain accessible', async () => {
  const [tabBar, search, app] = await Promise.all([
    readFile(new URL('../src/components/TabBar.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/GlobalSearch.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
  ])
  assert.match(tabBar, /aria-label="Search GameDeck"/)
  assert.match(search, /role="dialog" aria-modal="true" aria-label="Search GameDeck"/)
  assert.match(search, /name="gamedeck-search"/)
  assert.match(search, /autoComplete="off"/)
  assert.match(search, /spellCheck=\{false\}/)
  assert.match(app, /defaultSearchScope/)
})
