import assert from 'node:assert/strict'
import test from 'node:test'

import { comparisonAvailableOn, genreInsights, periodInsights } from '../src/lib/playInsights.js'

const NOW = new Date(2026, 7, 25, 12)
const day = (daysAgo) => {
  const date = new Date(NOW)
  date.setDate(date.getDate() - daysAgo)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const row = (overrides = {}) => ({
  master_id: 1,
  title: 'Example',
  event_date: day(0),
  minutes_delta: 60,
  achievements_delta: 0,
  percent_after: 20,
  ...overrides,
})

test('period insight shares use the actual period total', () => {
  const result = periodInsights([
    row({ master_id: 1, minutes_delta: 180 }),
    row({ master_id: 2, title: 'Second', minutes_delta: 60 }),
  ], NOW, 7, new Date(2026, 7, 1))
  assert.equal(result.minutes, 240)
  assert.equal(result.byGame[0].share, 0.75)
  assert.equal(result.byGame[1].share, 0.25)
})

test('progress requires a pre-period baseline', () => {
  const result = periodInsights([
    row({ master_id: 1, percent_after: 55 }),
    row({ master_id: 2, title: 'Known Start', event_date: day(8), percent_after: 0, minutes_delta: 0 }),
    row({ master_id: 2, title: 'Known Start', percent_after: 18 }),
  ], NOW, 7)
  const unknown = result.byGame.find((game) => game.master_id === 1)
  const known = result.byGame.find((game) => game.master_id === 2)
  assert.equal(unknown.progressGain, null)
  assert.equal(known.progressGain, 18)
})

test('progress and completion use the last reading before the period', () => {
  const result = periodInsights([
    row({ event_date: day(8), percent_after: 72, minutes_delta: 0 }),
    row({ event_date: day(4), percent_after: 88 }),
    row({ event_date: day(1), percent_after: 100 }),
  ], NOW, 7, new Date(2026, 6, 1))
  assert.equal(result.byGame[0].progressGain, 28)
  assert.equal(result.byGame[0].completed, true)
})

test('genre insights use playtime share and roll the long tail into Other', () => {
  const games = [
    { master_id: 1, genre: 'Tactical RPG' },
    { master_id: 2, genre: 'Action' },
    { master_id: 3, genre: 'Strategy' },
    { master_id: 4, genre: 'Adventure' },
    { master_id: 5, genre: 'Puzzle' },
    { master_id: 6, genre: null },
  ]
  const result = genreInsights([
    row({ master_id: 1, minutes_delta: 360 }),
    row({ master_id: 2, minutes_delta: 260 }),
    row({ master_id: 3, minutes_delta: 180 }),
    row({ master_id: 4, minutes_delta: 120 }),
    row({ master_id: 5, minutes_delta: 40 }),
    row({ master_id: 6, minutes_delta: 40 }),
    row({ master_id: 1, event_date: day(91), minutes_delta: 500 }),
  ], games, NOW)

  assert.deepEqual(result.map((genre) => genre.genre), ['Tactical RPG', 'Action', 'Strategy', 'Adventure', 'Other'])
  assert.deepEqual(result.map((genre) => genre.minutes), [360, 260, 180, 120, 80])
  assert.equal(result.reduce((sum, genre) => sum + genre.share, 0), 1)
})

test('genre insights follow the selected 7- or 30-day period', () => {
  const games = [
    { master_id: 1, genre: 'Strategy' },
    { master_id: 2, genre: 'Action' },
  ]
  const rows = [
    row({ master_id: 1, event_date: day(10), minutes_delta: 120 }),
    row({ master_id: 2, event_date: day(2), minutes_delta: 60 }),
  ]

  assert.deepEqual(genreInsights(rows, games, NOW, 7).map((genre) => genre.genre), ['Action'])
  assert.deepEqual(genreInsights(rows, games, NOW, 30).map((genre) => genre.genre), ['Strategy', 'Action'])
})

test('comparison waits for two fully covered periods', () => {
  const first = new Date(2026, 7, 8)
  const available = comparisonAvailableOn(first, 30)
  assert.equal(available.getFullYear(), 2026)
  assert.equal(available.getMonth(), 9)
  assert.equal(available.getDate(), 6)
})

test('30-day trend produces four chronological buckets', () => {
  const result = periodInsights([
    row({ event_date: day(29), minutes_delta: 30 }),
    row({ event_date: day(0), minutes_delta: 90 }),
  ], NOW, 30)
  assert.equal(result.buckets.length, 4)
  assert.equal(result.buckets[0].minutes, 30)
  assert.equal(result.buckets[3].minutes, 90)
})
