import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const settings = readFileSync(new URL('../src/components/SettingsPage.jsx', import.meta.url), 'utf8')
const gameSheet = readFileSync(new URL('../src/components/GameSheet.jsx', import.meta.url), 'utf8')
const gameCss = readFileSync(new URL('../src/components/gameSheet.css', import.meta.url), 'utf8')
const discoverCss = readFileSync(new URL('../src/components/discover.css', import.meta.url), 'utf8')
const mountTransition = readFileSync(new URL('../src/lib/useMountTransition.js', import.meta.url), 'utf8')
const edgeBack = readFileSync(new URL('../src/lib/useEdgeBack.js', import.meta.url), 'utf8')
const indexCss = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

test('full-screen pages use the 290ms navigation clock while sheets stay faster', () => {
  assert.match(mountTransition, /exitMs = 240/)
  assert.match(edgeBack, /NAV_TRANSITION_MS = 290/)
  assert.match(indexCss, /--nav-in: 0\.29s/)
  assert.match(indexCss, /--nav-out: 0\.29s/)
  assert.match(discoverCss, /\.rail-page[\s\S]*animation: settings-in var\(--nav-in\)/)
  assert.match(discoverCss, /\.rail-page\.closing[\s\S]*animation: settings-out var\(--nav-out\)/)
  assert.match(gameCss, /\.game-page[\s\S]*animation: settings-in var\(--nav-in\)/)
  assert.match(gameCss, /\.game-page\.closing[\s\S]*animation: settings-out var\(--nav-out\)/)
})

test('navigation pages use the shared interactive edge-back stack', () => {
  assert.match(settings, /interactiveRef: dialogRef/)
  assert.doesNotMatch(settings, /window\.addEventListener\('touchstart'/)
  assert.match(app, /useEdgeBack\(closeView/)
  assert.match(app, /interactiveRef: viewPageRef/)
  assert.match(app, /interactiveRefs: subPageInteractiveRefs\.current/)
  assert.match(app, /deferBack: true/)
  assert.match(edgeBack, /shouldCompleteEdgeBack/)
  assert.match(edgeBack, /data\.edgeBackDragging/)
})

test('game detail push navigation reveals the source page and exits by class', () => {
  assert.match(gameSheet, /game-page-backdrop/)
  assert.match(gameSheet, /game-page\$\{closing \? ' closing' : ''\}/)
  assert.doesNotMatch(gameSheet, /transform: closing \? 'translateX\(100%\)'/)
  assert.match(gameCss, /\.modal-backdrop\.game-page-backdrop[\s\S]*background: transparent/)
})
