import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fetchReleaseCandidates, releaseDate, releaseLabel, releaseWatch } from '../src/lib/homeReleaseWatch.js'

const home = readFileSync(new URL('../src/components/HomeTab.jsx', import.meta.url), 'utf8')
const nowPlaying = readFileSync(new URL('../src/components/HomeNowPlaying.jsx', import.meta.url), 'utf8')
const releaseWatchSrc = readFileSync(new URL('../src/components/HomeReleaseWatch.jsx', import.meta.url), 'utf8')

test('Home renders its four fixed cards in pilot order', () => {
  const nowPlayingSlot = home.indexOf('nowPlayingSlot')
  const recentPlaySlot = home.indexOf('recentPlaySlot')
  const releaseSlot = home.indexOf('releaseSlot')
  const forYou = home.indexOf('<HomeForYouCard')

  assert.ok(nowPlayingSlot > 0, 'now playing slot exists')
  assert.ok(recentPlaySlot > nowPlayingSlot, 'recent play renders after now playing')
  assert.ok(releaseSlot > recentPlaySlot, 'release watch renders after recent play')
  assert.ok(forYou > releaseSlot, 'for you card renders last')
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

test('Home wires the card navigation', () => {
  assert.match(home, /onOpenTab\('insights'\)/)
  assert.match(home, /onOpenList\('wishlist'\)/)
  assert.match(home, /onOpenTab\('foryou'\)/)
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

test('releaseWatch splits coming up and out now, two each', () => {
  const today = new Date(2026, 8, 11, 12, 0, 0)
  const day = 86400
  const base = Date.UTC(2026, 8, 11) / 1000
  const items = [
    { igdb_id: 1, title: 'Far 1', released: base + 30 * day },
    { igdb_id: 2, title: 'Far 2', released: base + 10 * day },
    { igdb_id: 3, title: 'Far 3', released: base + 20 * day },
    { igdb_id: 4, title: 'Past 1', released: base - 5 * day },
    { igdb_id: 5, title: 'Past 2', released: base - 1 * day },
    { igdb_id: 6, title: 'Past 3', released: base - 9 * day },
    { igdb_id: 7, title: 'Undated' },
  ]
  const { comingUp, outNow } = releaseWatch(items, today)
  assert.deepEqual(comingUp.map((i) => i.title), ['Far 2', 'Far 3'])
  assert.deepEqual(outNow.map((i) => i.title), ['Past 2', 'Past 1'])
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
