import assert from 'node:assert/strict'
import test from 'node:test'
import { libraryMetadata, libraryProgress } from '../src/lib/libraryPresentation.js'

test('Library labels playtime-based progress as an estimate, not achievement completion', () => {
  const game = { length_minutes: 120, playtime_minutes: 90, percent: 12, earned_awards: 2, total_awards: 20, playtime_label: '1h 30m' }
  assert.equal(libraryMetadata(game), '~75% story estimate · 1h 30m')
  assert.equal(libraryProgress(game), 75)
})

test('Library falls back to achievements only when an achievement total is known', () => {
  assert.equal(libraryMetadata({ total_awards: 46, earned_awards: 8, playtime_label: '13h 59m' }), '8/46 achievements · 13h 59m')
  assert.equal(libraryMetadata({ total_awards: 20 }), '0/20 achievements')
  assert.equal(libraryMetadata({ total_awards: 0, playtime_label: '43m' }), '43m')
  assert.equal(libraryMetadata({}), 'View details')
})

test('Library progress stays bounded and preserves achievement fallback for sorting', () => {
  assert.equal(libraryProgress({ length_minutes: 60, playtime_minutes: 90 }), 100)
  assert.equal(libraryProgress({ length_minutes: 60, playtime_minutes: -1 }), 0)
  assert.equal(libraryProgress({ percent: 42 }), 42)
  assert.equal(libraryProgress({}), 0)
})
