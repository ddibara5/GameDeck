import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import HomeRail from './HomeRail.jsx'
import GameSheet, { preloadGameSheet } from './LazyGameSheet.jsx'
import NewsSheet from './NewsSheet.jsx'
import { HomeCustomizeBar, HomeCustomizeSheet } from './HomeCustomizer.jsx'
import { TAB_ICONS } from './TabBar.jsx'
import { preloadLibrary, useLibraryGames } from '../lib/useLibraryGames.js'
import { useStatusMap } from '../lib/userStatus.js'
import { supabase } from '../lib/supabase.js'
import { gameArtworkUrl } from '../lib/homeInsights.js'
import { fetchReleaseCandidates, releaseLabel, releasedAgoLabel, releaseWatch } from '../lib/homeReleaseWatch.js'
import { loadNews, markRead, resolveGame, buildLibraryIndex } from '../lib/news.js'
import { fetchGameById } from '../lib/discover.js'
import { loadHomeLayout, saveHomeLayout } from '../lib/homeLayout.js'
import { gameProgress, libraryTitleKey, sortRecentGames, wishlistProgress } from '../lib/homeRails.js'
import { libraryCover, timingParts } from '../lib/format.js'
import './homeCards.css'
import './homeRails.css'

// Home: the approved compact layout. Five sections in the user's saved order
// (gamedeck_home_layout_v2), each hideable and reorderable through the
// Customize bar/sheet:
//
//   continue-playing  a "Recent play" rail of recently played games with their
//                     story progress; hidden when there is none
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

// The featured card opens the article itself in a NewsSheet; "More news"
// goes to the News tab.
function TopStory({ item, unread, onOpenNews, onOpenStory }) {
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
      <button type="button" className="hm-news-card" onClick={() => onOpenStory(item)} aria-label={`Top story: ${item.title}. Open article.`}>
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

  // The featured top story's article sheet. { item, rel }, same shape as
  // NewsTab's openStory, so the card opens the article itself.
  const [openStory, setOpenStory] = useState(null)

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

  // Recently played library games, most recent first. Feeds the Recent play
  // rail and its full list view.
  const recentGames = useMemo(() => sortRecentGames(games || []), [games])
  const topStory = newsItems && newsItems.length ? newsItems[0] : null

  // Relevance for the featured story's sheet: library index only (no wishlist
  // or Game Pass sets on Home), so the sheet can show "Because you're playing
  // X" and prefer library art when it applies.
  const newsSets = useMemo(() => ({ libIndex: buildLibraryIndex(games) }), [games])

  const openStoryFor = useCallback(
    (item) => {
      markRead(item.primaryUrl)
      setOpenStory({ item, rel: resolveGame(item, newsSets) })
    },
    [newsSets],
  )

  // A library game opens the owned sheet; anything else opens the discover
  // sheet with the IGDB payload (same split as NewsTab).
  const openGameFor = useCallback(async (item, rel) => {
    if (rel && rel.row) {
      setSelectedGame({ game: rel.row, variant: 'owned' })
      return
    }
    if (!item.gameIgdbId) return
    const g = await fetchGameById(item.gameIgdbId)
    if (g) setSelectedGame({ game: g, variant: 'discover' })
  }, [])

  const libraryReady = !libraryLoading || games.length > 0
  const libraryBroken = Boolean(libraryError) && games.length === 0

  const toWishlistRailItem = (item, dateMode) => {
    const timing = timingParts(item.released)
    return {
      key: String(item.igdb_id ?? item.title),
      title: item.title,
      artwork: gameArtworkUrl(item.cover, null),
      progress: wishlistProgress(item, libraryByIgdb, libraryByTitle),
      timing,
      meta: timing
        ? null
        : dateMode === 'age'
          ? releasedAgoLabel(item)
          : releaseLabel(item),
      source: item,
    }
  }

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
      // Hidden when there is no recent play, rather than an empty rail. A
      // single recent game shows as a single card.
      if (!recentGames.length) return null
      return (
        <HomeRail
          title="Recent play"
          compact
          items={recentGames.map((game) => ({
            key: String(game.master_id ?? game.igdb_id ?? game.title),
            title: game.title,
            artwork: libraryCover(game),
            progress: gameProgress(game),
            source: game,
          }))}
          onOpenAll={() => onOpenList('recent')}
          onOpen={(game) => setSelectedGame({ game, variant: 'owned' })}
        />
      )
    }

    if (section === 'jump-back-in') {
      return <JumpBackIn onOpenTab={onOpenTab} />
    }

    if (section === 'top-story') {
      // A failed news refresh resolves to [] (loadNews never rejects), so an
      // empty digest hides the section instead of erroring the page.
      if (!topStory) return newsItems ? null : <LoadingCard />
      return <TopStory item={topStory} unread={newsUnread} onOpenNews={() => onOpenTab('news')} onOpenStory={openStoryFor} />
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

      {openStory ? (
        <NewsSheet
          item={openStory.item}
          rel={openStory.rel}
          onClose={() => setOpenStory(null)}
          onOpenGame={openGameFor}
        />
      ) : null}
    </div>
  )
}

export { preloadGameSheet }
