import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  NEW_LANE,
  candidateOutcomeAdjustment,
  interleave,
  laneOutcomeMultiplier,
  laneReason,
  rankCandidates,
  rankingWeight,
  rankLanes,
  tasteContribution,
} from '../src/lib/discoverTaste.js'
import { buildTasteProfile } from '../src/lib/gameIntelligence.js'

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

test('the shared profile joins recent activity and rankings onto taste rows', () => {
  const profile = buildTasteProfile({
    games: [played({ master_id: 1 }), played({ master_id: 2, title: 'Other' })],
    ranks: [{ master_id: 1, reaction: 'loved', score: 1660, comparison_count: 6 }],
    activity: [
      { master_id: 1, event_date: '2026-08-24', minutes_delta: 90 },
      { master_id: 1, event_date: '2026-08-25', minutes_delta: 30 },
    ],
    wishlist: [{ igdb_id: 9 }],
  })
  assert.equal(profile.rows[0].recent_minutes, 120)
  assert.equal(profile.rows[0].recent_active_days, 2)
  assert.equal(profile.rows[0].personalRank.reaction, 'loved')
  assert.deepEqual(profile.evidence, {
    recentGameCount: 1,
    recentMinutes: 120,
    activeDayCount: 2,
    rankedGameCount: 1,
    wishlistCount: 1,
  })
})

test('recent behavior outweighs an old lifetime marathon', () => {
  const recent = tasteContribution(played({
    playtime_minutes: 300,
    recent_minutes: 240,
    recent_last_played: '2026-08-24',
  }), NOW)
  const oldMarathon = tasteContribution(played({
    playtime_minutes: 30000,
    last_played: '2023-08-24',
  }), NOW)
  assert.ok(recent > oldMarathon)
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

test('wishlist intent promotes a relevant candidate inside its lane', () => {
  const released = Math.floor(Date.parse('2026-08-01T12:00:00Z') / 1000)
  const ranked = rankCandidates(
    [
      { id: 1, rating: 90, ratingCount: 200, released },
      { id: 2, rating: 84, ratingCount: 200, released },
    ],
    NOW,
    { wishlistIds: new Set([2]) },
  )
  assert.equal(ranked[0].id, 2)
})

test('manual refresh promotes near-equal alternatives without hiding a clearly stronger pick', () => {
  const released = Math.floor(Date.parse('2026-08-01T12:00:00Z') / 1000)
  const nearTie = rankCandidates(
    [
      { id: 1, rating: 86, ratingCount: 200, released },
      { id: 2, rating: 84, ratingCount: 200, released },
    ],
    NOW,
    { deprioritizeIds: new Set([1]) },
  )
  assert.equal(nearTie[0].id, 2)

  const clearWinner = rankCandidates(
    [
      { id: 3, rating: 98, ratingCount: 500, released },
      { id: 4, rating: 60, ratingCount: 20, released },
    ],
    NOW,
    { deprioritizeIds: new Set([3]) },
  )
  assert.equal(clearWinner[0].id, 3)
})

test('outcome learning waits for evidence and keeps lane influence bounded', () => {
  assert.equal(laneOutcomeMultiplier({
    exposure_count: 4,
    detail_open_count: 4,
    meaningful_outcome_count: 4,
  }), 1)

  const positive = laneOutcomeMultiplier({
    exposure_count: 20,
    detail_open_count: 12,
    meaningful_outcome_count: 8,
  })
  const ignored = laneOutcomeMultiplier({
    exposure_count: 20,
    detail_open_count: 0,
    meaningful_outcome_count: 0,
  })
  assert.ok(positive > 1 && positive <= 1.1)
  assert.ok(ignored >= 0.9 && ignored < 1)
})

test('per-game learning gently rewards outcomes and suppresses repeated ignores', () => {
  assert.equal(candidateOutcomeAdjustment({ exposure_count: 2 }), 0)
  assert.ok(candidateOutcomeAdjustment({
    exposure_count: 3,
    meaningful_outcome_count: 1,
  }) > 0)
  assert.ok(candidateOutcomeAdjustment({
    exposure_count: 4,
    detail_open_count: 0,
    meaningful_outcome_count: 0,
  }) < 0)

  const released = Math.floor(Date.parse('2026-08-01T12:00:00Z') / 1000)
  const ranked = rankCandidates(
    [
      { id: 1, rating: 86, ratingCount: 200, released },
      { id: 2, rating: 84, ratingCount: 200, released },
    ],
    NOW,
    {
      gameFeedback: new Map([
        ['1', { exposure_count: 6 }],
        ['2', { exposure_count: 3, meaningful_outcome_count: 1 }],
      ]),
    },
  )
  assert.equal(ranked[0].id, 2)
})

test('Discover keeps For You and Browse in a compact accessible selector', async () => {
  const source = await readFile(new URL('../src/components/DiscoverTab.jsx', import.meta.url), 'utf8')
  assert.equal((source.match(/role="tab"/g) || []).length, 2)
  assert.match(source, /role="tablist" aria-label="Discover view"/)
  assert.match(source, /aria-controls="discover-foryou-panel"/)
  assert.match(source, /aria-controls="discover-browse-panel"/)
  assert.doesNotMatch(source, /className="discover-browse-page"/)
  assert.doesNotMatch(source, /className="discover-browse-back"/)
})

test('For You collapses taste controls into the shared Discover filter pattern', async () => {
  const [browse, forYou, preferences] = await Promise.all([
    readFile(new URL('../src/components/DiscoverBrowse.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/DiscoverForYou.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/DiscoverPreferenceFields.jsx', import.meta.url), 'utf8'),
  ])
  assert.match(browse, /className="discover-filter-toolbar"/)
  assert.doesNotMatch(browse, /className="showing-strip"/)
  assert.doesNotMatch(browse, />Show all</)
  assert.match(forYou, /className="discover-filter-toolbar"/)
  assert.match(forYou, /<DiscoverFilterButton/)
  assert.match(forYou, /Recommendation taste/)
  assert.match(forYou, /<DiscoverPreferenceFields prefs=\{prefs\}/)
  assert.doesNotMatch(forYou, /className="lane-chips"/)
  assert.match(preferences, /Hide owned/)
  assert.match(preferences, /Include owned/)
})

test('Discover keeps title search and Ask GameDeck in the global entry point', async () => {
  const [discover, browse, forYou] = await Promise.all([
    readFile(new URL('../src/components/DiscoverTab.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/DiscoverBrowse.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/DiscoverForYou.jsx', import.meta.url), 'utf8'),
  ])
  assert.doesNotMatch(discover, /placeholder="Search all games"/)
  assert.doesNotMatch(browse, /fetchDiscover\(|query\.trim\(\)|DiscoverCard/)
  assert.doesNotMatch(forYou, /Browse catalog/)
  assert.doesNotMatch(forYou, /Ask GameDeck about these picks/)
  assert.doesNotMatch(discover, /DiscoverAsk|discover-ask-view|askOpen/)
  assert.match(discover, /<DiscoverForYou onAsk=\{askAbout\}/)
  assert.match(forYou, /Refreshing picks…/)
  assert.doesNotMatch(forYou, /className="fy-refresh"/)
  assert.doesNotMatch(discover, /sessionStorage/)
})
