import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('preview auth has public configuration and a bounded request path', async () => {
  const source = await readFile(new URL('../src/lib/supabase.js', import.meta.url), 'utf8')

  assert.match(source, /PUBLIC_SUPABASE_URL/)
  assert.match(source, /sb_publishable_/)
  assert.match(source, /AUTH_REQUEST_TIMEOUT_MS = 15000/)
  assert.match(source, /fetch: authFetchWithTimeout/)
})

test('magic-link requests recover from failures and use the allow-listed origin', async () => {
  const [gate, auth] = await Promise.all([
    readFile(new URL('../src/components/AuthGate.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/appAuth.js', import.meta.url), 'utf8'),
  ])

  assert.match(gate, /try \{[\s\S]*sendSignInEmail\(\)[\s\S]*catch \(caught\)[\s\S]*finally \{[\s\S]*setBusy\(false\)/)
  assert.match(auth, /SIGN_IN_REDIRECT_URL = 'https:\/\/gamedeck-kappa\.vercel\.app'/)
  assert.match(auth, /emailRedirectTo: SIGN_IN_REDIRECT_URL/)
})
