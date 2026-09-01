import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  DEFAULT_DISCOVER_FILTER_DEFAULTS,
  normalizeDiscoverFilterDefaults,
} from '../src/lib/discoverFilterDefaults.js'

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
  assert.doesNotMatch(source, /Filtering every row|results-head|resetAll/)
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

test('Discover filter defaults preserve shared scale and surface-specific choices', () => {
  const normalized = normalizeDiscoverFilterDefaults({
    scales: ['aaa', 'unknown', 'aaa'],
    browse: {
      preset: 'short-and-sweet',
      genre: 'role-playing-rpg',
      year: 2026,
      status: 'upcoming',
      sort: 'anticipated',
    },
    forYou: { only: 'deep-rpgs' },
  })

  assert.deepEqual(normalized, {
    scales: ['aaa'],
    browse: {
      preset: 'short-and-sweet',
      genre: 'role-playing-rpg',
      year: 2026,
      status: 'upcoming',
      sort: 'anticipated',
    },
    forYou: { only: 'deep-rpgs' },
  })
  assert.deepEqual(normalizeDiscoverFilterDefaults(null), DEFAULT_DISCOVER_FILTER_DEFAULTS)
})

test('Browse and For You expose explicit saved-default controls', async () => {
  const [browse, forYou, control, prefs, styles] = await Promise.all([
    readFile(new URL('../src/components/DiscoverBrowse.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/DiscoverForYou.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/DiscoverDefaultControl.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/DiscoverPreferenceFields.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/discover.css', import.meta.url), 'utf8'),
  ])

  for (const source of [browse, forYou]) {
    assert.match(source, /useDiscoverFilterDefaults/)
    assert.match(source, /saveAsDefault/)
    assert.match(source, /DiscoverDefaultControl/)
    assert.match(source, /resetDiscoverFilterDefaults/)
    assert.match(source, /Discover default saved\./)
    assert.match(
      source,
      /className="filter-sheet-scroll"[\s\S]*?<DiscoverDefaultControl[\s\S]*?<div className="filter-sheet-actions"/,
    )
  }
  assert.match(control, /type="checkbox"/)
  assert.match(control, /Save as My Default/)
  assert.match(control, /Restore GameDeck Defaults/)
  assert.match(control, /aria-live="polite"/)
  assert.match(prefs, />Shared</)
  assert.match(styles, /@media \(max-width: 480px\)[\s\S]*?\.filter-default-meta\s*{[\s\S]*?position: static/)
})

test('Customize rows entry styling is available before its lazy editor loads', async () => {
  const [baseStyles, editorStyles, browse] = await Promise.all([
    readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/customizeRows.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/DiscoverBrowse.jsx', import.meta.url), 'utf8'),
  ])

  assert.match(baseStyles, /\.customize-btn\s*{[\s\S]*?width: calc\(100% - 32px\)/)
  assert.match(baseStyles, /\.customize-btn svg\s*{[\s\S]*?width: 18px/)
  assert.doesNotMatch(editorStyles, /\.customize-btn/)
  assert.match(browse, /className="customize-btn"[\s\S]*?<svg[^>]*aria-hidden="true"/)
})
