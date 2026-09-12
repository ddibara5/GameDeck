import assert from 'node:assert/strict'
import test from 'node:test'
import {
  currentPlay,
  gameArtworkUrl,
  percentage,
  storyProgress,
  summarizeWeekActivity,
  toHomeActivityItem,
} from '../src/lib/homeInsights.js'

test('gameArtworkUrl follows the pilot artwork rule', () => {
  assert.equal(
    gameArtworkUrl('co39vc', null),
    'https://images.igdb.com/igdb/image/upload/t_cover_big/co39vc.jpg',
  )
  assert.equal(gameArtworkUrl('https://example.com/a.jpg', null), 'https://example.com/a.jpg')
  assert.equal(gameArtworkUrl(null, 'https://example.com/b.jpg'), 'https://example.com/b.jpg')
  assert.equal(gameArtworkUrl('http://example.com/a.jpg', null), null)
  assert.equal(gameArtworkUrl('not a url', 'https://example.com/b.jpg'), 'https://example.com/b.jpg')
  assert.equal(gameArtworkUrl(null, null), null)
})

test('percentage and storyProgress match the pilot', () => {
  assert.equal(percentage(42.4), 42)
  assert.equal(percentage(140), 100)
  assert.equal(percentage(-3), 0)
  assert.equal(percentage(null), null)
  assert.equal(storyProgress(30, 60), 50)
  assert.equal(storyProgress(10, 0), null)
  assert.equal(storyProgress(10, null), null)
})

test('toHomeActivityItem maps the activity view row', () => {
  const row = {
    master_id: 7,
    title: 'Hades',
    environment: 'PC',
    event_date: '2026-09-10T14:00:00',
    minutes_delta: 65,
    achievements_delta: 2,
    percent_after: 81.6,
    cover_small: 'https://example.com/c.jpg',
  }
  const item = toHomeActivityItem(row)
  assert.equal(item.masterId, 7)
  assert.equal(item.title, 'Hades')
  assert.equal(item.eventDate, '2026-09-10')
  assert.equal(item.minutes, 65)
  assert.equal(item.achievements, 2)
  assert.equal(item.percent, 82)
  assert.equal(item.progressLabel, 'Achievement completion')
  assert.equal(item.artwork, 'https://example.com/c.jpg')
})

test('summarizeWeekActivity buckets seven local days', () => {
  const today = new Date(2026, 8, 11, 12, 0, 0) // Sep 11, local
  const rows = [
    { master_id: 1, title: 'A', event_date: '2026-09-11T10:00:00', minutes_delta: 60, achievements_delta: 1, percent_after: null },
    { master_id: 1, title: 'A', event_date: '2026-09-10T10:00:00', minutes_delta: 25, achievements_delta: 0, percent_after: null },
    { master_id: 2, title: 'B', event_date: '2026-09-09T10:00:00', minutes_delta: 90, achievements_delta: 3, percent_after: null },
    { master_id: 3, title: 'Old', event_date: '2026-08-01T10:00:00', minutes_delta: 999, achievements_delta: 9, percent_after: null },
  ]
  const summary = summarizeWeekActivity(rows, today)
  assert.equal(summary.days.length, 7)
  assert.equal(summary.days[6].key, '2026-09-11')
  assert.equal(summary.minutes, 175)
  assert.equal(summary.achievements, 4)
  assert.equal(summary.activeDays, 3)
  assert.equal(summary.gameCount, 2)
  assert.equal(summary.games[0].item.title, 'B')
  assert.equal(summary.games[0].minutes, 90)
  assert.equal(summary.games.length, 2)
})

test('summarizeWeekActivity keeps only the top five games', () => {
  const today = new Date(2026, 8, 11, 12, 0, 0)
  const rows = Array.from({ length: 7 }, (_, i) => ({
    master_id: i + 1,
    title: `Game ${i + 1}`,
    event_date: '2026-09-11T10:00:00',
    minutes_delta: (i + 1) * 10,
    achievements_delta: 0,
    percent_after: null,
  }))
  const summary = summarizeWeekActivity(rows, today)
  assert.equal(summary.games.length, 5)
  assert.equal(summary.games[0].minutes, 70)
})

test('currentPlay picks the most recently played library game', () => {
  const games = [
    { master_id: 1, title: 'Old', last_played: '2026-09-01T10:00:00Z', playtime_minutes: 100, length_minutes: 200, percent: 30, platforms: ['PC'], cover_igdb: 'co1' },
    { master_id: 2, title: 'New', last_played: '2026-09-10T10:00:00Z', playtime_minutes: 50, length_minutes: null, percent: 81.4, platforms: ['Xbox'], cover_igdb: null, cover_standard: 'https://example.com/s.jpg' },
    { master_id: 3, title: 'Never', last_played: null, playtime_minutes: 0, length_minutes: null, percent: null, platforms: [] },
  ]
  const insights = {
    games: [{ item: { masterId: 2 }, minutes: 25 }],
  }
  const play = currentPlay(games, insights)
  assert.equal(play.item.title, 'New')
  assert.equal(play.item.progress, 81)
  assert.equal(play.item.progressLabel, 'Achievement completion')
  assert.equal(play.weeklyMinutes, 25)
  assert.equal(play.totalMinutes, 50)
  assert.equal(play.item.artwork, 'https://example.com/s.jpg')
  assert.equal(play.game.master_id, 2)
})

test('currentPlay prefers story progress over achievement percent', () => {
  const games = [
    { master_id: 1, title: 'Story', last_played: '2026-09-10T10:00:00Z', playtime_minutes: 100, length_minutes: 200, percent: 10, platforms: [] },
  ]
  const play = currentPlay(games, null)
  assert.equal(play.item.progress, 50)
  assert.equal(play.item.progressLabel, 'Story progress')
})

test('currentPlay falls back to the latest insights row without a total', () => {
  const play = currentPlay([], {
    games: [
      { item: { masterId: 9, title: 'Fallback', eventDate: '2026-09-05', minutes: 20 }, minutes: 20 },
    ],
  })
  assert.equal(play.item.title, 'Fallback')
  assert.equal(play.weeklyMinutes, 20)
  assert.equal(play.totalMinutes, null)
  assert.equal(play.game, null)
})

test('currentPlay is null with nothing to show', () => {
  assert.equal(currentPlay([], null), null)
  assert.equal(currentPlay([{ master_id: 1, last_played: 'not a date' }], null), null)
})
