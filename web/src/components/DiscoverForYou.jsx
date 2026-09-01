import { useEffect, useMemo, useRef, useState } from 'react'
import Skeleton from './Skeleton.jsx'
import { MessageState } from './AsyncState.jsx'
import DiscoverFilterButton from './DiscoverFilterButton.jsx'
import DiscoverPreferenceFields from './DiscoverPreferenceFields.jsx'
import DiscoverDetail from './DiscoverDetail.jsx'
import RecommendationDeckCard from './RecommendationDeckCard.jsx'
import RecommendationDeckComplete from './RecommendationDeckComplete.jsx'
import { fetchDiscoverLanes, loadLibraryTitles, normTitle } from '../lib/discover.js'
import { useWishlist } from '../lib/wishlist.js'
import {
  DEFAULT_DISCOVER_PREFS,
  useDiscoverPrefs,
  platformParam,
  setDiscoverPrefs,
} from '../lib/discoverPrefs.js'
import {
  useTasteProfile,
  NEW_LANE,
  buildRecommendationSlate,
  buildRecommendationSurprises,
  interleave,
  laneReason,
} from '../lib/discoverLanes.js'
import { recordRecommendationDetailOpen, trackRecommendationFeed } from '../lib/recommendationLearning.js'
import {
  dismissRecommendation,
  restoreRecommendation,
  useRecommendationDismissals,
} from '../lib/recommendationDismissals.js'
import {
  dailyRecommendationBatch,
  loadRotationExclusions,
  rememberRotationExclusions,
} from '../lib/recommendationRotation.js'
import { useDialogA11y } from '../lib/useDialogA11y.js'
import {
  PRODUCTION_SCALE_KEYS,
  productionScaleParam,
  toggleProductionScale,
} from '../lib/productionScale.js'
import DiscoverFilterDisclosure from './DiscoverFilterDisclosure.jsx'
import DiscoverProductionScaleField from './DiscoverProductionScaleField.jsx'
import {
  CONTINUATION_DECK_SIZE,
  DAILY_DECK_SIZE,
  loadRecommendationDeck,
  recommendationDeckScope,
  restoreRecommendationDeck,
  saveRecommendationDeck,
} from '../lib/recommendationDeck.js'
import { optImg, originalIgdbImage } from '../lib/format.js'

// Pull a wider candidate pool than the feed displays. The server still returns
// recent matching releases, then the client can balance freshness with
// confidence-weighted quality instead of treating release date as the complete
// recommendation score.
const CANDIDATES_PER_LANE = 24
const CARD_EXIT_MS = 190
const CARD_ENTER_MS = 360

const PLATFORM_MATCHERS = {
  xbox: /xbox|xone|series/i,
  psn: /playstation|\bps[45]\b/i,
  switch: /switch/i,
  steam: /pc|windows|steam/i,
}

function preferredPlatforms(platforms, selected) {
  const available = (platforms || []).filter(Boolean)
  const picked = []
  for (const key of selected || []) {
    const matcher = PLATFORM_MATCHERS[key]
    const match = matcher && available.find((name) => !picked.includes(name) && matcher.test(name))
    if (match) picked.push(match)
  }
  for (const name of available) {
    if (picked.length >= 3) break
    if (!picked.includes(name)) picked.push(name)
  }
  return picked.slice(0, 3).join(', ')
}

function rawLaneMap(result, keys) {
  const out = {}
  for (const key of keys) out[key] = result?.lanes?.[key] || []
  return out
}

function refreshedLaneMap(result, keys) {
  const out = {}
  for (const key of keys) {
    if (Array.isArray(result?.lanes?.[key])) out[key] = result.lanes[key]
  }
  return out
}

export default function DiscoverForYou({ onAsk, onBrowse }) {
  const prefs = useDiscoverPrefs()
  const platform = platformParam(prefs.platforms)
  const [scales, setScales] = useState(() => [...PRODUCTION_SCALE_KEYS])
  const scale = productionScaleParam(scales)
  const tasteProfile = useTasteProfile()
  const tasteLanes = tasteProfile?.lanes || null
  const gameFeedback = tasteProfile?.gameFeedback
  const [byLane, setByLane] = useState({})
  const [newState, setNewState] = useState('loading')
  const [tasteState, setTasteState] = useState('waiting')
  const [failedKeys, setFailedKeys] = useState([])
  const [libTitles, setLibTitles] = useState(null)
  const [selected, setSelected] = useState(null)
  const [only, setOnly] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [draftOnly, setDraftOnly] = useState(null)
  const [draftScales, setDraftScales] = useState(() => [...PRODUCTION_SCALE_KEYS])
  const [draftPrefs, setDraftPrefs] = useState(null)
  const [openFilterSection, setOpenFilterSection] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [continuationError, setContinuationError] = useState(false)
  const [rotationExclusions, setRotationExclusions] = useState(() => loadRotationExclusions())
  const [deck, setDeck] = useState([])
  const [deckAt, setDeckAt] = useState(0)
  const [deckBatchNumber, setDeckBatchNumber] = useState(0)
  const [deckReady, setDeckReady] = useState(false)
  const [surpriseGame, setSurpriseGame] = useState(null)
  const [surpriseRound, setSurpriseRound] = useState(0)
  const [cardMotion, setCardMotion] = useState('')
  const motionTimerRef = useRef(null)
  const continuationRef = useRef(null)
  const [dismissedGame, setDismissedGame] = useState(null)
  const [dismissalError, setDismissalError] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const filterDialogRef = useDialogA11y({ active: showFilters, onClose: () => setShowFilters(false) })

  const { ids: wishIds, loading: wishlistLoading } = useWishlist()
  const { ids: dismissedIds, loading: dismissalsLoading } = useRecommendationDismissals()

  useEffect(() => {
    let alive = true
    loadLibraryTitles().then((set) => alive && setLibTitles(set))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => () => motionTimerRef.current && clearTimeout(motionTimerRef.current), [])

  useEffect(() => {
    if (!dismissedGame) return undefined
    const timeout = setTimeout(() => setDismissedGame(null), 6000)
    return () => clearTimeout(timeout)
  }, [dismissedGame])

  const isOwned = useMemo(() => {
    if (!libTitles) return () => false
    return (name) => libTitles.has(normTitle(name))
  }, [libTitles])

  // The general New lane starts immediately. On a cold profile it can render
  // while the taste profile is still resolving instead of sitting behind that
  // dependency waterfall.
  useEffect(() => {
    let alive = true
    const keys = [NEW_LANE.key]
    setByLane({})
    setFailedKeys([])
    setNewState('loading')
    const apply = (result) => {
      if (!alive) return
      setByLane((current) => ({ ...current, ...rawLaneMap(result, keys) }))
      setFailedKeys((current) => [...new Set([...current.filter((key) => !keys.includes(key)), ...(result.failedKeys || [])])])
    }
    fetchDiscoverLanes(keys, CANDIDATES_PER_LANE, { platform, scale, onFresh: apply })
      .then((result) => {
        if (!alive) return
        apply(result)
        setNewState('ready')
      })
      .catch(() => alive && setNewState('error'))
    return () => {
      alive = false
    }
  }, [platform, scale])

  // Taste lanes begin as soon as the lightweight Supabase profile resolves.
  // They merge into New rather than replacing it, so whichever source wins the
  // race contributes useful rows immediately.
  const tasteLaneSig = tasteLanes ? tasteLanes.map((lane) => lane.key).join(',') : ''
  useEffect(() => {
    if (!tasteLanes) {
      setTasteState('waiting')
      return undefined
    }
    const keys = tasteLanes.map((lane) => lane.key)
    if (!keys.length) {
      setTasteState('ready')
      return undefined
    }
    let alive = true
    setTasteState('loading')
    const apply = (result) => {
      if (!alive) return
      setByLane((current) => ({ ...current, ...rawLaneMap(result, keys) }))
      setFailedKeys((current) => [...new Set([...current.filter((key) => !keys.includes(key)), ...(result.failedKeys || [])])])
    }
    fetchDiscoverLanes(keys, CANDIDATES_PER_LANE, { platform, scale, onFresh: apply })
      .then((result) => {
        if (!alive) return
        apply(result)
        setTasteState('ready')
      })
      .catch(() => alive && setTasteState('error'))
    return () => {
      alive = false
    }
    // tasteLaneSig is the stable identity; using the array would refetch on any
    // hook render that produced equivalent lane objects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasteLaneSig, platform, scale])

  // Taste lanes lead so a duplicate gets its specific personalized explanation
  // before the general New lane can claim it.
  const lanes = useMemo(() => (tasteLanes ? [...tasteLanes, NEW_LANE] : [NEW_LANE]), [tasteLanes])

  useEffect(() => {
    if (only && !lanes.some((lane) => lane.key === only)) setOnly(null)
  }, [lanes, only])

  const activeLanes = useMemo(
    () => (only ? lanes.filter((lane) => lane.key === only) : lanes),
    [lanes, only],
  )

  const initialSlate = useMemo(() => {
    if (!tasteProfile || wishlistLoading || dismissalsLoading) return []
    return buildRecommendationSlate(activeLanes, byLane, Date.now(), {
      wishlistIds: wishIds,
      dismissedIds,
      excludedIds: rotationExclusions,
      gameFeedback,
      drop: (game) => prefs.hideOwned && isOwned(game.name),
    })
  }, [tasteProfile, wishlistLoading, dismissalsLoading, activeLanes, byLane, wishIds, dismissedIds, rotationExclusions, gameFeedback, prefs.hideOwned, isOwned])

  const allCandidates = useMemo(
    () => interleave(activeLanes, byLane, {
      drop: (game) => (
        wishIds.has(game.id)
        || dismissedIds.has(game.id)
        || (prefs.hideOwned && isOwned(game.name))
      ),
    }),
    [activeLanes, byLane, wishIds, dismissedIds, prefs.hideOwned, isOwned],
  )

  const deckScope = recommendationDeckScope({
    platform,
    scale,
    lane: only || '',
    hideOwned: prefs.hideOwned,
  })
  const deckScopeRef = useRef(deckScope)
  deckScopeRef.current = deckScope

  useEffect(() => {
    if (motionTimerRef.current) clearTimeout(motionTimerRef.current)
    motionTimerRef.current = null
    setCardMotion('')
    setDeck([])
    setDeckAt(0)
    setDeckBatchNumber(0)
    setDeckReady(false)
    setSurpriseGame(null)
    setSurpriseRound(0)
    setContinuationError(false)
    continuationRef.current = null
  }, [deckScope])

  useEffect(() => {
    if (deckReady || !initialSlate.length) return
    const saved = loadRecommendationDeck(deckScope)
    const restored = restoreRecommendationDeck(saved, allCandidates, initialSlate)
    if (restored) {
      setDeck(restored.games)
      setDeckAt(restored.at)
      setDeckBatchNumber(restored.batchNumber)
    } else {
      setDeck(initialSlate.slice(0, DAILY_DECK_SIZE))
      setDeckAt(0)
      setDeckBatchNumber(0)
    }
    setDeckReady(true)
  }, [allCandidates, deckReady, deckScope, initialSlate])

  useEffect(() => {
    if (!deckReady || !deck.length) return
    saveRecommendationDeck({ scope: deckScope, games: deck, at: deckAt, batchNumber: deckBatchNumber })
  }, [deck, deckAt, deckBatchNumber, deckReady, deckScope])

  const activeFilterCount =
    (only ? 1 : 0) +
    (scales.length !== PRODUCTION_SCALE_KEYS.length ? 1 : 0) +
    (prefs.platforms.length ? 1 : 0) +
    (prefs.hideOwned ? 1 : 0)

  const currentDeckGame = deckAt < deck.length ? deck[deckAt] : null
  const surpriseExclusions = useMemo(() => new Set([
    ...rotationExclusions,
    ...deck.map((game) => String(game.id)),
  ]), [rotationExclusions, deck])
  const surpriseCandidates = useMemo(() => buildRecommendationSurprises(activeLanes, byLane, Date.now(), {
    wishlistIds: wishIds,
    dismissedIds,
    excludedIds: surpriseExclusions,
    gameFeedback,
    drop: (game) => prefs.hideOwned && isOwned(game.name),
    baseline: deck,
    limit: 12,
  }), [activeLanes, byLane, wishIds, dismissedIds, surpriseExclusions, gameFeedback, prefs.hideOwned, isOwned, deck])
  const visibleGame = surpriseGame || currentDeckGame
  const feedBatch = dailyRecommendationBatch(Date.now(), deckBatchNumber)

  const visibleSig = visibleGame
    ? `${surpriseGame ? 'surprise' : 'deck'}:${visibleGame.id}:${deckAt}:${deckBatchNumber}:${surpriseRound}`
    : ''
  useEffect(() => {
    if (!visibleGame || !tasteProfile || wishlistLoading || dismissalsLoading) return
    trackRecommendationFeed([{
      ...visibleGame,
      recommendationReason: laneReason(visibleGame.lane),
    }], {
      batchId: surpriseGame ? `${feedBatch}-surprise-${surpriseRound}` : feedBatch,
      surface: surpriseGame ? 'for_you_surprise' : 'for_you',
      positionOffset: surpriseGame ? 0 : deckAt,
    })
    // The signature is the stable identity of the one card actually visible.
    // Hidden queue items are not impressions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSig, tasteProfile, wishlistLoading, dismissalsLoading])

  useEffect(() => {
    const nextGame = surpriseGame ? null : deck[deckAt + 1]
    if (!nextGame?.cover || typeof Image === 'undefined') return
    const image = new Image()
    image.src = optImg(originalIgdbImage(nextGame.cover), 640)
  }, [deck, deckAt, surpriseGame])

  const remaining = Math.max(0, deck.length - deckAt)
  useEffect(() => {
    if (!deckReady || remaining > 3 || remaining === 0 || loadingMore) return
    const key = `${deckScope}:${deckBatchNumber}`
    if (continuationRef.current?.key === key) return
    const keys = [...new Set([NEW_LANE.key, ...(tasteLanes || []).map((lane) => lane.key)])]
    const promise = fetchDiscoverLanes(keys, CANDIDATES_PER_LANE, { platform, scale, force: true })
    continuationRef.current = { key, promise }
    promise.catch(() => {
      if (continuationRef.current?.promise === promise) continuationRef.current = null
    })
  }, [deckReady, remaining, loadingMore, deckScope, deckBatchNumber, tasteLaneSig, tasteLanes, platform, scale])

  function animateCard(update, direction = 'next') {
    if (cardMotion) return
    setCardMotion(direction === 'dismiss' || direction === 'back' ? 'leaving-right' : 'leaving-left')
    motionTimerRef.current = setTimeout(() => {
      update()
      setCardMotion('entering')
      motionTimerRef.current = setTimeout(() => {
        setCardMotion('')
        motionTimerRef.current = null
      }, CARD_ENTER_MS)
    }, CARD_EXIT_MS)
  }

  function enterCard(update) {
    update()
    setCardMotion('entering')
    motionTimerRef.current = setTimeout(() => {
      setCardMotion('')
      motionTimerRef.current = null
    }, CARD_ENTER_MS)
  }

  function advanceCard() {
    animateCard(() => {
      if (surpriseGame) setSurpriseGame(null)
      else setDeckAt((current) => Math.min(deck.length, current + 1))
    })
  }

  function previousCard() {
    if (cardMotion) return
    animateCard(() => {
      if (surpriseGame) setSurpriseGame(null)
      else setDeckAt((current) => Math.max(0, current - 1))
    }, 'back')
  }

  function showSurprise() {
    if (!surpriseCandidates.length || cardMotion) return
    const currentIndex = surpriseGame
      ? surpriseCandidates.findIndex((game) => String(game.id) === String(surpriseGame.id))
      : -1
    const reveal = () => {
      setSurpriseGame(surpriseCandidates[(currentIndex + 1) % surpriseCandidates.length])
      setSurpriseRound((current) => current + 1)
    }
    if (visibleGame) animateCard(reveal)
    else enterCard(reveal)
  }

  async function loadMorePicks() {
    if (loadingMore) return
    const requestedScope = deckScope
    setLoadingMore(true)
    setContinuationError(false)
    const keys = [...new Set([NEW_LANE.key, ...(tasteLanes || []).map((lane) => lane.key)])]
    const excludedIds = rememberRotationExclusions([
      ...rotationExclusions,
      ...deck.map((game) => game?.id).filter(Boolean),
    ])
    try {
      const prefetchKey = `${deckScope}:${deckBatchNumber}`
      const prefetched = continuationRef.current?.key === prefetchKey
        ? continuationRef.current.promise
        : fetchDiscoverLanes(keys, CANDIDATES_PER_LANE, { platform, scale, force: true })
      const result = await prefetched
      if (deckScopeRef.current !== requestedScope) return
      const nextByLane = { ...byLane, ...refreshedLaneMap(result, keys) }
      const nextDeck = buildRecommendationSlate(activeLanes, nextByLane, Date.now(), {
        wishlistIds: wishIds,
        dismissedIds,
        excludedIds,
        gameFeedback,
        drop: (game) => prefs.hideOwned && isOwned(game.name),
        slateSize: CONTINUATION_DECK_SIZE,
        strongCount: 4,
        adjacentCount: 1,
        wildcardCount: 1,
      })
      if (!nextDeck.length) throw new Error('No continuation picks')
      setByLane(nextByLane)
      setFailedKeys((result.failedKeys || []).filter((key) => keys.includes(key)))
      setRotationExclusions(excludedIds)
      enterCard(() => {
        setDeck(nextDeck)
        setDeckAt(0)
        setDeckBatchNumber((current) => current + 1)
        setDeckReady(true)
        setSurpriseGame(null)
      })
      setNewState('ready')
      setTasteState('ready')
      continuationRef.current = null
    } catch {
      setContinuationError(true)
    } finally {
      setLoadingMore(false)
    }
  }

  function openGame(game = visibleGame) {
    if (!game) return
    recordRecommendationDetailOpen(game, {
      lane: game.lane,
      position: surpriseGame ? 1 : deckAt + 1,
      reason: laneReason(game.lane),
      batchId: surpriseGame ? `${feedBatch}-surprise-${surpriseRound}` : feedBatch,
      surface: surpriseGame ? 'for_you_surprise' : 'for_you',
    })
    setSelected(game)
  }

  function hideGame(game = visibleGame) {
    if (!game || cardMotion || dismissing) return
    setDismissalError(false)
    setDismissing(true)
    dismissRecommendation(game).then((hidden) => {
      if (!hidden) {
        setDismissalError(true)
        return
      }
      setDismissedGame(game)
      animateCard(() => {
        if (surpriseGame) setSurpriseGame(null)
        else setDeckAt((current) => Math.min(deck.length, current + 1))
      }, 'dismiss')
    }).finally(() => setDismissing(false))
  }

  const tastePending = tasteState === 'waiting' || tasteState === 'loading'
  const learningPending = !tasteProfile || wishlistLoading || dismissalsLoading
  const loading = !deckReady && (newState === 'loading' || tastePending || learningPending)
  const unavailable = !deckReady && !tastePending && (newState === 'error' || tasteState === 'error')

  function openFilters() {
    setDraftOnly(only)
    setDraftScales([...scales])
    setDraftPrefs({ ...prefs, platforms: [...prefs.platforms] })
    setOpenFilterSection(null)
    setShowFilters(true)
  }

  function resetDraftFilters() {
    setDraftOnly(null)
    setDraftScales([...PRODUCTION_SCALE_KEYS])
    setDraftPrefs({ ...DEFAULT_DISCOVER_PREFS, platforms: [...DEFAULT_DISCOVER_PREFS.platforms] })
    setOpenFilterSection(null)
  }

  function applyDraftFilters() {
    setOnly(draftOnly)
    setScales(draftScales)
    setDiscoverPrefs(draftPrefs || prefs)
    setShowFilters(false)
  }

  function toggleDraftScale(key) {
    setDraftScales((current) => toggleProductionScale(current, key))
  }

  const tasteSummary = draftOnly
    ? (lanes.find((lane) => lane.key === draftOnly)?.label || 'New')
    : 'All picks'

  return (
    <div
      className="discover-foryou"
      aria-busy={loading || loadingMore}
    >
      <div className="discover-section-toolbar fy-deck-head">
        <span>{surpriseGame ? 'Surprise me' : (deckBatchNumber ? 'Extra picks' : 'Today’s deck')}</span>
        <span className="discover-section-actions">
          {deckReady && deck.length ? (
            <span className="fy-deck-position">
              {surpriseGame ? 'Outside your deck' : <><b>{Math.min(deckAt + 1, deck.length)}</b> of {deck.length}</>}
            </span>
          ) : null}
          <DiscoverFilterButton
            activeCount={activeFilterCount}
            label="For You filters"
            onClick={openFilters}
          />
        </span>
      </div>

      <div className="fy-deck-shell">
        {unavailable ? (
          <MessageState title="Couldn't refresh your picks" error>Try again in a moment, or use Browse for the wider catalog.</MessageState>
        ) : loading ? (
          <Skeleton count={3} />
        ) : !deck.length ? (
          <MessageState title="Your strongest picks are resting">Try another taste or Browse while recent recommendations rotate back in.</MessageState>
        ) : surpriseGame || currentDeckGame ? (
          <>
            <div className="fy-deck-progress" aria-hidden="true">
              <span style={{ width: surpriseGame ? '100%' : `${((deckAt + 1) / deck.length) * 100}%` }} />
            </div>

            <RecommendationDeckCard
              game={visibleGame}
              wished={wishIds.has(visibleGame.id)}
              platforms={preferredPlatforms(visibleGame.platforms, prefs.platforms)}
              motion={cardMotion}
              surprise={Boolean(surpriseGame)}
              busy={Boolean(cardMotion) || dismissing}
              onOpen={() => openGame(visibleGame)}
              onBack={surpriseGame || deckAt > 0 ? previousCard : null}
              onNext={surpriseGame ? showSurprise : advanceCard}
              onNotInterested={() => hideGame(visibleGame)}
            />

            {!surpriseGame ? (
              <button type="button" className="fy-surprise-action" onClick={showSurprise} disabled={!surpriseCandidates.length || Boolean(cardMotion)}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
                </svg>
                Surprise me
              </button>
            ) : null}
          </>
        ) : (
          <RecommendationDeckComplete
            batchSize={deck.length}
            loading={loadingMore}
            onContinue={loadMorePicks}
            onSurprise={showSurprise}
            onBrowse={onBrowse}
          />
        )}
      </div>

      {(failedKeys.length || newState === 'error' || tasteState === 'error') && deck.length ? (
        <p className="fy-partial-note">Some recommendation tastes couldn't refresh.</p>
      ) : null}

      {continuationError ? (
        <p className="fy-partial-note" role="alert">Couldn't find more picks right now. Your completed deck is still here.</p>
      ) : null}

      {dismissalError ? (
        <p className="fy-partial-note" role="alert">Couldn't hide that recommendation. Try again in a moment.</p>
      ) : null}

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
                selectedScales={draftScales}
                onToggle={toggleDraftScale}
              />

              <DiscoverPreferenceFields
                prefs={draftPrefs || prefs}
                onChange={setDraftPrefs}
                deferred
                compact
              />

              <div className="filter-disclosures for-you-filter-disclosures">
                <DiscoverFilterDisclosure
                  label="Recommendation taste"
                  value={tasteSummary}
                  open={openFilterSection === 'taste'}
                  onToggle={() => setOpenFilterSection((section) => (section === 'taste' ? null : 'taste'))}
                >
                  <div className="filter-options">
                    <button
                      type="button"
                      className={`filter-opt${draftOnly === null ? ' active' : ''}`}
                      aria-pressed={draftOnly === null}
                      onClick={() => {
                        setDraftOnly(null)
                        setOpenFilterSection(null)
                      }}
                    >
                      All picks
                    </button>
                    {lanes.map((lane) => (
                      <button
                        key={lane.key}
                        type="button"
                        className={`filter-opt${draftOnly === lane.key ? ' active' : ''}`}
                        aria-pressed={draftOnly === lane.key}
                        onClick={() => {
                          setDraftOnly(lane.key)
                          setOpenFilterSection(null)
                        }}
                      >
                        {lane.key === NEW_LANE.key ? 'New' : lane.label}
                      </button>
                    ))}
                  </div>
                </DiscoverFilterDisclosure>
              </div>
            </div>

            <div className="filter-sheet-actions">
              <button
                type="button"
                className="discover-action"
                onClick={resetDraftFilters}
              >
                Reset
              </button>
              <button type="button" className="discover-action primary" onClick={applyDraftFilters}>
                Show picks
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selected ? (
        <DiscoverDetail
          game={selected}
          inLibrary={isOwned(selected.name)}
          onAsk={(game) => {
            setSelected(null)
            if (onAsk) onAsk(game)
          }}
          onNotInterested={(game) => {
            setDismissalError(false)
            setSelected(null)
            dismissRecommendation(game).then((hidden) => {
              if (hidden) setDismissedGame(game)
              else setDismissalError(true)
            })
          }}
          onClose={() => setSelected(null)}
        />
      ) : null}

      {dismissedGame ? (
        <div className="fy-dismiss-toast" role="status">
          <span>{dismissedGame.name || dismissedGame.title} hidden from For You</span>
          <button
            type="button"
            onClick={() => {
              setDismissalError(false)
              restoreRecommendation(dismissedGame.id || dismissedGame.igdb_id)
                .then((restored) => {
                  if (!restored) setDismissalError(true)
                })
              setDismissedGame(null)
            }}
          >
            Undo
          </button>
        </div>
      ) : null}
    </div>
  )
}
