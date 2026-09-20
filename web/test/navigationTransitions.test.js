import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const settings = readFileSync(new URL('../src/components/SettingsPage.jsx', import.meta.url), 'utf8')
const gameSheet = readFileSync(new URL('../src/components/GameSheet.jsx', import.meta.url), 'utf8')
const gameCss = readFileSync(new URL('../src/components/gameSheet.css', import.meta.url), 'utf8')
const discoverCss = readFileSync(new URL('../src/components/discover.css', import.meta.url), 'utf8')
const mountTransition = readFileSync(new URL('../src/lib/useMountTransition.js', import.meta.url), 'utf8')

test('full-screen overlays share the Settings push transition clock', () => {
  assert.match(mountTransition, /exitMs = 240/)
  assert.match(discoverCss, /\.rail-page[\s\S]*animation: settings-in var\(--overlay-in\)/)
  assert.match(discoverCss, /\.rail-page\.closing[\s\S]*animation: settings-out var\(--overlay-out\)/)
  assert.doesNotMatch(discoverCss, /@keyframes rail-in/)
  assert.doesNotMatch(discoverCss, /@keyframes rail-out/)
  assert.match(gameCss, /\.game-page[\s\S]*animation: settings-in var\(--overlay-in\)/)
  assert.match(gameCss, /\.game-page\.closing[\s\S]*animation: settings-out var\(--overlay-out\)/)
})

test('Settings and App view pages use the shared edge-back stack', () => {
  assert.match(settings, /useEdgeBack\(/)
  assert.doesNotMatch(settings, /window\.addEventListener\('touchstart'/)
  assert.match(app, /useEdgeBack\(closeView/)
  assert.doesNotMatch(app, /const EDGE_PX/)
  assert.doesNotMatch(app, /const OPEN_DX/)
})

test('game detail push navigation reveals the source page and exits by class', () => {
  assert.match(gameSheet, /game-page-backdrop/)
  assert.match(gameSheet, /game-page\$\{closing \? ' closing' : ''\}/)
  assert.doesNotMatch(gameSheet, /transform: closing \? 'translateX\(100%\)'/)
  assert.match(gameCss, /\.modal-backdrop\.game-page-backdrop[\s\S]*background: transparent/)
})
