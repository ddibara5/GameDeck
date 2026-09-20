import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import HomeRail from './HomeRail.jsx'
import GameSheet, { preloadGameSheet } from './LazyGameSheet.jsx'
import { HomeCustomizeBar, HomeCustomizeSheet } from './HomeCustomizer.jsx'
import { TAB_ICONS } from './TabBar.jsx'
import Cover from './Cover.jsx'
import { preloadLibrary, useLibraryGames } from '../lib/useLibraryGames.js'
import { useStatusMap, effectiveStatus } from '../lib/userStatus.js'
import { supabase } from '../lib/supabase.js'
import { gameArtworkUrl } from '../lib/homeInsights.js'
import { fetchReleaseCandidates, releaseLabel, releasedAgoLabel, releaseWatch } from '../lib/homeReleaseWatch.js'
import { loadNews } from '../lib/news.js'
import { loadHomeLayout, saveHomeLayout } from '../lib/homeLayout.js'
import { selectContinueGame } from '../lib/homeContinue.js'
import { gameProgress, libraryTitleKey, wishlistProgress } from '../lib/homeRails.js'
import { libraryCover, minutesToHhm, platformMeta } from '../lib/format.js'
import './homeCards.css'
import './homeRails.css'

// Home: the approved compact layout. Five sections in the user's saved order
// (gamedeck_home_layout_v2), each hideable and reorderable through the
// Customize bar/sheet:
//
//   continue-playing  one compact hero for the most recently played
//                     in-progress game; hidden when there is none
//   jump-back-in      three entry tiles: For You, Rankings, Insights
//   top-story         featured news card, plus More news
//   upcoming          wishlist Release watch, coming up
//   new-releases      wishlist Release watch, out now
//
// For You, News, Rankings and Insights are reachable only from here and their
// own entry points; none of them sits on the bottom bar (see navConfig).

// Most recently played game that is still in progress: has playtime and is not
// finished or abandoned. Null when there is nothing to continue.

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

function SectionHead({ title, action }) {
  return (
    <div className="hm-sec-head">
      <h2 className="hm-sec-title">{title}</h2>
      {action}
    </div>
  )
}

// Compact continue-playing hero: small cover, tight padding, slim progress
// bar. Platform, total playtime, and story progress, with a View game button
// that opens the game sheet.
function ContinuePlaying({ game, onView }) {
  const { label: platformLabel } = platformMeta(game.environment)
  const playtime = minutesToHhm(game.playtime_minutes)
  const progress = gameProgress(game)
  return (
    <section className="hm-continue" aria-label={`Continue playing ${game.title}`}>
      <Cover src={libraryCover(game)} title={game.title} size="sm" className="hm-continue-cover" priority />
      <div className="hm-continue-copy">
        <div className="hm-eyebrow">Continue playing</div>
        <h2 className="hm-continue-title">{game.title}</h2>
        <div className="hm-muted">
          {platformLabel} · {playtime}
        </div>
        {progress != null ? (
          <>
            <div
              className="hm-continue-bar"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin="0"
              aria-valuemax="100"
              aria-label={`${progress} percent story progress`}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
            <div className="hm-continue-bottom">
              <span className="hm-muted">About {progress}% through the story</span>
              <button type="button" className="hm-continue-btn" onClick={() => onView(game)}>
                View game
              </button>
            </div>
          </>
        ) : (
          <div className="hm-continue-bottom">
            <span className="hm-muted">{playtime} so far</span>
            <button type="button" className="hm-continue-btn" onClick={() => onView(game)}>
              View game
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

const JUMP_TILES = [
  { key: 'foryou', title: 'For You', sub: 'Fresh picks from your taste', icon: 'foryou' },
  { key: 'rankings', title: 'Rankings', sub: 'Choose between two games', icon: 'rankings' },
  { key: 'insights', title: 'Insights', sub: 'Playtime and taste trends', icon: 'insights' },
]

function JumpBackIn({ onOpenTab }) {
  return (
    <section aria-label="Jump back in">
      <SectionHead title="Jump back in" />
      <div className="hm-jump-grid">
        {JUMP_TILES.map((tile) => (
          <button
            key={tile.key}
            type="button"
            className="hm-jump"
            onClick={() => onOpenTab(tile.key)}
            aria-label={`${tile.title}: ${tile.sub}`}
          >
            <span className="hm-jump-icon" aria-hidden="true">
              {TAB_ICONS[tile.icon]}
            </span>
            <span className="hm-jump-text">
              <b>{tile.title}</b>
              <small>{tile.sub}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

function TopStory({ item, unread, onOpenNews }) {
  return (
    <section aria-label="Top story">
      <SectionHead
        title="Top story"
        action={
          <button type="button" className="hm-text-btn" onClick={onOpenNews}>
            More news
            {unread ? <span className="hm-dot" aria-label="New stories" /> : null}
          </button>
        }
      />
      <button type="button" className="hm-news-card" onClick={onOpenNews} aria-label={`Top story: ${item.title}. Open News.`}>
        <span className="hm-news-copy">
          <span className="hm-news-label">{item.gameName || 'FROM YOUR FEED'}</span>
          <span className="hm-news-title">{item.title}</span>
          {item.summary ? <span className="hm-news-summary">{item.summary}</span> : null}
        </span>
        {item.image ? (
          <img className="hm-news-thumb" src={item.image} alt="" loading="lazy" />
        ) : null}
      </button>
    </section>
  )
}

export default function HomeTab({ onOpenTab, onOpenList, newsUnread }) {
  const { games, loading: libraryLoading, error: libraryError } = useLibraryGames()
  const statusMap = useStatusMap()

  // Release candidates, plain (a refresh failure is soft - the line under the
  // card says so; the card keeps whatever it has).
  const [releaseItems, setReleaseItems] = useState(null)
  const [releaseFailed, setReleaseFailed] = useState(false)

  // News: the featured top story.
  const [newsItems, setNewsItems] = useState(null)

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

  const [selectedGame, setSelectedGame] = useState(null)

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

  const loadTopStory = () => {
    const runId = runRef.current
    // loadNews never rejects: a failed refresh resolves to the cached digest
    // or [], so the section hides itself when there is nothing to feature.
    return loadNews().then((rows) => {
      if (runRef.current === runId) setNewsItems(rows || [])
    })
  }

  useEffect(() => {
    const runId = ++runRef.current

    setReleaseFailed(false)

    const releaseTask = loadRelease()
    const newsTask = loadTopStory()

    // Parallel: each section publishes its own snapshot, so nothing waits on
    // the slowest request. The allSettled keeps the promise chain observed.
    Promise.allSettled([releaseTask, newsTask])
    return () => {
      runRef.current += 1
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const libraryByIgdb = useMemo(
    () => new Map(games.flatMap((game) => (game.igdb_id != null ? [[game.igdb_id, game]] : []))),
    [games],
  )
  const libraryByTitle = useMemo(
    () => new Map(games.map((game) => [libraryTitleKey(game.title), game])),
    [games],
  )
  const releases = useMemo(() => releaseWatch(releaseItems || []), [releaseItems])

  const continueGame = useMemo(
    () => selectContinueGame(games, (game) => effectiveStatus(game, statusMap)),
    [games, statusMap],
  )
  const topStory = newsItems && newsItems.length ? newsItems[0] : null

  const libraryReady = !libraryLoading || games.length > 0
  const libraryBroken = Boolean(libraryError) && games.length === 0

  const toWishlistRailItem = (item, dateMode) => ({
    key: String(item.igdb_id ?? item.title),
    title: item.title,
    artwork: gameArtworkUrl(item.cover, null),
    progress: wishlistProgress(item, libraryByIgdb, libraryByTitle),
    meta: dateMode === 'age' ? releasedAgoLabel(item) : releaseLabel(item),
    source: item,
  })

  const renderSection = (section) => {
    if (section === 'continue-playing') {
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
      // Hidden when there is nothing in progress, rather than an empty card.
      if (!continueGame) return null
      return <ContinuePlaying game={continueGame} onView={(game) => setSelectedGame({ game, variant: 'owned' })} />
    }

    if (section === 'jump-back-in') {
      return <JumpBackIn onOpenTab={onOpenTab} />
    }

    if (section === 'top-story') {
      // A failed news refresh resolves to [] (loadNews never rejects), so an
      // empty digest hides the section instead of erroring the page.
      if (!topStory) return newsItems ? null : <LoadingCard />
      return <TopStory item={topStory} unread={newsUnread} onOpenNews={() => onOpenTab('news')} />
    }

    if (section === 'upcoming') {
      if (!releases.comingUp.length && !releaseFailed) return null
      return (
        <div className="hm-rw-wrap">
          {releases.comingUp.length ? (
            <HomeRail
              title="Upcoming"
              compact
              items={releases.comingUp.map((item) => toWishlistRailItem(item, 'release'))}
              onOpenAll={() => onOpenList('releases')}
              onOpen={(item) => setSelectedGame({ game: item, variant: 'wishlist' })}
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

    if (section === 'new-releases') {
      if (!releases.outNow.length) return null
      return (
        <HomeRail
          title="New releases"
          compact
          items={releases.outNow.map((item) => toWishlistRailItem(item, 'age'))}
          onOpenAll={() => onOpenList('released')}
          onOpen={(item) => setSelectedGame({ game: item, variant: 'wishlist' })}
        />
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

  const showSpinner = !libraryReady && releaseItems === null && newsItems === null

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

      {selectedGame ? (
        <GameSheet
          variant={selectedGame.variant}
          game={selectedGame.game}
          onClose={() => setSelectedGame(null)}
        />
      ) : null}
    </div>
  )
}

export { preloadGameSheet }
