import assert from 'node:assert/strict'
import test from 'node:test'

import { isN8nService } from '../api/_auth.js'

test('n8n service auth accepts only the configured private header', () => {
  const prior = process.env.N8N_REFRESH_TOKEN
  process.env.N8N_REFRESH_TOKEN = 'server-only-token'
  try {
    assert.equal(isN8nService({ headers: { 'x-refresh-token': 'server-only-token' } }), true)
    assert.equal(isN8nService({ headers: { 'x-refresh-token': 'server-only-tokeo' } }), false)
    assert.equal(isN8nService({ headers: {} }), false)
  } finally {
    if (prior == null) delete process.env.N8N_REFRESH_TOKEN
    else process.env.N8N_REFRESH_TOKEN = prior
  }
})
