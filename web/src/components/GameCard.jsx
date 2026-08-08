import Cover from './Cover.jsx'
import CompletionBar from './CompletionBar.jsx'
import { platformMeta, igdbCover } from '../lib/format.js'
import { effectiveStatus, STATUS_LABELS } from '../lib/userStatus.js'

export default function GameCard({ game, onSelect, statusMap }) {
  const { label, color } = platformMeta(game.environment)
  const status = effectiveStatus(game, statusMap)
  const showBadge = status === 'finished' || status === 'abandoned'
  // Completion = story progress (your playtime vs the game's length). Falls back to
  // achievements only for the handful of games with no known length (MMOs / no match).
  const len = Number(game.length_minutes) || 0
  const storyPct =
    len > 0 ? Math.max(0, Math.min(100, Math.round(((game.playtime_minutes || 0) / len) * 100))) : null

  return (
    <button type="button" className="game-card" onClick={() => onSelect(game)}>
      <Cover
        src={game.cover_igdb ? igdbCover(game.cover_igdb, 't_cover_big') : game.cover_small}
        title={game.title}
        size="sm"
      />
      <div className="game-card-body">
        <div className="game-title">{game.title}</div>
        <div className="platform-row">
          <span className="platform-dot" style={{ background: color }} />
          <span>{label}</span>
          {showBadge ? <span className={`status-badge status-${status}`}>{STATUS_LABELS[status]}</span> : null}
        </div>
        {storyPct != null ? <CompletionBar percent={storyPct} /> : null}
        <div className="game-meta-row">
          {storyPct != null ? (
            <span>{storyPct}% of story</span>
          ) : (
            <span>
              {game.earned_awards ?? 0}/{game.total_awards ?? 0} achievements
            </span>
          )}
          {game.playtime_label ? <span>· {game.playtime_label}</span> : null}
        </div>
      </div>
    </button>
  )
}
