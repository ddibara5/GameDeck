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

test('magic-link requests recover and route trusted GameDeck previews directly', async () => {
  const [gate, auth] = await Promise.all([
    readFile(new URL('../src/components/AuthGate.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/appAuth.js', import.meta.url), 'utf8'),
  ])

  assert.match(gate, /try \{[\s\S]*sendSignInEmail\(\)[\s\S]*catch \(caught\)[\s\S]*finally \{[\s\S]*setBusy\(false\)/)
  assert.match(gate, /It will return directly to this preview/)
  assert.match(gate, /Email limit reached\. No new link was sent\./)
  assert.match(gate, /setRateLimited\(limited\)/)
  assert.ok(gate.indexOf('auth-message') < gate.indexOf("step === 'request'"))
  assert.match(auth, /signInRedirectUrl/)
  assert.match(auth, /emailRedirectTo: signInRedirectUrl\(\)/)
})
