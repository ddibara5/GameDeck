import assert from 'node:assert/strict'
import test from 'node:test'

import { buildGameEvidenceContext, loadGameEvidence } from '../api/_gameEvidence.js'

const NOW = Date.parse('2026-08-27T12:00:00Z')

test('Ask evidence distinguishes ownership, current behavior, intent, and availability', () => {
  const context = buildGameEvidenceContext({
    now: NOW,
    games: [
      { master_id: 1, title: 'Owned RPG', environment: 'xbox', percent: 30, playtime_minutes: 600, last_played: '2026-08-26', length_minutes: 2400 },
      { master_id: 2, title: 'Never Started', environment: 'psn', percent: 0, playtime_minutes: 0, last_played: null, length_minutes: 1000 },
    ],
    ranks: [{ master_id: 1, score: 1660, reaction: 'loved', comparison_count: 7 }],
    statuses: [{ master_id: 2, status: 'finished' }],
    activity: [{ master_id: 1, title: 'Owned RPG', event_date: '2026-08-26', minutes_delta: 120, achievements_delta: 2 }],
    wishlist: [{ igdb_id: 3, title: 'Saved Game', released: 1787788800, note: 'Co-op' }],
    gamepass: [{ igdb_id: 4, name: 'Pass Game', rating: 82, leaving_soon: true }],
  })

  assert.match(context, /Owned RPG \| Xbox \| PLAYING \(derived\)/)
  assert.match(context, /Never Started \| PlayStation \| FINISHED \(chosen\)/)
  assert.match(context, /Owned RPG \| 2h across 1 days \| last 2026-08-26 \| reaction loved/)
  assert.match(context, /Saved Game \| release 2026-08-27 \| note Co-op/)
  assert.match(context, /Pass Game \| LEAVING SOON/)
  assert.match(context, /WISHLIST - explicit interest, not ownership/)
  assert.match(context, /GAME PASS CURRENT SNAPSHOT - availability evidence, not ownership/)
})

test('optional evidence sources fail independently while ownership remains required', async () => {
  const originalFetch = global.fetch
  const originalUrl = process.env.SUPABASE_URL
  const originalKey = process.env.SUPABASE_ANON_KEY
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_ANON_KEY = 'public-test-key'
  global.fetch = async (url) => String(url).includes('/rest/v1/games?')
    ? new Response(JSON.stringify([{ master_id: 1, title: 'Owned', environment: 'xbox', playtime_minutes: 0 }]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
    : new Response('unavailable', { status: 503 })

  try {
    const context = await loadGameEvidence({ headers: { authorization: 'Bearer owner' } })
    assert.match(context, /Owned \| Xbox \| BACKLOG \(derived\)/)
    assert.match(context, /RECENT ACTIVITY[\s\S]*\(no activity in the last 90 days\)/)
    assert.match(context, /GAME PASS CURRENT SNAPSHOT[\s\S]*\(unavailable\)/)
  } finally {
    global.fetch = originalFetch
    if (originalUrl == null) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = originalUrl
    if (originalKey == null) delete process.env.SUPABASE_ANON_KEY
    else process.env.SUPABASE_ANON_KEY = originalKey
  }
})
