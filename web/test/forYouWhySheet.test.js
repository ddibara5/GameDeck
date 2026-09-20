// Regression tests for the For You "Why this pick" sheet crash and the
// "Tune this taste" launch shape.
//
// The sheet crashed in production because WhyContent called
// pick.reasons.map() while the engine emits a singular pick.reason string.
// The Tune button never rendered because resolveTuneLaunch expected
// source.masterId and lane.sources while production carries source.id
// (string) and profile-level sources with laneKeys.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

import { whyPickReasons } from '../src/lib/forYouEngine.js'
import { resolveTuneLaunch } from '../src/lib/laneDuel.js'

const root = new URL('../', import.meta.url)
const forYouTabSource = readFileSync(new URL('src/components/ForYouTab.jsx', root), 'utf8')

// An engine-faithful deck pick: singular reason string, engine-shaped
// evidence, no reasons array (this is what selectRecommendations returns).
function enginePick(overrides = {}) {
  return {
    game: { id: 7, title: 'Wishbound', platforms: ['Series X|S'], year: 2026 },
    kind: 'For your tastes',
    reason: 'Because you loved ELDEN RING and liked Hollow Knight.',
    evidence: {
      lane: 'soulslike',
      kind: 'source',
      comparisonCoverageComplete: true,
      source: {
        id: '4242',
        title: 'ELDEN RING',
        reaction: 'loved',
        weight: 5.1,
        traits: ['soulslike'],
        laneKeys: ['soulslike'],
        duel: { uniqueOpponentsDefeated: 3 },
      },
      shared: ['soulslike', 'dark fantasy'],
      laneEvidence: {
        key: 'soulslike',
        label: 'Soulslike',
        evidenceLabel: 'Well-supported',
        positiveSourceCount: 4,
        supportingGameCount: 9,
        uniqueMatchups: 12,
      },
    },
    score: 0.912,
    ...overrides,
  }
}

// A real buildTasteEvidenceProfile-shaped profile: lanes carry an exemplar
// (no sources array); sources live at the profile level with laneKeys.
function productionProfile() {
  return {
    lanes: [
      {
        key: 'soulslike',
        label: 'Soulslike',
        strength: 12.4,
        positiveSourceCount: 4,
        supportingGameCount: 9,
        uniqueMatchups: 12,
        evidenceLabel: 'Well-supported',
        exemplar: { masterId: 4242, title: 'ELDEN RING', reaction: 'loved' },
      },
    ],
    sources: [
      {
        masterId: 4242,
        title: 'ELDEN RING',
        reaction: 'loved',
        weight: 5.1,
        traits: ['soulslike'],
        laneKeys: ['soulslike'],
        comparisonCount: 9,
      },
      {
        masterId: 5150,
        title: 'Hollow Knight',
        reaction: 'liked',
        weight: 3.2,
        traits: ['soulslike', 'metroidvania'],
        laneKeys: ['soulslike'],
        comparisonCount: 2,
      },
    ],
  }
}

test('whyPickReasons derives rows from the engine singular reason string', () => {
  const rows = whyPickReasons(enginePick())
  assert.equal(rows.length, 1)
  assert.equal(rows[0].label, 'For your tastes')
  assert.equal(rows[0].detail, 'Because you loved ELDEN RING and liked Hollow Knight.')
  // The sheet maps over the result, so it must always be an array.
  assert.ok(Array.isArray(rows))
})

test('whyPickReasons passes through a richer reasons array unchanged', () => {
  const rich = [{ label: 'Duel record', detail: '2-1 vs soulslikes' }]
  assert.deepEqual(whyPickReasons(enginePick({ reasons: rich })), rich)
})

test('whyPickReasons returns an empty array when there is no reason', () => {
  assert.deepEqual(whyPickReasons({ game: { id: 1 } }), [])
  assert.deepEqual(whyPickReasons(null), [])
})

test('WhyContent no longer maps over pick.reasons directly', () => {
  assert.doesNotMatch(forYouTabSource, /pick\.reasons\.map/)
  assert.match(forYouTabSource, /whyPickReasons\(pick\)/)
})

test('resolveTuneLaunch resolves on production-shaped data', () => {
  const launch = resolveTuneLaunch(enginePick(), productionProfile())
  assert.ok(launch, 'expected a tune launch, got null')
  assert.equal(launch.laneKey, 'soulslike')
  assert.equal(launch.anchorId, 4242)
  assert.equal(launch.recommendationId, 7)
  assert.equal(launch.returnToForYou, true)
  assert.deepEqual(launch.laneMemberIds, [4242, 5150])
})

test('resolveTuneLaunch falls back to profile sources when the pick has no source', () => {
  const pick = enginePick({ evidence: { lane: 'soulslike', kind: 'lane' } })
  const launch = resolveTuneLaunch(pick, productionProfile())
  assert.ok(launch)
  assert.equal(launch.anchorId, 4242)
})

test('resolveTuneLaunch returns null without throwing when nothing is anchorable', () => {
  const pick = enginePick({ evidence: { lane: 'soulslike', kind: 'lane' } })
  const profile = {
    lanes: [{ key: 'soulslike', label: 'Soulslike', exemplar: null }],
    sources: [],
  }
  assert.equal(resolveTuneLaunch(pick, profile), null)
  assert.equal(resolveTuneLaunch(enginePick(), null), null)
})
