import assert from 'node:assert/strict'
import test from 'node:test'

import { isTrustedPreview, passwordRecoveryRedirectUrl } from '../src/lib/authRedirect.js'

test('trusted GameDeck branch previews keep password recovery on the preview', () => {
  const href = 'https://gamedeck-git-codex-phase-1-global-search-dave-0d82.vercel.app/?_vercel_share=Safe_token-1234567890&tab=discover'
  assert.equal(isTrustedPreview(href), true)
  assert.equal(
    passwordRecoveryRedirectUrl(href),
    'https://gamedeck-git-codex-phase-1-global-search-dave-0d82.vercel.app/?_vercel_share=Safe_token-1234567890',
  )
})

test('production and untrusted hosts cannot become email redirect targets', () => {
  assert.equal(isTrustedPreview('https://gamedeck-kappa.vercel.app'), false)
  assert.equal(
    passwordRecoveryRedirectUrl('https://gamedeck-git-test-attacker.vercel.app/?_vercel_share=stolen_token_123456'),
    'https://gamedeck-kappa.vercel.app',
  )
  assert.equal(
    passwordRecoveryRedirectUrl('https://gamedeck-git-test-dave-0d82.vercel.app/?_vercel_share=bad!token'),
    'https://gamedeck-git-test-dave-0d82.vercel.app/',
  )
})
