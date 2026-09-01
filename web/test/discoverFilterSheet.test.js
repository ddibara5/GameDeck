import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Discover keeps quick filters visible and long lists behind summaries', async () => {
  const source = await readFile(new URL('../src/components/DiscoverBrowse.jsx', import.meta.url), 'utf8')

  assert.match(source, /Production scale/)
  assert.match(source, /production-scale-options/)
  assert.match(source, /FilterDisclosure/)
  assert.match(source, /label="Genre"/)
  assert.match(source, /label="Vibe"/)
  assert.match(source, /label="Release year"/)
  assert.match(source, /label="Sort by"/)
  assert.match(source, /applyDraftFilters/)
})

test('Discover no longer presents Indie as both a genre and a scale', async () => {
  const source = await readFile(new URL('../src/components/DiscoverBrowse.jsx', import.meta.url), 'utf8')
  const genreBlock = source.slice(source.indexOf('const GENRES'), source.indexOf('const SORTS'))

  assert.doesNotMatch(genreBlock, /label: 'Indie'/)
})

