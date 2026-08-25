import { fetchGameById, peekGameById } from './discover.js'
import { coverLook } from './tint.js'
import { resolveTheme } from './theme.js'

export const SHEET_ART_DEADLINE_MS = 240

export function gameSheetId(game, variant) {
  return Number(variant === 'discover' ? game && game.id : game && game.igdb_id) || null
}

export function backdropUrl(meta) {
  if (!meta || !meta.backdropId) return null
  const kind = meta.backdropKind === 'artwork' ? 'artwork' : 'screenshot'
  return `/api/tint?id=${encodeURIComponent(meta.backdropId)}&kind=${kind}`
}

export function peekGameSheetMedia(game, variant) {
  if (!game) return null
  if (variant === 'discover' && (game.summary || (game.screenshots && game.screenshots.length))) return game
  return peekGameById(gameSheetId(game, variant))
}

/**
 * Start the expensive sheet path before the click: metadata -> image fetch ->
 * decode -> canvas sample. Calls are intentionally fire-and-forget at the UI
 * edge; the caches deduplicate pointer-enter, focus and pointer-down.
 */
export async function warmGameSheet(game, variant) {
  if (!game) return null
  let media = peekGameSheetMedia(game, variant)
  if (!media) {
    const id = gameSheetId(game, variant)
    if (id) media = await fetchGameById(id)
  }
  const src = backdropUrl((media && media.backdropId ? media : null) || game)
  if (src) await coverLook(src, resolveTheme())
  return media
}
