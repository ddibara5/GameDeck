import { useCallback, useEffect, useRef, useState } from 'react'
import RecommendationDeckCard from './RecommendationDeckCard.jsx'
import DiscoverDetail from './DiscoverDetail.jsx'
import DiscoverFilterButton from './DiscoverFilterButton.jsx'
import DiscoverPreferenceFields from './DiscoverPreferenceFields.jsx'
import DiscoverProductionScaleField from './DiscoverProductionScaleField.jsx'
import { MessageState } from './AsyncState.jsx'
import Skeleton from './Skeleton.jsx'
import { useDialogA11y } from '../lib/useDialogA11y.js'
import { useWishlist } from '../lib/wishlist.js'
import { toggleProductionScale } from '../lib/productionScale.js'
import { normTitle } from '../lib/discover.js'
import {
  defaultForYouFilters,
  dismissForYouGame,
  loadDailyDeckIndex,
  loadForYouDeck,
  loadForYouFilters,
  loadForYouOwnershipTitles,
  saveDailyDeckIndex,
  saveForYouFilters,
} from '../lib/forYou.js'
import './discover.css'

// For You tab, ported from the Expo pilot's ForYouDeck: one 12-card deck at a
// time, built from play-history taste lanes, with a per-day resume position
// and local dismissal / filter preferences.
export default function ForYouTab({ onAsk, onBrowse }) {
  const [filters, setFilters] = useState(() => loadForYouFilters())
  const [deck, setDeck] = useState([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [draft, setDraft] = useState(filters)
  const [ownedTitles, setOwnedTitles] = useState(new Set())
  const filterDialogRef = useDialogA11y({ active: showFilters, onClose: () => setShowFilters(false) })
  const inflight = useRef(0)
  const { ids: wishIds } = useWishlist()

  const load = useCallback(async () => {
    const ticket = ++inflight.current
    setLoading(true)
    setError(null)
    try {
      const [recommendations, savedIndex, ownership] = await Promise.all([
        loadForYouDeck(filters),
        loadDailyDeckIndex(12, filters),
        loadForYouOwnershipTitles(),
      ])
      if (ticket !== inflight.current) return
      setDeck(recommendations)
      setOwnedTitles(ownership)
      setIndex(savedIndex < recommendations.length ? savedIndex : 0)
    } catch {
      if (ticket !== inflight.current) return
      setError('Your personalized deck is unavailable right now. Try again.')
    } finally {
      if (ticket !== inflight.current) return
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (showFilters) setDraft(filters)
  }, [showFilters, filters])

  const recommendation = deck[index]
  const game = recommendation ? recommendation.game : null

  function goTo(next) {
    setIndex(next)
    saveDailyDeckIndex(next, filters)
  }

  function dismiss(id) {
    const target = Number.isSafeInteger(id) ? id : (game && game.id)
    if (!target || saving) return
    setSaving(true)
    dismissForYouGame(target)
    setSelected(null)
    setDeck((current) => {
      const next = current.filter((item) => item.game.id !== target)
      const nextIndex = Math.min(index, Math.max(0, next.length - 1))
      setIndex(nextIndex)
      saveDailyDeckIndex(nextIndex, filters)
      return next
    })
    setSaving(false)
  }

  function applyFilters() {
    saveForYouFilters(draft)
    setFilters(draft)
    setShowFilters(false)
  }

  const filterCount =
    (filters.scales.length === defaultForYouFilters.scales.length ? 0 : 1) +
    (filters.platforms.length ? 1 : 0) +
    (filters.hideOwned ? 1 : 0)

  return (
    <div className="discover-page discover-page-standalone for-you-page">
      <div className="discover-base discover-foryou" aria-busy={loading}>
        <div className="discover-section-toolbar fy-deck-head">
          <span>Today’s deck</span>
          <span className="discover-section-actions">
            {deck.length ? (
              <span className="fy-deck-position">
                <b>{Math.min(index + 1, deck.length)}</b> of {deck.length}
              </span>
            ) : null}
            <DiscoverFilterButton
              activeCount={filterCount}
              label="For You filters"
              onClick={() => setShowFilters(true)}
            />
          </span>
        </div>

        <div className="fy-deck-shell">
          {loading ? (
            <Skeleton count={3} />
          ) : error ? (
            <MessageState title="For You unavailable" error>
              {error}
              <button type="button" className="btn" onClick={load}>Try again</button>
            </MessageState>
          ) : !game ? (
            <MessageState title="No new matches today">
              Try broadening your filters or check Discover for more games.
              <span style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button type="button" className="btn" onClick={() => setShowFilters(true)}>Change filters</button>
                {onBrowse ? (
                  <button type="button" className="btn" onClick={onBrowse}>Browse catalog</button>
                ) : null}
              </span>
            </MessageState>
          ) : (
            <>
              <div className="fy-deck-progress" aria-hidden="true">
                <span style={{ width: `${((index + 1) / deck.length) * 100}%` }} />
              </div>
              <RecommendationDeckCard
                recommendation={recommendation}
                position={index}
                count={deck.length}
                busy={saving}
                wished={wishIds.has(game.id)}
                onOpen={() => setSelected(game)}
                onBack={index > 0 ? () => goTo(index - 1) : null}
                onNext={() => goTo((index + 1) % deck.length)}
                onDismiss={() => dismiss()}
              />
              <p className="fy-partial-note">Chosen from your play history, rankings, and active For You filters.</p>
            </>
          )}
        </div>

        {showFilters ? (
          <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && setShowFilters(false)}>
            <div ref={filterDialogRef} className="modal-sheet filter-sheet discover-filter-sheet" role="dialog" aria-modal="true" aria-label="For You filters">
              <div className="modal-handle" />
              <button type="button" className="modal-close" aria-label="Close filters" onClick={() => setShowFilters(false)}>&times;</button>
              <div className="filter-sheet-head">
                <div className="detail-title">For You filters</div>
              </div>
              <div className="filter-sheet-scroll">
                <DiscoverProductionScaleField
                  selectedScales={draft.scales}
                  onToggle={(key) => setDraft((current) => ({ ...current, scales: toggleProductionScale(current.scales, key) }))}
                />
                <DiscoverPreferenceFields
                  prefs={draft}
                  onChange={setDraft}
                  deferred
                  compact
                />
              </div>
              <div className="filter-sheet-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setDraft(defaultForYouFilters)
                  }}
                >
                  Reset
                </button>
                <button type="button" className="btn primary" onClick={applyFilters}>
                  Show recommendations
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {selected ? (
          <DiscoverDetail
            game={selected}
            inLibrary={ownedTitles.has(normTitle(selected.name))}
            onAsk={(askGame) => {
              setSelected(null)
              if (onAsk) onAsk(askGame)
            }}
            onNotInterested={(notInterestedGame) => dismiss(notInterestedGame && notInterestedGame.id)}
            onClose={() => setSelected(null)}
          />
        ) : null}
      </div>
    </div>
  )
}
