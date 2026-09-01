import Cover from './Cover.jsx'
import WishHeart from './WishHeart.jsx'
import { gameDescriptor, laneReason } from '../lib/discoverLanes.js'

const KIND_LABELS = {
  strong: 'Strong match',
  adjacent: 'Explore a little',
  wildcard: 'Wildcard',
  returning: 'Worth another look',
  surprise: 'Surprise pick',
}

function NotInterestedIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

export default function RecommendationDeckCard({
  game,
  wished,
  platforms,
  motion = '',
  surprise = false,
  busy = false,
  onOpen,
  onNext,
  onNotInterested,
}) {
  if (!game) return null
  const descriptor = gameDescriptor(game)
  const tags = descriptor ? descriptor.split(' · ').filter(Boolean).slice(0, 3) : []
  const releaseMeta = [game.year || null, platforms].filter(Boolean)
  const kind = surprise ? 'surprise' : (game.recommendationKind || 'strong')
  const reason = surprise
    ? 'An adventurous pick outside the main deck, still grounded in the parts of games you tend to enjoy.'
    : laneReason(game.lane)

  return (
    <div className={`fy-deck-card${motion ? ` ${motion}` : ''}`}>
      <button type="button" className="fy-deck-open" onClick={onOpen} disabled={busy}>
        <span className="fy-deck-art">
          <Cover src={game.cover} title={game.name} size="lg" className="fy-deck-cover" />
          <span className={`fy-deck-kind ${kind}`}>{KIND_LABELS[kind] || KIND_LABELS.strong}</span>
        </span>

        <span className="fy-deck-copy">
          <span className="fy-deck-name">{game.name}</span>
          {game.rating || releaseMeta.length ? (
            <span className="fy-deck-meta">
              {game.rating ? <span className="fy-rating">★ {game.rating}</span> : null}
              {game.rating && releaseMeta.length ? <span aria-hidden="true"> · </span> : null}
              {releaseMeta.map((item, index) => (
                <span key={item}>{index ? ' · ' : ''}{item}</span>
              ))}
            </span>
          ) : null}
          {tags.length ? (
            <span className="fy-deck-tags">
              {tags.map((tag) => <span key={tag}>{tag}</span>)}
            </span>
          ) : null}
          <span className="fy-deck-why">
            <span className="fy-deck-why-mark" aria-hidden="true">✦</span>
            <span>{reason}</span>
          </span>
        </span>
      </button>

      <WishHeart game={game} active={wished} />

      <div className="fy-deck-actions">
        <button
          type="button"
          className="fy-deck-action icon"
          aria-label={`Not interested in ${game.name}`}
          onClick={onNotInterested}
          disabled={busy}
        >
          <NotInterestedIcon />
        </button>
        <button type="button" className="fy-deck-action" onClick={onOpen} disabled={busy}>Details</button>
        <button type="button" className="fy-deck-action primary" onClick={onNext} disabled={busy}>
          {surprise ? 'Back to deck' : 'Next'}
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  )
}

