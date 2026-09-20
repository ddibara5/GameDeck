// Keep display estimates and the existing Progress sort on the same scale.
export function libraryProgress(game) {
  const len = Number(game.length_minutes) || 0
  if (len > 0) return Math.min(100, Math.max(0, ((game.playtime_minutes || 0) / len) * 100))
  return Math.min(100, Math.max(0, Number(game.percent) || 0))
}

export function libraryMetadata(game) {
  const progress = Number(game.length_minutes) > 0
    ? `~${Math.round(libraryProgress(game))}% story estimate`
    : Number(game.total_awards) > 0
      ? `${game.earned_awards ?? 0}/${game.total_awards} achievements`
      : null
  return [progress, game.playtime_label].filter(Boolean).join(' · ') || 'View details'
}
