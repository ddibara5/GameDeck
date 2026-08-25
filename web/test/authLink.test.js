import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSupabaseEmailLink } from '../src/lib/authLink.js'

test('parses the default Supabase magic-link format', () => {
  assert.deepEqual(
    parseSupabaseEmailLink('https://project.supabase.co/auth/v1/verify?token=abc123&type=magiclink&redirect_to=https%3A%2F%2Fexample.com'),
    { token_hash: 'abc123', type: 'magiclink' }
  )
})

test('parses a token_hash email link', () => {
  assert.deepEqual(
    parseSupabaseEmailLink('https://example.com/auth/confirm?token_hash=def456&type=email'),
    { token_hash: 'def456', type: 'email' }
  )
})

test('rejects insecure or unrelated links', () => {
  assert.throws(() => parseSupabaseEmailLink('http://example.com/?token=abc&type=magiclink'), /secure HTTPS/)
  assert.throws(() => parseSupabaseEmailLink('https://example.com/'), /valid GameDeck/)
})
