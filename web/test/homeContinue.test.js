import assert from 'node:assert/strict'
import test from 'node:test'
import { selectContinueGame } from '../src/lib/homeContinue.js'

const playing = () => 'playing'

test('selects the most recently played in-progress game', () => {
  const games = [
    { id: 1, playtime_minutes: 120, last_played: '2026-09-10T12:00:00Z' },
    { id: 2, playtime_minutes: 45, last_played: '2026-09-18T12:00:00Z' },
    { id: 3, playtime_minutes: 300, last_played: '2026-09-15T12:00:00Z' },
  ]
  assert.equal(selectContinueGame(games, playing).id, 2)
})

test('skips finished and abandoned games even when they were played last', () => {
  const games = [
    { id: 1, playtime_minutes: 120, last_played: '2026-09-18T12:00:00Z' },
    { id: 2, playtime_minutes: 45, last_played: '2026-09-17T12:00:00Z' },
  ]
  const statusOf = (game) => (game.id === 1 ? 'finished' : 'playing')
  assert.equal(selectContinueGame(games, statusOf).id, 2)
})

test('skips games with no playtime', () => {
  const games = [
    { id: 1, playtime_minutes: 0, last_played: '2026-09-18T12:00:00Z' },
    { id: 2, playtime_minutes: 30, last_played: '2026-09-17T12:00:00Z' },
  ]
  assert.equal(selectContinueGame(games, playing).id, 2)
})

test('hides the hero when no game has a valid last_played', () => {
  const games = [
    { id: 1, playtime_minutes: 120, last_played: null },
    { id: 2, playtime_minutes: 45, last_played: 'not-a-date' },
  ]
  assert.equal(selectContinueGame(games, playing), null)
})

test('returns null when nothing is eligible', () => {
  assert.equal(selectContinueGame([], playing), null)
  assert.equal(selectContinueGame(null, playing), null)
  assert.equal(
    selectContinueGame([{ id: 1, playtime_minutes: 60, last_played: '2026-09-18T12:00:00Z' }], () => 'finished'),
    null,
  )
})

test('exact timestamp ties keep the first game, deterministically', () => {
  const games = [
    { id: 1, playtime_minutes: 60, last_played: '2026-09-18T12:00:00Z' },
    { id: 2, playtime_minutes: 90, last_played: '2026-09-18T12:00:00Z' },
  ]
  assert.equal(selectContinueGame(games, playing).id, 1)
  assert.equal(selectContinueGame([...games].reverse(), playing).id, 2)
})
