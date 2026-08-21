import { useEffect, useMemo, useState } from 'react'
import Cover from './Cover.jsx'
import WishHeart from './WishHeart.jsx'
import Skeleton from './Skeleton.jsx'
import DiscoverDetail from './DiscoverDetail.jsx'
import { fetchDiscoverLanes, loadLibraryTitles, normTitle } from '../lib/discover.js'
import { useWishlist } from '../lib/wishlist.js'
import { useDiscoverPrefs, platformParam, platformLabel } from '../lib/discoverPrefs.js'
import { useTasteLanes, NEW_LANE, laneReason, interleave } from '../lib/discoverLanes.js'

// The For You feed.
//
// One column, one game per row, and every row carries the reason it is there.
// It replaces nothing: Browse is still a segment away and is unchanged, because
// "show me the storefront" is a real thing to want and this is not it.
//
// Why a feed rather than more rails. A horizontal rail hides its own ranking:
// card 1 and card 12 look identical and you can only see three at a time, so a
// rail whose front is wrong costs you the whole rail. Measured on the live
// "Recently released" on 21 Aug 2026, the two games worth having sat at
// positions 5 and 8 behind nine PC-only titles. Six rows of a vertical feed fit
// on one screen and none of them is hidden behind a swipe.
const PER_LANE = 8

export default function DiscoverForYou({ onAsk }) {
  const prefs = useDiscoverPrefs()
  const platform = platformParam(prefs.platforms)
  const tasteLanes = useTasteLanes()
  const [byLane, setByLane] = useState(null)
  const [error, setError] = useState(null)
  const [libTitles, setLibTitles] = useState(null)
  const [selected, setSelected] = useState(null)
  const [only, setOnly] = useState(null)

  const { ids: wishIds } = useWishlist()

  useEffect(() => {
    let alive = true
    loadLibraryTitles().then((set) => alive && setLibTitles(set))
    return () => {
      alive = false
    }
  }, [])

  const isOwned = useMemo(() => {
    if (!libTitles) return () => false
    return (name) => libTitles.has(normTitle(name))
  }, [libTitles])

  // The platform lane always runs; the taste lanes are whatever the probe found.
  const lanes = useMemo(() => (tasteLanes ? [NEW_LANE, ...tasteLanes] : null), [tasteLanes])
  const laneSig = lanes ? lanes.map((l) => l.key).join(',') : ''

  useEffect(() => {
    if (!laneSig) return undefined
    let alive = true
    setError(null)
    fetchDiscoverLanes(laneSig.split(','), PER_LANE, {
      platform,
      onFresh: (map) => alive && setByLane(map),
    })
      .then((map) => alive && setByLane(map))
      .catch((err) => alive && setError(err.message || 'Something went wrong'))
    return () => {
      alive = false
    }
  }, [laneSig, platform])

  // Owned games are dropped inside the interleave rather than after it, so a
  // lane whose first three are all in the library still contributes a row
  // instead of silently losing its turn in the round robin.
  const feed = useMemo(() => {
    if (!lanes || !byLane) return []
    const active = only ? lanes.filter((l) => l.key === only) : lanes
    return interleave(active, byLane, { drop: (g) => isOwned(g.name) })
  }, [lanes, byLane, only, isOwned])

  const loading = !lanes || !byLane

  return (
    <div className="discover-foryou">
      <div className="showing-strip">
        <span className="showing-label">Showing</span>
        {prefs.platforms.length ? <span className="showing-chip">{platformLabel(prefs.platforms)}</span> : null}
        <span className="showing-chip">Not in library</span>
      </div>

      {lanes && lanes.length ? (
        <div className="lane-chips">
          <button
            type="button"
            className={`lane-chip${only === null ? ' active' : ''}`}
            onClick={() => setOnly(null)}
            aria-pressed={only === null}
          >
            All lanes
          </button>
          {lanes.map((l) => (
            <button
              key={l.key}
              type="button"
              className={`lane-chip${only === l.key ? ' active' : ''}`}
              onClick={() => setOnly(only === l.key ? null : l.key)}
              aria-pressed={only === l.key}
            >
              {l.label}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="empty-state">
          <div className="empty-state-title">Couldn't build your feed</div>
          <div>{error}</div>
        </div>
      ) : loading ? (
        <Skeleton count={6} />
      ) : feed.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">Nothing new in your lanes</div>
          <div>Everything these lanes turned up is already in your library. Browse has the wider catalog.</div>
        </div>
      ) : (
        <div className="fy-feed">
          {feed.map((g) => {
            const wished = wishIds.has(g.id)
            const platforms = (g.platforms || []).slice(0, 3).join(', ')
            return (
              <div className="fy-row-wrap" key={g.id}>
                <button type="button" className="fy-row" onClick={() => setSelected(g)}>
                  <Cover src={g.cover} title={g.name} size="sm" className="fy-cov" />
                  <span className="fy-body">
                    <span className="fy-name">{g.name}</span>
                    <span className="fy-meta">
                      {g.year ? <span>{g.year}</span> : null}
                      {g.rating ? <span className="fy-rating">{` · ${g.rating}`}</span> : null}
                      {platforms ? <span>{` · ${platforms}`}</span> : null}
                    </span>
                    <span className={`fy-why${wished ? ' wished' : ''}`}>
                      {wished ? 'On your wishlist, and out' : laneReason(g.lane)}
                    </span>
                  </span>
                </button>
                <WishHeart game={g} active={wished} />
              </div>
            )
          })}
        </div>
      )}

      {selected ? (
        <DiscoverDetail
          game={selected}
          inLibrary={isOwned(selected.name)}
          onAsk={(g) => {
            setSelected(null)
            if (onAsk) onAsk(g)
          }}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  )
}
