import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLibraryIndex, homeNewsPreview } from '../src/lib/news.js'

const story = ({ id, weekOf = '2026-09-14', gameIgdbId = null, publishedAt }) => ({
  id,
  weekOf,
  title: `Story ${id}`,
  primaryUrl: `https://example.com/${id}`,
  sources: [{ name: 'Source', url: `https://example.com/${id}` }],
  publishedAt,
  createdAt: publishedAt,
  gameIgdbId,
  gameName: gameIgdbId ? `Game ${gameIgdbId}` : null,
})

test('Home news preview uses News For You order, then newest backfill', () => {
  const played = {
    igdb_id: 30,
    title: 'Game 30',
    playtime_minutes: 120,
    last_played: new Date().toISOString(),
    franchises: [],
  }
  const rows = [
    story({ id: 'newest-unrelated', publishedAt: '2026-09-20T12:00:00Z' }),
    story({ id: 'wishlisted', gameIgdbId: 20, publishedAt: '2026-09-19T12:00:00Z' }),
    story({ id: 'played', gameIgdbId: 30, publishedAt: '2026-09-18T12:00:00Z' }),
    story({ id: 'older-unrelated', publishedAt: '2026-09-17T12:00:00Z' }),
  ]

  const result = homeNewsPreview(
    rows,
    {
      libIndex: buildLibraryIndex([played]),
      wishlistIds: new Set([20]),
    },
    4,
  )

  assert.deepEqual(
    result.map((entry) => entry.item.id),
    ['played', 'wishlisted', 'newest-unrelated', 'older-unrelated'],
  )
  assert.equal(result[0].rel.why, "Because you're playing Game 30")
  assert.equal(result[1].rel.why, 'On your wishlist')
})

test('Home news preview only uses the newest week', () => {
  const rows = [
    story({ id: 'current', weekOf: '2026-09-14', publishedAt: '2026-09-20T12:00:00Z' }),
    story({ id: 'old-but-wishlisted', weekOf: '2026-09-07', gameIgdbId: 99, publishedAt: '2026-09-13T12:00:00Z' }),
  ]
  const result = homeNewsPreview(rows, { libIndex: buildLibraryIndex([]), wishlistIds: new Set([99]) }, 5)
  assert.deepEqual(result.map((entry) => entry.item.id), ['current'])
})
