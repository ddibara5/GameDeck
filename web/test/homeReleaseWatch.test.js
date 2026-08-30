import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const home = readFileSync(new URL('../src/components/HomeTab.jsx', import.meta.url), 'utf8')

test('Home renders its three snapshot cards in one fixed order', () => {
  const week = home.indexOf('CARDS.week()')
  const nowPlaying = home.indexOf('CARDS.now_playing()')
  const releaseWatch = home.indexOf('CARDS.release_watch()')

  assert.ok(week > 0)
  assert.ok(nowPlaying > week)
  assert.ok(releaseWatch > nowPlaying)
  assert.match(home, /className="hm-grid solo"/)
})

test('Home no longer exposes or reads card customization', () => {
  assert.doesNotMatch(home, /CustomizeHome|useHomeCards|CARD_BY_KEY|Customize cards/)
})

test('fixed Home cards keep useful empty states', () => {
  assert.match(home, /No recent game to continue yet\./)
  assert.match(home, /No saved releases in the current 60-day window\./)
})
