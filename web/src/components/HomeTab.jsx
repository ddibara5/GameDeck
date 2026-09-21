import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import HomeRail from './HomeRail.jsx'
import { NowPlayingChevron } from './HomeNowPlaying.jsx'
import GameSheet, { preloadGameSheet } from './LazyGameSheet.jsx'
import { HomeCustomizeBar, HomeCustomizeSheet } from './HomeCustomizer.jsx'
import { TAB_ICONS } from './TabBar.jsx'
import { preloadLibrary, useLibraryGames } from '../lib/useLibraryGames.js'
import { gameArtworkUrl } from '../lib/homeInsights.js'
import { releaseWatch } from '../lib/homeReleaseWatch.js'
import { cardArtChain, getNewsCache, homeNewsPreview, loadNews, markRead, relTime, buildLibraryIndex } from '../lib/news.js'
import { loadHomeLayout, saveHomeLayout } from '../lib/homeLayout.js'
import { useWishlist } from '../lib/wishlist.js'
import { gameProgress, sortRecentGames } from '../lib/homeRails.js'
import { libraryCover, releaseCardLabel, remoteImg } from '../lib/format.js'
import './homeCards.css'
import './homeRails.css'

const loadNewsSheet = () => import('./NewsSheet.jsx')
const NewsSheet = lazy(loadNewsSheet)
const loadDiscover = () => import('../lib/discover.js')

// Home: the approved compact layout. Six sections in the user's saved order
// (gamedeck_home_layout_v2), each hideable and reorderable through the
// Customize bar/sheet:
//
//   continue-playing  a "Recent play" rail of recently played games with their
//                     story progress; hidden when there is none
//   jump-back-in      entry tiles for Rankings and Insights
//   for-you           a preview rail from the daily For You recommendation deck
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
  { key: 'rankings', title: 'Rankings', sub: 'Choose between two games', icon: 'rankings' },
  { key: 'insights', title: 'Insights', sub: 'Playtime and taste trends', icon: 'insights' },
]

function LoadingRail({ title }) {
  return (
    <section className="hrail" aria-label={`Loading ${title}`}>
      <div className="hrail-head" aria-hidden="true">
        <span className="hrail-title">{title}</span>
      </div>
      <div className="hrail-strip" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <span className="hrail-card" key={index}>
            <span className="hrail-poster skeleton hm-skel" />
          </span>
        ))}
      </div>
    </section>
  )
}

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

function HomeNewsArt({ item, className, targetW }) {
  const [step, setStep] = useState(0)
  useEffect(() => setStep(0), [item.id, item.primaryUrl, item.image, item.gameCover])
  const chain = cardArtChain(item)
  const art = chain[step] || null

  if (!art) return <span className={`${className} hm-news-art-empty`} aria-hidden="true" />

  return (
    <img
      key={art.src}
      className={`${className}${art.kind === 'cover' ? ' is-cover' : ''}`}
      src={remoteImg(art.src, targetW)}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setStep((value) => value + 1)}
    />
  )
}

// Home news: one featured story plus compact swipeable follow-ups, kept to
// roughly the same height as the old single-story card. Story taps open the
// article sheet; the header caret remains the route to the full News tab.
function HomeNews({ entries, unread, onOpenNews, onOpenStory }) {
  if (!entries || entries.length === 0) return null
  const visible = entries.slice(0, 5)
  const timeFor = (item) => relTime(item.publishedAt || item.createdAt)

  return (
    <section aria-label="Latest news">
      <SectionHead
        title="Latest news"
        action={
          <button type="button" className="hm-news-all" onClick={onOpenNews} aria-label="More news">
            {unread ? <span className="hm-dot" aria-label="New stories" /> : null}
            <NowPlayingChevron />
          </button>
        }
      />
      <div className="hm-news-strip" aria-label="Recent stories">
        {visible.map((entry) => (
          <button
            type="button"
            className="hm-news-card"
            key={entry.item.id || entry.item.primaryUrl}
            onPointerDown={loadNewsSheet}
            onFocus={loadNewsSheet}
            onClick={() => onOpenStory(entry)}
            aria-label={`${entry.item.title}. Open article.`}
          >
            <HomeNewsArt item={entry.item} className="hm-news-card-art" targetW={480} />
            <span className="hm-news-card-shade" aria-hidden="true" />
            <span className="hm-news-card-copy">
              <span className="hm-news-card-meta">
                <span>{entry.item.gameName || 'GameDeck'}</span>
                {timeFor(entry.item) ? <span>{timeFor(entry.item)}</span> : null}
              </span>
              <span className="hm-news-card-title">{entry.item.title}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

export default function HomeTab({ onOpenTab, onOpenList, newsUnread }) {
  const { games, loading: libraryLoading, error: libraryError } = useLibraryGames()
  // Wishlist is already a local-first SWR source. Reusing it here removes a
  // second uncached Supabase round trip from Home and keeps the preview/counts
  // in sync with the expanded Release watch page.
  const { items: wishlistItems, ids: wishlistIds, loading: wishlistLoading } = useWishlist()

  // Seed from the session copy when News has already been visited. Cold starts
  // still fall through to IndexedDB via loadNews().
  const [newsItems, setNewsItems] = useState(() => getNewsCache())

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
  const [forYouPreview, setForYouPreview] = useState(null)
  const [forYouLoading, setForYouLoading] = useState(false)

  // Keep the For You engine out of Home's initial JS chunk. The preview warms
  // after first paint, reuses the engine's IndexedDB candidate cache, and then
  // makes the full For You page faster when the header is tapped.
  const forYouVisible = !homeLayout.hidden.includes('for-you')
  useEffect(() => {
    if (!forYouVisible) return undefined

    let cancelled = false
    let idleId = null
    let timerId = null

    const loadPreview = async () => {
      setForYouLoading(true)
      try {
        const { loadForYouFilters, loadForYouSnapshot } = await import('../lib/forYou.js')
        const snapshot = await loadForYouSnapshot(loadForYouFilters())
        if (!cancelled) setForYouPreview(snapshot)
      } catch {
        // Keep Home usable if recommendations are temporarily unavailable.
        // The full For You page still owns its richer retry/error state.
      } finally {
        if (!cancelled) setForYouLoading(false)
      }
    }

    if ('requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(() => void loadPreview(), { timeout: 500 })
    } else {
      timerId = window.setTimeout(() => void loadPreview(), 0)
    }

    return () => {
      cancelled = true
      if (idleId != null && 'cancelIdleCallback' in window) window.cancelIdleCallback(idleId)
      if (timerId != null) window.clearTimeout(timerId)
    }
  }, [forYouVisible])

  // The featured top story's article sheet. { item, rel }, same shape as
  // NewsTab's openStory, so the card opens the article itself.
  const [openStory, setOpenStory] = useState(null)

  const runRef = useRef(0)

  useEffect(() => {
    const runId = ++runRef.current

    // News is local-first too. Do not hold the Home shell behind it; publish the
    // cached value as soon as loadNews resolves and refresh quietly afterward.
    loadNews().then((rows) => {
      if (runRef.current === runId) setNewsItems(rows || [])
    })

    return () => {
      runRef.current += 1
    }
  }, [])

  const releases = useMemo(() => releaseWatch(wishlistItems), [wishlistItems])

  // Recently played library games, most recent first. Feeds the Recent play
  // rail and its full list view.
  const recentGames = useMemo(() => sortRecentGames(games || []), [games])

  // Home is a compact preview of News → For you, not a separate "newest" feed.
  // Using the shared selector keeps the ordering identical: actively played,
  // owned/series/wishlist relevance first, then newest stories as backfill.
  const newsLibIndex = useMemo(() => buildLibraryIndex(games), [games])
  const homeNews = useMemo(
    () => homeNewsPreview(newsItems || [], { libIndex: newsLibIndex, wishlistIds }, 5),
    [newsItems, newsLibIndex, wishlistIds],
  )

  const openStoryFor = useCallback((entry) => {
    markRead(entry.item.primaryUrl)
    setOpenStory(entry)
  }, [])

  // A library game opens the owned sheet; anything else opens the discover
  // sheet with the IGDB payload (same split as NewsTab).
  const openGameFor = useCallback(async (item, rel) => {
    if (rel && rel.row) {
      setSelectedGame({ game: rel.row, variant: 'owned' })
      return
    }
    if (!item.gameIgdbId) return
    const { fetchGameById } = await loadDiscover()
    const g = await fetchGameById(item.gameIgdbId)
    if (g) setSelectedGame({ game: g, variant: 'discover' })
  }, [])

  const libraryReady = !libraryLoading || games.length > 0
  const libraryBroken = Boolean(libraryError) && games.length === 0

  const toWishlistRailItem = (item) => ({
    key: String(item.igdb_id ?? item.title),
    title: item.title,
    artwork: gameArtworkUrl(item.cover, null),
    meta: releaseCardLabel({
      released: item.released,
      precision: item.date_precision,
      label: item.release_label,
    }),
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
      // Hidden when there is no recent play, rather than an empty rail. A
      // single recent game shows as a single card.
      if (!recentGames.length) return null
      return (
        <HomeRail
          title="Recent play"
          compact
          priority
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

    if (section === 'for-you') {
      const picks = forYouPreview?.deck || []
      if (forYouLoading && !picks.length) return <LoadingRail title="For You" />
      if (!picks.length) return null
      return (
        <HomeRail
          title="For You"
          compact
          priority
          items={picks.slice(0, 6).map((pick) => {
            const game = pick.game || {}
            return {
              key: `foryou:${game.id ?? game.igdb_id ?? game.title ?? game.name}`,
              title: game.title || game.name || 'Game',
              artwork: game.artwork || game.cover || null,
              source: pick,
            }
          })}
          totalCount={picks.length}
          onOpenAll={() => onOpenTab('foryou')}
          onOpen={(pick) =>
            setSelectedGame({
              game: pick.game,
              variant: 'discover',
              recommendation: pick,
            })
          }
        />
      )
    }

    if (section === 'top-story') {
      // A failed news refresh resolves to [] (loadNews never rejects), so an
      // empty digest hides the section instead of erroring the page.
      if (!homeNews.length) return newsItems ? null : <LoadingCard />
      return <HomeNews entries={homeNews} unread={newsUnread} onOpenNews={() => onOpenTab('news')} onOpenStory={openStoryFor} />
    }

    if (section === 'upcoming') {
      if (wishlistLoading && !wishlistItems.length) return <LoadingCard />
      if (!releases.comingUp.length) return null
      return (
        <HomeRail
          title="Upcoming"
          compact
          items={releases.comingUp.map(toWishlistRailItem)}
          totalCount={releases.comingUpCount}
          onOpenAll={() => onOpenList('releases')}
          onOpen={(item) => setSelectedGame({ game: item, variant: 'wishlist' })}
        />
      )
    }

    if (section === 'new-releases') {
      if (wishlistLoading && !wishlistItems.length) return <LoadingCard />
      if (!releases.outNow.length) return null
      return (
        <HomeRail
          title="New releases"
          compact
          items={releases.outNow.map(toWishlistRailItem)}
          totalCount={releases.outNowCount}
          onOpenAll={() => onOpenList('released')}
          onOpen={(item) => setSelectedGame({ game: item, variant: 'wishlist' })}
        />
      )
    }

    return null
  }

  return (
    <div className="hm-page">
      {homeLayout.order
        .filter((section) => !homeLayout.hidden.includes(section))
        .map((section) => {
          const content = renderSection(section)
          return content ? <Fragment key={section}>{content}</Fragment> : null
        })}

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
          recommendation={selectedGame.recommendation || null}
          onClose={() => setSelectedGame(null)}
        />
      ) : null}

      {openStory ? (
        <Suspense fallback={null}>
          <NewsSheet
            item={openStory.item}
            rel={openStory.rel}
            onClose={() => setOpenStory(null)}
            onOpenGame={openGameFor}
          />
        </Suspense>
      ) : null}
    </div>
  )
}

export { preloadGameSheet }
