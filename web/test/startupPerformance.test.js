import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { optImgSrcSet } from '../src/lib/format.js'

test('responsive cover candidates respect the IGDB source-width cap', () => {
  const cover = 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1234.jpg'
  const srcSet = optImgSrcSet(cover, [96, 192, 320, 640])
  assert.match(srcSet, / 96w/)
  assert.match(srcSet, / 192w/)
  assert.match(srcSet, / 264w/)
  assert.doesNotMatch(srcSet, / 320w| 640w/)
})

test('Home uses the compact bootstrap and defers the full library', async () => {
  const [home, bootstrap] = await Promise.all([
    readFile(new URL('../src/components/HomeTab.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/appBootstrap.js', import.meta.url), 'utf8'),
  ])
  assert.match(home, /useAppBootstrap\(ACTIVITY_DAYS\)/)
  assert.doesNotMatch(home, /useLibraryGames\s*\(/)
  assert.match(home, /preloadLibrary/)
  assert.match(bootstrap, /get_app_bootstrap/)
})

test('startup overlays, game sheets, and artwork work are deferred', async () => {
  const [app, lazySheet, cover] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/LazyGameSheet.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Cover.jsx', import.meta.url), 'utf8'),
  ])
  assert.match(app, /settings: \(\) => import\('\.\/components\/SettingsPage\.jsx'\)/)
  assert.doesNotMatch(app, /import SettingsPage from/)
  assert.match(lazySheet, /import\('\.\/GameSheet\.jsx'\)/)
  assert.doesNotMatch(cover, /ResizeObserver|getBoundingClientRect|useLayoutEffect/)
  assert.match(cover, /srcSet=/)
  assert.match(cover, /fetchPriority=/)
})

test('startup RPCs preserve RLS and immutable assets avoid revalidation', async () => {
  const [migration, vercel, cache] = await Promise.all([
    readFile(new URL('../../supabase/migrations/20260901120000_app_startup_performance.sql', import.meta.url), 'utf8'),
    readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/idbCache.js', import.meta.url), 'utf8'),
  ])
  assert.match(migration, /security invoker/gi)
  assert.match(migration, /revoke all on function public\.get_app_bootstrap\(timestamptz\) from public, anon/)
  assert.match(migration, /grant execute on function public\.get_for_you_bootstrap\(\) to authenticated/)
  assert.match(migration, /news_created_at_desc_idx/)
  assert.match(vercel, /max-age=31536000, immutable/)
  assert.match(cache, /export function idbGetMany/)
  assert.match(cache, /export function idbSetMany/)
})
