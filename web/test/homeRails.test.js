import assert from 'node:assert/strict'
import test from 'node:test'
import {
  gameProgress,
  hasRecentPlay,
  libraryTitleKey,
  sortRecentGames,
  wishlistProgress,
} from '../src/lib/homeRails.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-09-11T12:00:00Z')

function game(overrides = {}) {
  return {
    master_id: 1,
    title: 'Game',
    last_played: null,
    playtime_minutes: null,
    length_minutes: null,
    percent: null,
    igdb_id: null,
    ...overrides,
  }
}

function daysAgo(days, now = NOW) {
  return new Date(now - days * DAY).toISOString()
}

test('hasRecentPlay accepts plays inside the 14-day window', () => {
  assert.equal(hasRecentPlay(game({ last_played: daysAgo(1) }), NOW), true)
  assert.equal(hasRecentPlay(game({ last_played: daysAgo(13) }), NOW), true)
  assert.equal(hasRecentPlay(game({ last_played: daysAgo(14) }), NOW), true)
})

test('hasRecentPlay rejects stale, missing, and future plays', () => {
  assert.equal(hasRecentPlay(game({ last_played: daysAgo(14, NOW - 1000) }), NOW), false)
  assert.equal(hasRecentPlay(game({ last_played: daysAgo(15) }), NOW), false)
  assert.equal(hasRecentPlay(game({ last_played: null }), NOW), false)
  assert.equal(hasRecentPlay(game({ last_played: 'garbage' }), NOW), false)
  // A last_played in the future is not "recent play", it is bad data.
  assert.equal(hasRecentPlay(game({ last_played: new Date(NOW + DAY).toISOString() }), NOW), false)
})

test('gameProgress prefers the story estimate over achievements', () => {
  assert.equal(gameProgress(game({ playtime_minutes: 30, length_minutes: 60, percent: 10 })), 50)
  assert.equal(gameProgress(game({ playtime_minutes: null, length_minutes: null, percent: 81.6 })), 82)
  assert.equal(gameProgress(game({ playtime_minutes: 10, length_minutes: 0, percent: 40 })), 40)
  assert.equal(gameProgress(game()), null)
})

test('sortRecentGames drops games outside the window', () => {
  const recent = game({ master_id: 1, title: 'Recent', last_played: daysAgo(2) })
  const stale = game({ master_id: 2, title: 'Stale', last_played: daysAgo(30) })
  const never = game({ master_id: 3, title: 'Never' })
  assert.deepEqual(sortRecentGames([stale, never, recent]).map((g) => g.master_id), [1])
})

test('sortRecentGames orders by last played, then progress, then title', () => {
  const now = Date.now()
  const mk = (id, title, lastPlayed, playtime, length, percent) =>
    game({
      master_id: id,
      title,
      last_played: lastPlayed,
      playtime_minutes: playtime,
      length_minutes: length,
      percent,
    })
  const older = mk(1, 'Older', new Date(now - 5 * DAY).toISOString(), 0, 100, null)
  // Strictly newest: wins on the primary key alone.
  const newer = mk(2, 'Newer', new Date(now - 12 * 60 * 60 * 1000).toISOString(), 0, 100, null)
  const tiedAt = new Date(now - DAY).toISOString()
  // Same timestamp: higher progress wins the tie.
  const tiedHigh = mk(3, 'Tied low progress', tiedAt, 80, 100, null)
  const tiedLow = mk(4, 'Tied high progress', tiedAt, 10, 100, null)
  // Same timestamp and same progress: title A-Z.
  const alpha = mk(5, 'Alpha', tiedAt, null, null, 20)
  const beta = mk(6, 'Beta', tiedAt, null, null, 20)
  const sorted = sortRecentGames([older, beta, tiedLow, alpha, newer, tiedHigh])
  assert.deepEqual(
    sorted.map((g) => g.master_id),
    [2, 3, 5, 6, 4, 1],
  )
})

test('libraryTitleKey lowercases and strips non-alphanumerics', () => {
  assert.equal(libraryTitleKey('The Legend of Zelda: Breath of the Wild'), 'thelegendofzeldabreathofthewild')
  assert.equal(libraryTitleKey('HADES'), 'hades')
})

test('wishlistProgress matches by igdb id first', () => {
  const now = Date.now()
  const played = game({
    master_id: 7,
    title: 'Hades II',
    igdb_id: 999,
    last_played: new Date(now - DAY).toISOString(),
    playtime_minutes: 25,
    length_minutes: 100,
  })
  const byIgdb = new Map([[999, played]])
  const byTitle = new Map()
  assert.equal(wishlistProgress({ igdb_id: 999, title: 'Something else' }, byIgdb, byTitle), 25)
})

test('wishlistProgress falls back to the title key', () => {
  const now = Date.now()
  const played = game({
    master_id: 8,
    title: 'Hades II',
    igdb_id: null,
    last_played: new Date(now - DAY).toISOString(),
    percent: 42,
  })
  const byIgdb = new Map()
  const byTitle = new Map([[libraryTitleKey('Hades II'), played]])
  // Punctuation and case must not break the lookup.
  assert.equal(wishlistProgress({ igdb_id: 12345, title: 'HADES ii!' }, byIgdb, byTitle), 42)
})

test('wishlistProgress returns null when the match is not recent or absent', () => {
  const now = Date.now()
  const stale = game({
    master_id: 9,
    title: 'Stale Game',
    igdb_id: 55,
    last_played: new Date(now - 60 * DAY).toISOString(),
    percent: 90,
  })
  const byIgdb = new Map([[55, stale]])
  const byTitle = new Map()
  assert.equal(wishlistProgress({ igdb_id: 55, title: 'Stale Game' }, byIgdb, byTitle), null)
  assert.equal(wishlistProgress({ igdb_id: 77, title: 'Unknown' }, byIgdb, byTitle), null)
  assert.equal(wishlistProgress(null, byIgdb, byTitle), null)
})
