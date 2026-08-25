const EMAIL_LINK_TYPES = new Set([
  'email',
  'magiclink',
  'signup',
  'invite',
  'recovery',
  'email_change',
])

export function parseSupabaseEmailLink(value) {
  let url
  try {
    url = new URL(String(value).trim())
  } catch {
    throw new Error('Paste the complete sign-in link from the email.')
  }

  if (url.protocol !== 'https:') {
    throw new Error('The sign-in link must be a secure HTTPS link.')
  }

  const token_hash = url.searchParams.get('token_hash') || url.searchParams.get('token')
  const type = url.searchParams.get('type') || 'email'
  if (!token_hash || !EMAIL_LINK_TYPES.has(type)) {
    throw new Error('That is not a valid GameDeck sign-in link.')
  }

  return { token_hash, type }
}
