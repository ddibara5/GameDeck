import assert from 'node:assert/strict'
import test from 'node:test'

import { SYSTEM_PROMPT } from '../api/chat.js'

test('Ask GameDeck prompt requires evidence-backed taste answers', () => {
  assert.match(SYSTEM_PROMPT, /PERSONAL TASTE first/)
  assert.match(SYSTEM_PROMPT, /Cite 1-3 concrete reactions, examples, duel records, or unique-opponent counts/)
  assert.match(SYSTEM_PROMPT, /Reactions and duel outcomes are separate facts/)
  assert.match(SYSTEM_PROMPT, /Never say a game was "loved in duels\."/)
  assert.match(SYSTEM_PROMPT, /candidate has a verified genre\/theme connection/)
  assert.match(SYSTEM_PROMPT, /partial totals qualified/)
})
