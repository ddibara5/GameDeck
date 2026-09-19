import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import HomeRail from './HomeRail.jsx'
import HomeRecentPlay from './HomeRecentPlay.jsx'
import GameSheet, { preloadGameSheet } from './LazyGameSheet.jsx'
import { HomeCustomizeBar, HomeCustomizeSheet } from './HomeCustomizer.jsx'
import { preloadLibrary, useLibraryGames } from '../lib/useLibraryGames.js'
import { loadRecentActivity } from '../lib/recentActivity.js'
import { supabase } from '../lib/supabase.js'
import { gameArtworkUrl, summarizeWeekActivity } from '../lib/homeInsights.js'
import { fetchReleaseCandidates, releaseLabel, releasedAgoLabel, releaseWatch } from '../lib/homeReleaseWatch.js'
import { loadHomeLayout, saveHomeLayout } from '../lib/homeLayout.js'
import { gameProgress, libraryTitleKey, sortRecentGames, wishlistProgress } from '../lib/homeRails.js'
import './homeCards.css'
import './homeRails.css'

// Home mirrors the Expo pilot's Sept 11 home screen: four sections (Statistics,
// Recent play, New releases, Upcoming) rendered in the user's saved layout
// order, skippable and reorderable through the Customize bar/sheet. The two
// release rails read the wishlist; Recent play and Statistics read the library
// plus the last 7 days of v_recent_activity. Tabs unmount when inactive, so
// this mount effect reloads every time Home opens, including when coming back
// from Insights or the game sheets.

const ACTIVITY_DAYS = 7
const ACTIVITY_LIMIT = 400

function LoadingCard() {
  return <div className="hm-card skeleton hm-skel" role="status" aria-label="Loading" />
}

function ErrorCard({ title, detail, onRetry }) {
  return (
    <div className="hm-card hm-err" role="alert">
      <div className="hm-err-title">{title}</div>
      <div className="hm-err-detail">{detail}</div>
      <button type="button" className="hm-err-retry" onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}

export default function HomeTab({ onOpenTab, onOpenList }) {
  const { games, loading: libraryLoading, error: libraryError } = useLibraryGames()

  // Activity snapshot: local-first; onFresh publishes the network rows as soon
  // as they arrive so the cards upgrade without waiting for the full pass.
  const [activityRows, setActivityRows] = useState(null)
  const [activityFailed, setActivityFailed] = useState(false)

  // Release candidates, plain (a refresh failure is soft - the line under the
  // card says so; the card keeps whatever it has).
  const [releaseItems, setReleaseItems] = useState(null)
  const [releaseFailed, setReleaseFailed] = useState(false)

  // Home section layout: order + visibility, persisted for Dave.
  const [homeLayout, setHomeLayout] = useState(() => loadHomeLayout())
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const updateHomeLayout = useCallback((next) => {
    try {
      saveHomeLayout(next)
    } catch {
      // Keep the editor usable if local storage is unavailable.
    }
    setHomeLayout(next)
  }, [])

  const [playingGame, setPlayingGame] = useState(null)
  const [wishlistGame, setWishlistGame] = useState(null)

  const runRef = useRef(0)

  const loadRelease = () => {
    const runId = runRef.current
    setReleaseFailed(false)
    return fetchReleaseCandidates(supabase).then(
      (rows) => {
        if (runRef.current === runId) {
          setReleaseItems(rows)
          setReleaseFailed(false)
        }
      },
      () => {
        if (runRef.current === runId) setReleaseFailed(true)
      },
    )
  }

  useEffect(() => {
    const runId = ++runRef.current
    let alive = true
    const active = () => alive && runRef.current === runId

    setActivityFailed(false)
    setReleaseFailed(false)

    const activityTask = loadRecentActivity(
      { days: ACTIVITY_DAYS, limit: ACTIVITY_LIMIT },
      (rows) => {
        if (active()) setActivityRows(rows)
      },
      { throwOnError: true },
    ).then(
      (rows) => {
        if (active()) setActivityRows(rows)
      },
      () => {
        if (active()) setActivityFailed(true)
      },
    )

    const releaseTask = loadRelease()

    // Parallel: each card publishes its own snapshot, so nothing waits on the
    // slowest request. The allSettled keeps the promise chain observed.
    Promise.allSettled([activityTask, releaseTask])
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const insights = activityRows ? summarizeWeekActivity(activityRows) : null

  // Recent play rail: the last-14-days library games, most recently played
  // first. The wishlist rails look up each item's library match for the
  // progress badge, by igdb_id first and normalized title second.
  const playing = useMemo(() => sortRecentGames(games), [games])
  const libraryByIgdb = useMemo(
    () => new Map(games.flatMap((game) => (game.igdb_id != null ? [[game.igdb_id, game]] : []))),
    [games],
  )
  const libraryByTitle = useMemo(
    () => new Map(games.map((game) => [libraryTitleKey(game.title), game])),
    [games],
  )
  const releases = useMemo(() => releaseWatch(releaseItems || []), [releaseItems])

  const libraryReady = !libraryLoading || games.length > 0
  const libraryBroken = Boolean(libraryError) && games.length === 0

  const retryActivity = () => {
    setActivityFailed(false)
    loadRecentActivity(
      { days: ACTIVITY_DAYS, limit: ACTIVITY_LIMIT },
      (rows) => setActivityRows(rows),
      { throwOnError: true },
    ).then(
      (rows) => setActivityRows(rows),
      () => setActivityFailed(true),
    )
  }

  const toPlayingRailItem = (game) => ({
    key: String(game.master_id ?? game.title),
    title: game.title,
    artwork: gameArtworkUrl(game.cover_igdb, game.cover_standard),
    progress: gameProgress(game),
    meta: null,
    source: game,
  })

  const toWishlistRailItem = (item, dateMode) => ({
    key: String(item.igdb_id ?? item.title),
    title: item.title,
    artwork: gameArtworkUrl(item.cover, null),
    progress: wishlistProgress(item, libraryByIgdb, libraryByTitle),
    meta: dateMode === 'age' ? releasedAgoLabel(item) : releaseLabel(item),
    source: item,
  })

  const renderSection = (section) => {
    if (section === 'statistics') {
      if (activityFailed && !activityRows) {
        return (
          <ErrorCard
            title="Couldn't load recent activity."
            detail="Check your connection and try again."
            onRetry={retryActivity}
          />
        )
      }
      if (insights) return <HomeRecentPlay snapshot={insights} onOpen={() => onOpenTab('insights')} />
      return <LoadingCard />
    }

    if (section === 'recent-play') {
      if (libraryBroken) {
        return (
          <ErrorCard
            title="Couldn't load your library."
            detail="Check your connection and try again."
            onRetry={() => preloadLibrary()}
          />
        )
      }
      if (!libraryReady) return <LoadingCard />
      if (!playing.length) return null
      return (
        <HomeRail
          title="Recent play"
          items={playing.map(toPlayingRailItem)}
          onOpenAll={() => onOpenTab('activity')}
          onOpen={setPlayingGame}
        />
      )
    }

    if (section === 'new-releases') {
      if (!releases.outNow.length) return null
      return (
        <HomeRail
          title="New releases"
          items={releases.outNow.map((item) => toWishlistRailItem(item, 'age'))}
          onOpenAll={() => onOpenList('released')}
          onOpen={setWishlistGame}
        />
      )
    }

    if (section === 'upcoming') {
      if (!releases.comingUp.length && !releaseFailed) return null
      return (
        <div className="hm-rw-wrap">
          {releases.comingUp.length ? (
            <HomeRail
              title="Upcoming"
              items={releases.comingUp.map((item) => toWishlistRailItem(item, 'release'))}
              onOpenAll={() => onOpenList('releases')}
              onOpen={setWishlistGame}
            />
          ) : null}
          {releaseFailed ? (
            <button type="button" className="hm-rw-retry" onClick={loadRelease} aria-label="Retry Release Watch refresh">
              <span>
                Couldn’t refresh releases. Showing the last loaded games. <b>Try again</b>
              </span>
            </button>
          ) : null}
        </div>
      )
    }

    return null
  }

  const wishlistUnavailable =
    releaseItems === null ? (
      releaseFailed ? (
        <ErrorCard
          title="Release watch unavailable."
          detail="Your wishlist could not be loaded."
          onRetry={loadRelease}
        />
      ) : (
        <LoadingCard />
      )
    ) : null

  const showSpinner = !libraryReady && !activityRows && releaseItems === null && !activityFailed

  return (
    <div className="hm-page">
      {showSpinner ? (
        <div className="hm-spinner" role="status" aria-label="Loading">
          <div className="hm-spinner-dot" />
          <div className="hm-muted">Loading your games…</div>
        </div>
      ) : (
        <>
          {homeLayout.order
            .filter((section) => !homeLayout.hidden.includes(section))
            .map((section) => {
              const content = renderSection(section)
              return content ? <Fragment key={section}>{content}</Fragment> : null
            })}
          {wishlistUnavailable}
        </>
      )}

      <div className="hm-custbar-wrap">
        <HomeCustomizeBar onPress={() => setCustomizeOpen(true)} />
      </div>
      <HomeCustomizeSheet
        visible={customizeOpen}
        layout={homeLayout}
        onChange={updateHomeLayout}
        onClose={() => setCustomizeOpen(false)}
      />

      {playingGame ? (
        <GameSheet variant="library" game={playingGame} onClose={() => setPlayingGame(null)} />
      ) : null}
      {wishlistGame ? (
        <GameSheet variant="wishlist" game={wishlistGame} onClose={() => setWishlistGame(null)} />
      ) : null}
    </div>
  )
}

export { preloadGameSheet }
