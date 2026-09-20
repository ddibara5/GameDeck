import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EDGE_BACK_PX,
  EDGE_BACK_DX,
  classifyEdgeSwipe,
  registerEdgeBack,
  unregisterEdgeBack,
  isEdgeBackTopmost,
  overlaysOpen,
} from '../src/lib/useEdgeBack.js'

test('edge swipe must start within the left edge zone', () => {
  assert.equal(classifyEdgeSwipe({ startX: 10, dx: 100, dy: 5 }), 'back')
  assert.equal(classifyEdgeSwipe({ startX: EDGE_BACK_PX, dx: 100, dy: 5 }), 'back')
  assert.equal(classifyEdgeSwipe({ startX: EDGE_BACK_PX + 1, dx: 100, dy: 5 }), 'none')
  assert.equal(classifyEdgeSwipe({ startX: 200, dx: 100, dy: 5 }), 'none')
})

test('edge swipe must travel right past the back threshold', () => {
  assert.equal(classifyEdgeSwipe({ startX: 8, dx: EDGE_BACK_DX + 1, dy: 0 }), 'back')
  assert.equal(classifyEdgeSwipe({ startX: 8, dx: EDGE_BACK_DX, dy: 0 }), 'claim')
  assert.equal(classifyEdgeSwipe({ startX: 8, dx: 10, dy: 0 }), 'claim')
  // Leftward or stationary movement is never a back gesture.
  assert.equal(classifyEdgeSwipe({ startX: 8, dx: 0, dy: 0 }), 'none')
  assert.equal(classifyEdgeSwipe({ startX: 8, dx: -40, dy: 0 }), 'none')
})

test('mostly-vertical movement is a scroll, not a back gesture', () => {
  assert.equal(classifyEdgeSwipe({ startX: 8, dx: 100, dy: 120 }), 'none')
  assert.equal(classifyEdgeSwipe({ startX: 8, dx: 100, dy: 100 }), 'none')
  assert.equal(classifyEdgeSwipe({ startX: 8, dx: 100, dy: 99 }), 'back')
})

test('registration stack: only the newest overlay owns the gesture', () => {
  const page = registerEdgeBack()
  assert.equal(overlaysOpen(), true)
  assert.equal(isEdgeBackTopmost(page), true)
  const sheet = registerEdgeBack()
  assert.equal(isEdgeBackTopmost(page), false)
  assert.equal(isEdgeBackTopmost(sheet), true)
  // Closing the top sheet hands the gesture back to the page underneath.
  unregisterEdgeBack(sheet)
  assert.equal(isEdgeBackTopmost(page), true)
  unregisterEdgeBack(page)
  assert.equal(overlaysOpen(), false)
  assert.equal(isEdgeBackTopmost(999), true)
})

test('unregistering an unknown id is a no-op', () => {
  const a = registerEdgeBack()
  unregisterEdgeBack(a + 1000)
  assert.equal(overlaysOpen(), true)
  assert.equal(isEdgeBackTopmost(a), true)
  unregisterEdgeBack(a)
  assert.equal(overlaysOpen(), false)
})

test('sub-page back entry yields to a sheet opened over it, then reclaims the gesture', () => {
  // Models App's fix: on a Home sub page (For You, Rankings, Insights, News)
  // App registers its back-to-Home intent in the edge-back stack (the
  // useEdgeBack register:true path). A sheet opened over the sub page
  // registers later, so topmost arbitration (not the global boolean) decides.
  const appEntry = registerEdgeBack()
  assert.equal(isEdgeBackTopmost(appEntry), true)

  // A game/rank/news sheet opens over the sub page: it owns the gesture now.
  const sheet = registerEdgeBack()
  assert.equal(isEdgeBackTopmost(appEntry), false)
  assert.equal(isEdgeBackTopmost(sheet), true)

  // Sheet closes: the gesture returns to the sub page's back entry.
  unregisterEdgeBack(sheet)
  assert.equal(isEdgeBackTopmost(appEntry), true)

  // Leaving the sub page unregisters App's entry; the stack is empty again.
  unregisterEdgeBack(appEntry)
  assert.equal(overlaysOpen(), false)
})
