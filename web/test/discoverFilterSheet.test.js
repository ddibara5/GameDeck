import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Discover keeps quick filters visible and long lists behind summaries', async () => {
  const [source, scaleField] = await Promise.all([
    readFile(new URL('../src/components/DiscoverBrowse.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/DiscoverProductionScaleField.jsx', import.meta.url), 'utf8'),
  ])

  assert.match(source, /DiscoverProductionScaleField/)
  assert.match(scaleField, /Production scale/)
  assert.match(scaleField, /production-scale-options/)
  assert.match(source, /DiscoverFilterDisclosure/)
  assert.match(source, /label="Genre"/)
  assert.match(source, /label="Vibe"/)
  assert.match(source, /label="Release year"/)
  assert.match(source, /label="Sort by"/)
  assert.match(source, /applyDraftFilters/)
})

test('For You uses the same staged, compact production-scale filter pattern', async () => {
  const source = await readFile(new URL('../src/components/DiscoverForYou.jsx', import.meta.url), 'utf8')

  assert.match(source, /DiscoverProductionScaleField/)
  assert.match(source, /DiscoverFilterDisclosure/)
  assert.match(source, /label="Recommendation taste"/)
  assert.match(source, /className="modal-sheet filter-sheet discover-filter-sheet"/)
  assert.match(source, /deferred/)
  assert.match(source, /compact/)
  assert.match(source, /applyDraftFilters/)
})

test('For You carries production scale through the lane request and server filter', async () => {
  const [client, api] = await Promise.all([
    readFile(new URL('../src/lib/discover.js', import.meta.url), 'utf8'),
    readFile(new URL('../api/discover.js', import.meta.url), 'utf8'),
  ])

  assert.match(client, /qs\.set\('scale', scale\)/)
  assert.match(client, /\$\{scale \|\| 'all'\}/)
  assert.match(api, /const laneCandidateLimit = scaleFilterActive/)
  assert.match(api, /filterByProductionScale\(rows, q\.scale\)/)
})

test('Discover no longer presents Indie as both a genre and a scale', async () => {
  const source = await readFile(new URL('../src/components/DiscoverBrowse.jsx', import.meta.url), 'utf8')
  const genreBlock = source.slice(source.indexOf('const GENRES'), source.indexOf('const SORTS'))

  assert.doesNotMatch(genreBlock, /label: 'Indie'/)
})
