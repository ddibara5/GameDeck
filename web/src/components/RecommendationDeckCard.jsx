import Cover from './Cover.jsx'
import WishHeart from './WishHeart.jsx'
import { optImg, originalIgdbImage } from '../lib/format.js'

// The focused card of the For You deck, ported from the Expo pilot's
// ForYouDeck card: cover art with a kind badge, evidence reason, and
// details / dismiss / step-through actions.
export default function RecommendationDeckCard({
  recommendation,
  position = 0,
  count = 0,
  busy = false,
  wished = false,
  onOpen,
  onBack,
  onNext,
  onDismiss,
}) {
  const game = recommendation && recommendation.game
  if (!game) return null
  const cover = originalIgdbImage(game.cover)
  const backdrop = optImg(cover, 640)
  const kindClass = recommendation.kind === 'NEW PICK' ? 'new' : 'strong'
  const releaseMeta = [game.year || null, (game.platforms || []).filter(Boolean).slice(0, 3).join(' / ')].filter(Boolean)

  return (
    <div className="fy-deck-card">
      <button type="button" className="fy-deck-open" onClick={onOpen} disabled={busy}>
        <span className="fy-deck-art">
          {backdrop ? (
            <span
              className="fy-deck-art-backdrop"
              style={{ backgroundImage: `url(${JSON.stringify(backdrop)})` }}
              aria-hidden="true"
            />
          ) : null}
          <Cover src={cover} title={game.name} size="lg" className="fy-deck-cover" />
          <span className={`fy-deck-kind ${kindClass}`}>{recommendation.kind}</span>
        </span>

        <span className="fy-deck-copy">
          <span className="fy-deck-name">{game.name}</span>
          {game.rating != null || releaseMeta.length ? (
            <span className="fy-deck-meta">
              {game.rating != null ? <span className="fy-rating">★ {game.rating}/100</span> : null}
              {game.rating != null && releaseMeta.length ? <span aria-hidden="true"> · </span> : null}
              {releaseMeta.map((item, index) => (
                <span key={item}>{index ? ' · ' : ''}{item}</span>
              ))}
            </span>
          ) : null}
          {game.releaseLabel ? (
            <span className="fy-deck-meta">{game.releaseLabel}</span>
          ) : null}
          <span className="fy-deck-why">
            <span className="fy-deck-why-mark" aria-hidden="true">✦</span>
            <span>{recommendation.reason}</span>
          </span>
          {count > 1 ? (
            <span className="fy-deck-meta">Card {position + 1} of {count}</span>
          ) : null}
        </span>
      </button>

      <WishHeart game={game} active={wished} />

      <div className="fy-deck-actions">
        <button
          type="button"
          className="fy-deck-action"
          aria-label={`Dismiss ${game.name} from For You`}
          onClick={onDismiss}
          disabled={busy}
        >
          Not for me
        </button>
        <button
          type="button"
          className="fy-deck-action"
          aria-label="Previous recommendation"
          onClick={onBack}
          disabled={busy || position === 0}
        >Back</button>
        <button
          type="button"
          className="fy-deck-action primary"
          aria-label="Next recommendation"
          onClick={onNext}
          disabled={busy}
        >
          Next →
        </button>
      </div>
    </div>
  )
}
