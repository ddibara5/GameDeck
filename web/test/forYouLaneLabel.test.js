import assert from 'node:assert/strict'
import test from 'node:test'

import { forYouLaneLabel, formatLaneLabel } from '../src/lib/forYouEngine.js'

test('formatLaneLabel maps known lane keys to their canonical display labels', () => {
  assert.equal(formatLaneLabel('soulslike'), 'Soulslike')
  assert.equal(formatLaneLabel('openworld'), 'Open world')
  assert.equal(formatLaneLabel('story'), 'Story rich')
  assert.equal(formatLaneLabel('postapoc'), 'Post-apocalyptic')
  assert.equal(formatLaneLabel('jrpg'), 'JRPG')
  assert.equal(formatLaneLabel('arpg'), 'ARPG')
})

test('formatLaneLabel splits camelCase and dash/underscore separators with spaces', () => {
  assert.equal(formatLaneLabel('theStoryRichCatalog'), 'The Story Rich Catalog')
  assert.equal(formatLaneLabel('rich-catalog'), 'Rich Catalog')
  assert.equal(formatLaneLabel('rich_catalog'), 'Rich Catalog')
  assert.equal(formatLaneLabel('StoryRich'), 'Story Rich')
})

test('formatLaneLabel never concatenates: every multiword label keeps spaces', () => {
  for (const key of ['story', 'openworld', 'postapoc', 'theStory', 'richCatalog']) {
    const label = formatLaneLabel(key)
    assert.ok(label, `expected a label for ${key}`)
    assert.ok(!/[a-z][A-Z]/.test(label), `label for ${key} keeps word boundaries: ${label}`)
  }
})

test('formatLaneLabel returns null for empty or reserved keys', () => {
  assert.equal(formatLaneLabel(''), null)
  assert.equal(formatLaneLabel(null), null)
  assert.equal(formatLaneLabel('new'), null)
})

test('forYouLaneLabel prefers the engine evidence label, falls back to formatted keys', () => {
  assert.equal(
    forYouLaneLabel({ evidence: { laneEvidence: { label: 'Story rich' } } }),
    'Story rich',
  )
  assert.equal(forYouLaneLabel({ evidence: { lane: 'story' } }), 'Story rich')
  assert.equal(forYouLaneLabel({ laneKey: 'openworld' }), 'Open world')
  assert.equal(forYouLaneLabel({ evidence: { lane: 'new' } }), null)
  assert.equal(forYouLaneLabel({}), null)
})
