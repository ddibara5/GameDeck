import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  NEW_LANE,
  interleave,
  laneReason,
  rankCandidates,
  rankingWeight,
  rankLanes,
  tasteContribution,
} from '../src/lib/discoverTaste.js'

const NOW = Date.parse('2026-08-25T12:00:00Z')

function played(overrides = {}) {
  return {
    title: 'Example',
    keywords: ['soulslike'],
    playtime_minutes: 1200,
    last_played: '2026-08-20T12:00:00Z',
    personalRank: null,
    ...overrides,
  }
}

test('rankings stay bounded and not-for-me contributes no positive taste evidence', () => {
  assert.equal(rankingWeight({ reaction: 'not_for_me', score: 1800, comparison_count: 20 }), 0)
  assert.ok(rankingWeight({ reaction: 'loved', score: 1800, comparison_count: 20 }) <= 1.5)
  assert.ok(rankingWeight({ reaction: 'mixed', score: 1200, comparison_count: 20 }) >= 0.45)
})

test('recent play matters more and logarithmic playtime prevents one title from dominating', () => {
  const recent = tasteContribution(played(), NOW)
  const old = tasteContribution(played({ last_played: '2025-08-20T12:00:00Z' }), NOW)
  const marathon = tasteContribution(played({ playtime_minutes: 12000 }), NOW)
  assert.ok(recent > old)
  assert.ok(marathon < recent * 3)
})

test('lane explanations use explicit ranking reactions and reject negative exemplars', () => {
  const lanes = rankLanes(
    [
      played({ title: 'Loved Game', personalRank: { reaction: 'loved', score: 1680, comparison_count: 8 } }),
      played({ title: 'Liked Game', playtime_minutes: 600, personalRank: { reaction: 'liked', score: 1560, comparison_count: 4 } }),
      played({ title: 'Long Dislike', playtime_minutes: 60000, personalRank: { reaction: 'not_for_me', score: 1300, comparison_count: 10 } }),
    ],
    NOW,
  )
  assert.equal(lanes[0].exemplar, 'Loved Game')
  assert.equal(lanes[0].count, 2)
  assert.equal(laneReason(lanes[0]), 'Because you loved Loved Game')
})

test('taste attribution wins over the generic New lane for duplicate games', () => {
  const taste = { key: 'soulslike', label: 'Soulslike' }
  const duplicate = { id: 1, name: 'Shared Game' }
  const feed = interleave([taste, NEW_LANE], {
    soulslike: [duplicate, { id: 2, name: 'Taste Game' }],
    new: [duplicate, { id: 3, name: 'New Game' }],
  })
  assert.equal(feed[0].lane.key, 'soulslike')
  assert.equal(feed.filter((game) => game.id === 1).length, 1)
  assert.equal(feed[2].lane.key, 'new')
})

test('candidate ranking balances freshness with confidence-weighted quality', () => {
  const released = Math.floor(Date.parse('2026-08-01T12:00:00Z') / 1000)
  const ranked = rankCandidates(
    [
      { id: 1, rating: 100, ratingCount: 1, released },
      { id: 2, rating: 84, ratingCount: 200, released },
    ],
    NOW,
  )
  assert.equal(ranked[0].id, 2)
})

test('Discover presents two destination tabs and a separate Ask AI action', async () => {
  const source = await readFile(new URL('../src/components/DiscoverTab.jsx', import.meta.url), 'utf8')
  assert.equal((source.match(/role="tab"/g) || []).length, 2)
  assert.match(source, /className="discover-ask-button"/)
  assert.doesNotMatch(source, /role="tab"[^>]*>[\s\S]{0,100}Ask AI/)
})
