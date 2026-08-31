const PRODUCTION_ORIGIN = 'https://gamedeck-kappa.vercel.app'
// Vercel's stable Git branch aliases follow this shape. Limit direct preview
// redirects to GameDeck deployments owned by this account; arbitrary redirect
// hosts still fall back to production even if a caller spoofs the page URL.
const GAMEDECK_PREVIEW_HOST = /^gamedeck-git-[a-z0-9-]+-dave-0d82\.vercel\.app$/i
const SHARE_TOKEN = /^[A-Za-z0-9_-]{16,128}$/

export function isTrustedPreview(href = window.location.href) {
  try {
    const url = new URL(href)
    return url.protocol === 'https:' && GAMEDECK_PREVIEW_HOST.test(url.hostname)
  } catch {
    return false
  }
}

export function passwordRecoveryRedirectUrl(href = window.location.href) {
  if (!isTrustedPreview(href)) return PRODUCTION_ORIGIN
  const current = new URL(href)
  const redirect = new URL('/', current.origin)
  // Keep the short-lived Vercel share grant so the email can reopen a protected
  // preview even when Mail hands the link to a fresh browser context.
  const share = current.searchParams.get('_vercel_share')
  if (share && SHARE_TOKEN.test(share)) redirect.searchParams.set('_vercel_share', share)
  return redirect.toString()
}
