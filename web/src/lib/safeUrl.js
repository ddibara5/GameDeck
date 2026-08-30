/**
 * Return a normalized external web URL, or null when the value is not a safe
 * absolute HTTP(S) destination. Records rendered by the app can originate in
 * IGDB, news ingestion, or Supabase, so they are data even when the normal
 * producer is trusted.
 */
export function safeExternalUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}
