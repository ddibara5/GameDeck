import test from 'node:test'
import assert from 'node:assert/strict'
import { activityDate, activityProgress } from '../src/lib/activityPresentation.js'

test('activity date headings preserve the calendar day and disambiguate old years', () => {
  assert.deepEqual(activityDate('2026-09-10', new Date(2026, 8, 20)), { weekday: 'Thursday', date: 'September 10' })
  assert.equal(activityDate('2025-09-10', new Date(2026, 8, 20)).date, 'September 10, 2025')
  assert.deepEqual(activityDate(null), { weekday: 'Unknown date', date: '' })
})

test('activity progress uses historical snapshots rather than current library totals', () => {
  const game = { length_minutes: 100, playtime_minutes: 99, percent: 90 }
  assert.deepEqual(activityProgress({ playtime_minutes_after: 25, percent_after: 8 }, game), { percent: 25, label: 'Estimated story progress' })
  assert.deepEqual(activityProgress({ percent_after: 8 }, game), { percent: 8, label: 'Achievement completion' })
  assert.deepEqual(activityProgress({ playtime_minutes_after: 25, percent_after: 8 }, { length_minutes: 0 }), { percent: 8, label: 'Achievement completion' })
})

test('activity progress retains zero, omits unknown values, and clamps invalid ranges', () => {
  assert.equal(activityProgress({ percent_after: 0 }, null).percent, 0)
  assert.equal(activityProgress({ percent_after: null }, null), null)
  assert.equal(activityProgress({ percent_after: 'invalid' }, null), null)
  assert.equal(activityProgress({ percent_after: 120 }, null).percent, 100)
  assert.equal(activityProgress({ percent_after: -5 }, null).percent, 0)
})
