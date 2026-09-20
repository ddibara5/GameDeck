import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fetchReleaseCandidates, releaseDate, releaseLabel, releaseWatch } from '../src/lib/homeReleaseWatch.js'

const home = readFileSync(new URL('../src/components/HomeTab.jsx', import.meta.url), 'utf8')
const nowPlaying = readFileSync(new URL('../src/components/HomeNowPlaying.jsx', import.meta.url), 'utf8')
const releaseWatchSrc = readFileSync(new URL('../src/components/HomeReleaseWatch.jsx', import.meta.url), 'utf8')

test('Home renders its five sections in the saved layout order', () => {
  assert.match(home, /loadHomeLayout\(\)/)
  assert.match(home, /saveHomeLayout\(/)
  for (const id of ['continue-playing', 'jump-back-in', 'top-story', 'upcoming', 'new-releases']) {
    assert.ok(home.includes(`'${id}'`), `section ${id} rendered`)
  }
  assert.match(home, /homeLayout\.hidden\.includes\(section\)/)
  assert.match(home, /<HomeCustomizeBar/)
  assert.match(home, /<HomeCustomizeSheet/)
})

test('Home cards keep the pilot empty states', () => {
  assert.match(nowPlaying, /Your next session starts here/)
  assert.match(nowPlaying, /Your recent games will appear here/)
  assert.match(releaseWatchSrc, /Save games with release dates to see what’s next\./)
})

test('Home Now Playing is not tappable without a game to open', () => {
  assert.match(nowPlaying, /disabled=\{!tappable\}/)
})

test('Home release watch keeps the soft-failure line under the card', () => {
  assert.match(home, /Couldn’t refresh releases\. Showing the last loaded games\./)
  assert.match(home, /aria-label="Retry Release Watch refresh"/)
})

test('Home release watch errors when the wishlist fails with no data', () => {
  assert.match(home, /Release watch unavailable\./)
  assert.match(home, /Your wishlist could not be loaded\./)
})

test('Home wires the section see-all navigation', () => {
  // The Jump back in tiles navigate by key (For You, Rankings, Insights);
  // the release rails open their list overlays.
  assert.match(home, /key: 'foryou'/)
  assert.match(home, /key: 'rankings'/)
  assert.match(home, /key: 'insights'/)
  assert.match(home, /onOpenList\('released'\)/)
  assert.match(home, /onOpenList\('releases'\)/)
})

test('releaseDate rebuilds the local calendar date from UTC midnight', () => {
  const item = { released: Date.UTC(2026, 8, 15) / 1000 }
  const date = releaseDate(item)
  assert.equal(date.getFullYear(), 2026)
  assert.equal(date.getMonth(), 8)
  assert.equal(date.getDate(), 15)
  assert.equal(releaseDate({ released: null }), null)
  assert.equal(releaseDate({}), null)
})

test('releaseWatch splits coming up and out now, twelve each', () => {
  const today = new Date(2026, 8, 11, 12, 0, 0)
  const day = 86400
  const base = Date.UTC(2026, 8, 11) / 1000
  const items = []
  for (let i = 1; i <= 15; i++) items.push({ igdb_id: i, title: `Far ${i}`, released: base + i * day })
  for (let i = 1; i <= 15; i++) items.push({ igdb_id: 100 + i, title: `Past ${i}`, released: base - i * day })
  items.push({ igdb_id: 999, title: 'Undated' })
  const { comingUp, outNow } = releaseWatch(items, today)
  assert.equal(comingUp.length, 12)
  assert.equal(outNow.length, 12)
  assert.deepEqual(
    comingUp.map((i) => i.title),
    Array.from({ length: 12 }, (_, k) => `Far ${k + 1}`),
  )
  assert.deepEqual(
    outNow.map((i) => i.title),
    Array.from({ length: 12 }, (_, k) => `Past ${k + 1}`),
  )
})

test('releaseLabel covers today, tomorrow, this week, and dated labels', () => {
  const today = new Date(2026, 8, 11, 12, 0, 0)
  const day = 86400
  const base = Date.UTC(2026, 8, 11) / 1000
  assert.equal(releaseLabel({ released: base }, today), 'Out today')
  assert.equal(releaseLabel({ released: base + day }, today), 'Tomorrow')
  assert.equal(releaseLabel({ released: base + 3 * day }, today), 'In 3 days')
  assert.match(releaseLabel({ released: base + 20 * day }, today), /Oct/)
  assert.equal(releaseLabel({ release_label: 'Q4 2026' }, today), 'Q4 2026')
  assert.equal(releaseLabel({}, today), 'Date to come')
})

function mockClient({ data, error, fallback }) {
  return {
    from: () => ({
      select: (cols) => ({
        order: () => {
          if (error && /released/.test(cols) && fallback) return Promise.resolve(fallback)
          return Promise.resolve(error ? { data: null, error } : { data, error: null })
        },
      }),
    }),
  }
}

test('fetchReleaseCandidates returns wishlist rows', async () => {
  const rows = [{ igdb_id: 1, title: 'A' }]
  const result = await fetchReleaseCandidates(mockClient({ data: rows }))
  assert.deepEqual(result, rows)
})

test('fetchReleaseCandidates falls back when the date columns are missing', async () => {
  const rows = [{ igdb_id: 1, title: 'A' }]
  const client = mockClient({
    error: { message: 'column released does not exist' },
    fallback: { data: rows, error: null },
  })
  const result = await fetchReleaseCandidates(client)
  assert.deepEqual(result, rows)
})

test('fetchReleaseCandidates throws on a real failure', async () => {
  const client = mockClient({ error: { message: 'connection reset' } })
  await assert.rejects(() => fetchReleaseCandidates(client), /connection reset/)
})
