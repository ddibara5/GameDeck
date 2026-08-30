import { useEffect, useMemo, useState } from 'react'
import Cover from './Cover.jsx'
import WishHeart from './WishHeart.jsx'
import Skeleton from './Skeleton.jsx'
import DiscoverDetail from './DiscoverDetail.jsx'
import { fetchDiscoverLanes, loadLibraryTitles, normTitle } from '../lib/discover.js'
import { useWishlist } from '../lib/wishlist.js'
import { useDiscoverPrefs, platformParam, platformLabel } from '../lib/discoverPrefs.js'
import { useTasteProfile, NEW_LANE, laneReason, rankCandidates, interleave } from '../lib/discoverLanes.js'
import { recordRecommendationDetailOpen, trackRecommendationFeed } from '../lib/recommendationLearning.js'

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

export default function DiscoverForYou({ onAsk, onTune }) {
  const prefs = useDiscoverPrefs()
  const platform = platformParam(prefs.platforms)
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
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState(false)
  const [updatedAt, setUpdatedAt] = useState(Date.now)
  const [clock, setClock] = useState(Date.now)
  const [deprioritizeIds, setDeprioritizeIds] = useState(() => new Set())
  const [feedBatch, setFeedBatch] = useState('initial')

  const { ids: wishIds } = useWishlist()

  useEffect(() => {
    let alive = true
    loadLibraryTitles().then((set) => alive && setLibTitles(set))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    setDeprioritizeIds(new Set())
    setFeedBatch('initial')
    setUpdatedAt(Date.now())
    setRefreshError(false)
  }, [platform])

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
    fetchDiscoverLanes(keys, CANDIDATES_PER_LANE, { platform, onFresh: apply })
      .then((result) => {
        if (!alive) return
        apply(result)
        setNewState('ready')
      })
      .catch(() => alive && setNewState('error'))
    return () => {
      alive = false
    }
  }, [platform])

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
    fetchDiscoverLanes(keys, CANDIDATES_PER_LANE, { platform, onFresh: apply })
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
  }, [tasteLaneSig, platform])

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
    return interleave(active, rankedByLane, { drop: (game) => isOwned(game.name) })
  }, [lanes, rankedByLane, only, isOwned])

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
    if (refreshing || loading) return
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
      const result = await fetchDiscoverLanes(keys, CANDIDATES_PER_LANE, { platform, force: true })
      setByLane((current) => ({ ...current, ...refreshedLaneMap(result, keys) }))
      setFailedKeys((result.failedKeys || []).filter((key) => keys.includes(key)))
      setDeprioritizeIds(currentIds)
      setNewState('ready')
      setTasteState('ready')
      const completedAt = Date.now()
      setUpdatedAt(completedAt)
      setClock(completedAt)
      setFeedBatch(`refresh-${completedAt.toString(36)}`)
    } catch {
      // Keep the current feed intact. A manual refresh is never allowed to turn
      // a good last-known set into an error screen.
      setRefreshError(true)
    } finally {
      setRefreshing(false)
    }
  }

  const tastePending = tasteState === 'waiting' || tasteState === 'loading'
  const loading = feed.length === 0 && (newState === 'loading' || tastePending)
  const unavailable = feed.length === 0 && !tastePending && (newState === 'error' || tasteState === 'error')
  const evidence = tasteProfile?.evidence
  const profileNote = evidence?.recentGameCount && evidence?.rankedGameCount
    ? `Shaped by ${evidence.recentGameCount} recently played games + My Ranking`
    : evidence?.recentGameCount
      ? `Shaped by ${evidence.recentGameCount} recently played games`
      : evidence?.rankedGameCount
        ? 'Shaped by My Ranking while recent play grows'
        : 'New releases while your taste profile grows'
  const learningNote = evidence?.recommendationOutcomeCount
    ? ` · ${evidence.recommendationOutcomeCount} recommendation outcome${evidence.recommendationOutcomeCount === 1 ? '' : 's'}`
    : ''

  return (
    <div className="discover-foryou" aria-busy={loading || refreshing}>
      <div className="fy-scope-row">
        <span>Updated {freshnessLabel(updatedAt, clock)} · {platformLabel(prefs.platforms)} · Not in library</span>
        <div className="fy-scope-actions">
          <button type="button" className="fy-refresh" onClick={refreshPicks} disabled={refreshing || loading}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 6v5h-5" />
              <path d="M18.5 15a7 7 0 1 1-1.2-8.3L20 11" />
            </svg>
            {refreshing ? 'Refreshing…' : 'Refresh picks'}
          </button>
          <button type="button" className="fy-tune" onClick={onTune}>Tune</button>
        </div>
      </div>

      <div className="fy-profile-note">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2.5c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Z" />
        </svg>
        <span>{profileNote}{learningNote}</span>
      </div>

      {lanes.length ? (
        <div className="lane-chips" aria-label="Recommendation tastes">
          <button type="button" className={`lane-chip${only === null ? ' active' : ''}`} onClick={() => setOnly(null)} aria-pressed={only === null}>
            All picks
          </button>
          {lanes.map((lane) => (
            <button key={lane.key} type="button" className={`lane-chip${only === lane.key ? ' active' : ''}`} onClick={() => setOnly(only === lane.key ? null : lane.key)} aria-pressed={only === lane.key}>
              {lane.key === NEW_LANE.key ? 'New' : lane.label}
            </button>
          ))}
        </div>
      ) : null}

      <div>
        {unavailable ? (
          <div className="empty-state">
            <div className="empty-state-title">Couldn't refresh your picks</div>
            <div>Try again in a moment, or use Browse for the wider catalog.</div>
          </div>
        ) : loading ? (
          <Skeleton count={5} />
        ) : feed.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">Nothing new in your tastes</div>
            <div>Everything these lanes found is already in your library. Browse has the wider catalog.</div>
          </div>
        ) : (
          <div className="fy-feed">
            {feed.map((game, index) => {
              const wished = wishIds.has(game.id)
              const platforms = preferredPlatforms(game.platforms, prefs.platforms)
              return (
                <div className="fy-row-wrap" key={game.id}>
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
