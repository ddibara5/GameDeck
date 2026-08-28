import assert from 'node:assert/strict'
import test from 'node:test'

import { isOut, relOf, releaseCalendarDay, releaseDaysFromToday } from '../src/lib/wishlistRelease.js'

const seconds = (year, month, day) => Date.UTC(year, month - 1, day) / 1000

test('a precise release becomes Out now on its local calendar day', () => {
  const rel = relOf({ date_precision: 'day', released: seconds(2026, 8, 27) })
  const releaseDay = releaseCalendarDay(rel)
  const lateToday = new Date(2026, 7, 27, 23, 59)

  assert.deepEqual(
    [releaseDay.getFullYear(), releaseDay.getMonth(), releaseDay.getDate()],
    [2026, 7, 27],
  )
  assert.equal(releaseDaysFromToday(rel, lateToday), 0)
  assert.equal(isOut(rel, lateToday), true)
})

test('only future calendar days remain upcoming', () => {
  const rel = relOf({ date_precision: 'day', released: seconds(2026, 8, 28) })
  const today = new Date(2026, 7, 27, 12)

  assert.equal(releaseDaysFromToday(rel, today), 1)
  assert.equal(isOut(rel, today), false)
})

test('the prior calendar day remains released after midnight', () => {
  const rel = relOf({ date_precision: 'day', released: seconds(2026, 8, 27) })
  const tomorrow = new Date(2026, 7, 28, 0, 1)

  assert.equal(releaseDaysFromToday(rel, tomorrow), -1)
  assert.equal(isOut(rel, tomorrow), true)
})
