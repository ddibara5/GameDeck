import { useEffect, useRef, useState } from 'react'
import HomeNowPlaying from './HomeNowPlaying.jsx'
import HomeRecentPlay from './HomeRecentPlay.jsx'
import HomeReleaseWatch from './HomeReleaseWatch.jsx'
import HomeForYouCard from './HomeForYouCard.jsx'
import GameSheet, { preloadGameSheet } from './LazyGameSheet.jsx'
import { preloadLibrary, useLibraryGames } from '../lib/useLibraryGames.js'
import { loadRecentActivity } from '../lib/recentActivity.js'
import { supabase } from '../lib/supabase.js'
import { currentPlay, summarizeWeekActivity } from '../lib/homeInsights.js'
import { fetchReleaseCandidates, releaseWatch } from '../lib/homeReleaseWatch.js'
import './homeCards.css'

// Home mirrors the Expo pilot's home screen: four fixed cards in order, each
// loading independently. Now Playing and Last 7 days read the library + the
// last 7 days of v_recent_activity; Release Watch reads the wishlist.
// Tabs unmount when inactive, so this mount effect reloads every time Home
// opens, including when coming back from Insights or the game sheets.

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

  const [nowPlayingGame, setNowPlayingGame] = useState(null)
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
  const play = currentPlay(games, insights)

  const libraryReady = !libraryLoading || games.length > 0
  const libraryBroken = Boolean(libraryError) && games.length === 0

  const nowPlayingSlot = libraryBroken ? (
    <ErrorCard
      title="Couldn't load your library."
      detail="Check your connection and try again."
      onRetry={() => preloadLibrary()}
    />
  ) : !libraryReady ? (
    <LoadingCard />
  ) : (
    <HomeNowPlaying
      play={play}
      onOpen={play?.game ? () => setNowPlayingGame(play.game) : undefined}
    />
  )

  const recentPlaySlot = activityFailed && !activityRows ? (
    <ErrorCard
      title="Couldn't load recent activity."
      detail="Check your connection and try again."
      onRetry={() => {
        setActivityFailed(false)
        loadRecentActivity(
          { days: ACTIVITY_DAYS, limit: ACTIVITY_LIMIT },
          (rows) => setActivityRows(rows),
          { throwOnError: true },
        ).then(
          (rows) => setActivityRows(rows),
          () => setActivityFailed(true),
        )
      }}
    />
  ) : insights ? (
    <HomeRecentPlay snapshot={insights} onOpen={() => onOpenTab('insights')} />
  ) : (
    <LoadingCard />
  )

  const selection = releaseWatch(releaseItems || [])
  const releaseSlot = releaseFailed && releaseItems === null ? (
    <ErrorCard
      title="Release watch unavailable."
      detail="Your wishlist could not be loaded."
      onRetry={loadRelease}
    />
  ) : releaseItems === null ? (
    <LoadingCard />
  ) : (
    <div className="hm-rw-wrap">
      <HomeReleaseWatch
        comingUp={selection.comingUp}
        outNow={selection.outNow}
        onOpenAll={() => onOpenList('wishlist')}
        onOpen={setWishlistGame}
      />
      {releaseFailed ? (
        <button type="button" className="hm-rw-retry" onClick={loadRelease} aria-label="Retry Release Watch refresh">
          <span>
            Couldn’t refresh releases. Showing the last loaded games. <b>Try again</b>
          </span>
        </button>
      ) : null}
    </div>
  )

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
          {nowPlayingSlot}
          {recentPlaySlot}
          {releaseSlot}
          <HomeForYouCard onOpen={() => onOpenTab('foryou')} />
        </>
      )}

      {nowPlayingGame ? (
        <GameSheet variant="library" game={nowPlayingGame} onClose={() => setNowPlayingGame(null)} />
      ) : null}
      {wishlistGame ? (
        <GameSheet variant="wishlist" game={wishlistGame} onClose={() => setWishlistGame(null)} />
      ) : null}
    </div>
  )
}

export { preloadGameSheet }
