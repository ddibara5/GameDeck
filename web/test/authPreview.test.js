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

test('auth uses a fixed owner: password, magic link, and trusted preview redirects', async () => {
  const [gate, auth] = await Promise.all([
    readFile(new URL('../src/components/AuthGate.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/appAuth.js', import.meta.url), 'utf8'),
  ])

  assert.match(gate, /type="email"[\s\S]*value=\{OWNER_EMAIL\}[\s\S]*readOnly/)
  assert.match(gate, /autoComplete=\{recovery \? 'new-password' : 'current-password'\}/)
  assert.match(gate, /Set or reset password/)
  assert.match(gate, /New accounts cannot be created/)
  assert.match(gate, /Email me a sign-in link/)
  assert.match(gate, /Resend link in /)
  assert.match(auth, /signInWithPassword\(\{[\s\S]*email: OWNER_EMAIL,[\s\S]*password/)
  assert.match(auth, /resetPasswordForEmail\(OWNER_EMAIL/)
  assert.match(auth, /redirectTo: passwordRecoveryRedirectUrl\(\)/)
  assert.match(auth, /updateUser\(\{ password \}\)/)
  assert.match(auth, /event === 'PASSWORD_RECOVERY'/)
  // Magic link is allowed but only ever to the fixed owner email, and its
  // redirect reuses the trusted-preview host check. Public sign-up stays out.
  assert.match(auth, /signInWithOtp\(\{[\s\S]*email: OWNER_EMAIL/)
  assert.match(auth, /emailRedirectTo: passwordRecoveryRedirectUrl\(\)/)
  assert.doesNotMatch(auth, /signUp\(/)
})
