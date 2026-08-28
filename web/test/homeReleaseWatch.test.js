import assert from 'node:assert/strict'
import test from 'node:test'

import { CARD_CATALOG, migrateHomeCards } from '../src/lib/homeCards.js'

test('Home defaults to snapshot, now playing, then release watch', () => {
  assert.deepEqual(
    CARD_CATALOG.map((card) => card.key),
    ['week', 'now_playing', 'release_watch'],
  )
})

test('the stock legacy layout becomes the consolidated Home layout', () => {
  const migrated = migrateHomeCards({
    order: ['now_playing', 'week', 'leaving_gp', 'coming_up', 'recently_released'],
    enabled: {
      now_playing: true,
      week: true,
      leaving_gp: true,
      coming_up: false,
      recently_released: true,
    },
  })

  assert.deepEqual(migrated.order, ['week', 'now_playing', 'release_watch'])
  assert.equal(migrated.enabled.release_watch, true)
  assert.equal('leaving_gp' in migrated.enabled, false)
  assert.equal('coming_up' in migrated.enabled, false)
  assert.equal('recently_released' in migrated.enabled, false)
})

test('a customized layout keeps its position while legacy release cards merge', () => {
  const migrated = migrateHomeCards({
    order: ['leaving_gp', 'recently_released', 'week', 'coming_up', 'now_playing'],
    enabled: { leaving_gp: true, recently_released: false, week: true, coming_up: false, now_playing: true },
  })

  assert.deepEqual(migrated.order, ['release_watch', 'week', 'now_playing'])
  assert.equal(migrated.enabled.release_watch, false)
})

test('a current saved layout drops the retired Game Pass card', () => {
  const migrated = migrateHomeCards({
    order: ['week', 'now_playing', 'release_watch', 'leaving_gp'],
    enabled: { week: true, now_playing: true, release_watch: true, leaving_gp: true },
  })

  assert.deepEqual(migrated.order, ['week', 'now_playing', 'release_watch'])
  assert.equal('leaving_gp' in migrated.enabled, false)
})
