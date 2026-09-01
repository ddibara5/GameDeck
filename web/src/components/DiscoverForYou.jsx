import { useEffect, useMemo, useState } from 'react'
import Cover from './Cover.jsx'
import WishHeart from './WishHeart.jsx'
import Skeleton from './Skeleton.jsx'
import { MessageState } from './AsyncState.jsx'
import DiscoverFilterButton from './DiscoverFilterButton.jsx'
import DiscoverPreferenceFields from './DiscoverPreferenceFields.jsx'
import DiscoverDetail from './DiscoverDetail.jsx'
import { fetchDiscoverLanes, loadLibraryTitles, normTitle } from '../lib/discover.js'
import { useWishlist } from '../lib/wishlist.js'
import {
  DEFAULT_DISCOVER_PREFS,
  useDiscoverPrefs,
  platformParam,
  setDiscoverPrefs,
} from '../lib/discoverPrefs.js'
import { useTasteProfile, NEW_LANE, laneReason, rankCandidates, interleave } from '../lib/discoverLanes.js'
import { recordRecommendationDetailOpen, trackRecommendationFeed } from '../lib/recommendationLearning.js'
import usePullRefresh from '../lib/usePullRefresh.js'
import { useDialogA11y } from '../lib/useDialogA11y.js'
import {
  PRODUCTION_SCALE_KEYS,
  productionScaleParam,
  toggleProductionScale,
} from '../lib/productionScale.js'
import DiscoverFilterDisclosure from './DiscoverFilterDisclosure.jsx'
import DiscoverProductionScaleField from './DiscoverProductionScaleField.jsx'

// Pull a wider candidate pool than the feed displays. The server still returns
// recent matching releases, then the client can balance freshness with
// confidence-weighted quality instead of treating release date as the complete
// recommendation score.
const CANDIDATES_PER_LANE = 16
const PICKS_PER_LANE = 8

export function freshnessLabel(updatedAt, now = Date.now()) {
  const elapsed = Math.max(0, now - Number(updatedAt || now))
  const minutes = Math.floor(elapsed / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  if (hours < 48) return 'yesterday'
  return `${Math.floor(hours / 24)}d ago`
}

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

export default function DiscoverForYou({ onAsk }) {
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
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState(false)
  const [deprioritizeIds, setDeprioritizeIds] = useState(() => new Set())
  const [feedBatch, setFeedBatch] = useState('initial')
  const filterDialogRef = useDialogA11y({ active: showFilters, onClose: () => setShowFilters(false) })

  const { ids: wishIds } = useWishlist()

  useEffect(() => {
    let alive = true
    loadLibraryTitles().then((set) => alive && setLibTitles(set))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    setDeprioritizeIds(new Set())
    setFeedBatch('initial')
    setRefreshError(false)
  }, [platform, scale])

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

  const rankedByLane = useMemo(() => {
    const out = {}
    for (const lane of lanes) {
      out[lane.key] = rankCandidates(byLane[lane.key] || [], Date.now(), {
        wishlistIds: wishIds,
        gameFeedback,
        deprioritizeIds,
      })
        .slice(0, PICKS_PER_LANE)
    }
    return out
  }, [byLane, lanes, wishIds, gameFeedback, deprioritizeIds])

  useEffect(() => {
    if (only && !lanes.some((lane) => lane.key === only)) setOnly(null)
  }, [lanes, only])

  const feed = useMemo(() => {
    const active = only ? lanes.filter((lane) => lane.key === only) : lanes
    return interleave(active, rankedByLane, { drop: (game) => prefs.hideOwned && isOwned(game.name) })
  }, [lanes, rankedByLane, only, isOwned, prefs.hideOwned])

  const activeFilterCount =
    (only ? 1 : 0) +
    (scales.length !== PRODUCTION_SCALE_KEYS.length ? 1 : 0) +
    (prefs.platforms.length ? 1 : 0) +
    (prefs.hideOwned ? 1 : 0)

  const feedSig = feed.map((game) => `${game.id}:${game.lane?.key || 'new'}`).join(',')
  useEffect(() => {
    trackRecommendationFeed(feed.map((game) => ({
      ...game,
      recommendationReason: laneReason(game.lane),
    })), { batchId: feedBatch })
    // The signature is the stable recommendation identity. Tracking a new
    // object instance with the same rows would only repeat the same batch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedSig, feedBatch])

  async function refreshPicks() {
    if (refreshing || loading) return 'Still loading picks'
    const keys = [...new Set([NEW_LANE.key, ...(tasteLanes || []).map((lane) => lane.key)])]
    const currentIds = new Set(
      Object.values(rankedByLane)
        .flat()
        .map((game) => game?.id)
        .filter(Boolean),
    )
    setRefreshing(true)
    setRefreshError(false)
    try {
      const result = await fetchDiscoverLanes(keys, CANDIDATES_PER_LANE, { platform, scale, force: true })
      setByLane((current) => ({ ...current, ...refreshedLaneMap(result, keys) }))
      setFailedKeys((result.failedKeys || []).filter((key) => keys.includes(key)))
      setDeprioritizeIds(currentIds)
      setNewState('ready')
      setTasteState('ready')
      setFeedBatch(`refresh-${Date.now().toString(36)}`)
      return 'Picks refreshed'
    } catch {
      // Keep the current feed intact. A manual refresh is never allowed to turn
      // a good last-known set into an error screen.
      setRefreshError(true)
      return 'Couldn\'t refresh picks'
    } finally {
      setRefreshing(false)
    }
  }

  const tastePending = tasteState === 'waiting' || tasteState === 'loading'
  const loading = feed.length === 0 && (newState === 'loading' || tastePending)
  const unavailable = feed.length === 0 && !tastePending && (newState === 'error' || tasteState === 'error')
  const pullRefresh = usePullRefresh({
    onRefresh: refreshPicks,
    disabled: loading || refreshing,
    workingLabel: 'Refreshing picks…',
    doneLabel: 'Picks refreshed',
    errorLabel: 'Couldn\'t refresh picks',
  })

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
      ref={pullRefresh.hostRef}
      className={`discover-foryou ${pullRefresh.handlers.className}`}
      aria-busy={loading || refreshing}
    >
      <div
        ref={pullRefresh.gutterRef}
        className={`fy-refresh-gutter ${pullRefresh.phase}`}
        role="status"
        aria-live="polite"
      >
        <span className="fy-refresh-flag">
          <span className="fy-refresh-spinner" aria-hidden="true" />
          <span ref={pullRefresh.labelRef} />
        </span>
      </div>

      <div className="discover-filter-toolbar">
        <DiscoverFilterButton
          activeCount={activeFilterCount}
          label="For You filters"
          onClick={openFilters}
        />
      </div>

      <div>
        {unavailable ? (
          <MessageState title="Couldn't refresh your picks" error>Try again in a moment, or use Browse for the wider catalog.</MessageState>
        ) : loading ? (
          <Skeleton count={5} />
        ) : feed.length === 0 ? (
          <MessageState title="Nothing new in your tastes">Everything these tastes found is already in your library. Browse has the wider catalog.</MessageState>
        ) : (
          <div className="fy-feed">
            {feed.map((game, index) => {
              const wished = wishIds.has(game.id)
              const platforms = preferredPlatforms(game.platforms, prefs.platforms)
              return (
                <div key={game.id} className="fy-row-wrap">
                  <button
                    type="button"
                    className="fy-row"
                    onClick={() => {
                      recordRecommendationDetailOpen(game, {
                        lane: game.lane,
                        position: index + 1,
                        reason: laneReason(game.lane),
                      })
                      setSelected(game)
                    }}
                  >
                    <Cover src={game.cover} title={game.name} size="sm" className="fy-cov" />
                    <span className="fy-body">
                      <span className="fy-name">{game.name}</span>
                      <span className="fy-meta">
                        {game.year ? <span>{game.year}</span> : null}
                        {game.rating ? <span className="fy-rating">{` · ${game.rating}`}</span> : null}
                        {platforms ? <span>{` · ${platforms}`}</span> : null}
                      </span>
                      <span className={`fy-why${wished ? ' wished' : ''}`}>
                        {wished ? 'On your wishlist · available now' : laneReason(game.lane)}
                      </span>
                    </span>
                  </button>
                  <WishHeart game={game} active={wished} />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {(failedKeys.length || newState === 'error' || tasteState === 'error') && feed.length ? (
        <p className="fy-partial-note">Some recommendation tastes couldn't refresh.</p>
      ) : null}

      {refreshError && feed.length ? (
        <p className="fy-partial-note">Couldn't refresh right now. Showing your previous picks.</p>
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
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  )
}
