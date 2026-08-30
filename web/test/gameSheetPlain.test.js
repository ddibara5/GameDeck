import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const gameSheet = readFileSync(new URL('src/components/GameSheet.jsx', root), 'utf8')
const css = readFileSync(new URL('src/components/gameSheet.css', root), 'utf8')
const worker = readFileSync(new URL('public/sw.js', root), 'utf8')

test('game sheets use the plain theme surface without artwork-derived rendering', () => {
  assert.match(gameSheet, /className="modal-sheet game-sheet"/)
  assert.match(css, /\.game-sheet \{ background: var\(--surface\); \}/)
  assert.doesNotMatch(gameSheet, /coverLook|peekCoverLook|gs-hero|--gs-tint|\/api\/tint/)
  assert.doesNotMatch(css, /\.gs-hero|--gs-tint/)
})

test('retired backdrop requests and intent warmers are absent from production', () => {
  assert.equal(existsSync(new URL('api/tint.js', root)), false)
  assert.equal(existsSync(new URL('src/lib/gameSheetWarmIntent.js', root)), false)
  assert.doesNotMatch(worker, /\/api\/tint|isTintImage/)
})

test('eligible owned sheets expose the direct ranking flow', () => {
  assert.match(gameSheet, /isRankingEligible/)
  assert.match(gameSheet, /Rank this game/)
  assert.match(gameSheet, /existingRank=\{rank\}/)
  assert.match(gameSheet, /Tier \$\{tier\}/)
})
