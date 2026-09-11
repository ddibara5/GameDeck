import assert from 'node:assert/strict'
import test from 'node:test'

import { buildGameEvidenceContext } from '../api/_gameEvidence.js'
import { SYSTEM_PROMPT } from '../api/chat.js'

const NOW = Date.parse('2026-09-11T12:00:00Z')

const context = buildGameEvidenceContext({
  now: NOW,
  games: [
    { master_id: 1, title: 'Mortal Shell II', environment: 'xbox', keywords: ['horror'], playtime_minutes: 900, last_played: '2026-09-10' },
    { master_id: 2, title: 'Hell is Us', environment: 'xbox', keywords: ['horror'], playtime_minutes: 600, last_played: '2026-09-09' },
    { master_id: 3, title: 'Quiet Story', environment: 'psn', keywords: ['story rich'], playtime_minutes: 120, last_played: '2026-08-20' },
  ],
  ranks: [
    { master_id: 1, score: 1660, reaction: 'loved', comparison_count: 8 },
    { master_id: 2, score: 1580, reaction: 'liked', comparison_count: 7 },
    { master_id: 3, score: 1490, reaction: 'liked', comparison_count: 1 },
  ],
  statuses: [],
  activity: [
    { master_id: 1, title: 'Mortal Shell II', event_date: '2026-09-10', environment: 'xbox', minutes_delta: 90 },
  ],
  wishlist: [],
  gamepass: [],
  comparisons: [
    { id: 1, left_id: 1, right_id: 2, result: 'left', compared_at: '2026-09-10T12:00:00Z' },
    { id: 2, left_id: 3, right_id: 1, result: 'right', compared_at: '2026-09-09T12:00:00Z' },
  ],
  coverage: { games: true, ranks: true, activity: true, comparisons: true },
})

const evaluations = [
  {
    prompt: 'What kinds of games do I like?',
    evidence: [/Top taste lanes:/, /Horror/, /reaction loved/],
  },
  {
    prompt: 'Why did you recommend this?',
    evidence: [/example Mortal Shell II/, /ranked above 2 unique opponents/],
  },
  {
    prompt: 'What should I play next?',
    evidence: [/LIBRARY - authoritative ownership list/, /RECENT ACTIVITY - strongest behavioral taste signal/],
  },
  {
    prompt: 'Which opinion are you least sure about?',
    evidence: [/Story rich \| Early evidence/, /1 positively rated game/],
  },
]

test('stable Ask taste prompts receive the evidence and qualification rules they need', () => {
  assert.match(SYSTEM_PROMPT, /If evidence is early or partial, say so plainly/)
  assert.equal(evaluations.length, 4)
  for (const evaluation of evaluations) {
    assert.ok(evaluation.prompt.endsWith('?'))
    for (const pattern of evaluation.evidence) assert.match(context, pattern)
  }
})
