import { peekGameById } from './discover.js'

export function gameSheetId(game, variant) {
  return Number(variant === 'discover' ? game && game.id : game && game.igdb_id) || null
}

export function peekGameSheetMedia(game, variant) {
  if (!game) return null
  if (variant === 'discover' && (game.summary || (game.screenshots && game.screenshots.length))) return game
  return peekGameById(gameSheetId(game, variant))
}
