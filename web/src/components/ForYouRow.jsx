import Cover from './Cover.jsx'
import { releaseTiming, timingParts, shelfMetaDate } from '../lib/format.js'
import { recommendationTrigger } from '../lib/forYouEngine.js'
import TimingOverlay from './TimingOverlay.jsx'
import './forYou.css'

// Compact recommendation row, ported from the pilot's for-you-row.tsx:
// cover + title link, platform/release metadata, a tappable reason pill that
// opens the evidence sheet, and wishlist / options actions.
export default function ForYouRow({
  pick,
  laneLabel,
  tasteUpdate,
  disabled = false,
  saving = false,
  onDetails,
  onWhy,
  onOptions,
  onWishlist,
  exposureRef = null,
}) {
  const game = pick.game
  const title = game.title || game.name
  const cover = game.artwork || game.cover
  const released = game.released ?? game.release?.ts ?? null
  const timing = releaseTiming(released)
  const parts = timingParts(released)
  const releaseMeta = shelfMetaDate(game, timing) || game.releaseLabel || game.year || 'Release TBA'
  const metadata = [
    (game.platforms || []).slice(0, 2).join(' · '),
    game.rating ? `★ ${game.rating}` : null,
    timing ? null : releaseMeta,
  ]
    .filter(Boolean)
    .join(' · ')
  const triggerLabel = recommendationTrigger(pick, laneLabel)
  const evidenceLabel = pick.evidence?.laneEvidence?.evidenceLabel
  const accessibilityEvidence = evidenceLabel
    ? ` Evidence coverage: ${evidenceLabel}.`
    : ''

  return (
    <div className="fy-row" ref={exposureRef}>
      <button
        type="button"
        className="fy-row-cover-btn"
        aria-label={`View details for ${title}`}
        onClick={onDetails}
      >
        <span className="fy-row-cover-frame">
          <Cover src={cover} title={title} size="sm" className="fy-row-cover" />
          <TimingOverlay parts={parts} compact />
        </span>
      </button>
      <div className="fy-row-body">
        <button
          type="button"
          className="fy-row-title-btn"
          aria-label={`View details for ${title}`}
          onClick={onDetails}
        >
          <span className="fy-row-title">{title}</span>
        </button>
        <span className="fy-row-meta">{metadata}</span>
        {tasteUpdate ? (
          <span className="fy-row-taste-update" aria-live="polite">
            ✓ {tasteUpdate}
          </span>
        ) : null}
        <div className="fy-row-foot">
          <button
            type="button"
            className="fy-row-reason"
            aria-label={`Why ${title}? ${pick.reason}${accessibilityEvidence}`}
            title="Shows the evidence behind this recommendation"
            onClick={onWhy}
          >
            <span className="fy-row-reason-pill">
              {triggerLabel} <span aria-hidden="true">›</span>
            </span>
          </button>
          <span className="fy-row-actions">
            <button
              type="button"
              className="fy-row-icon-btn"
              aria-label={`Add ${title} to Wishlist`}
              aria-disabled={disabled}
              aria-busy={saving}
              disabled={disabled}
              onClick={onWishlist}
            >
              {saving ? (
                <span className="fy-action-spinner" aria-hidden="true" />
              ) : (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
              )}
            </button>
            <button
              type="button"
              className="fy-row-icon-btn muted"
              aria-label={`More options for ${title}`}
              aria-disabled={disabled}
              disabled={disabled}
              onClick={onOptions}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="19" cy="12" r="1.8" />
              </svg>
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
