import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchNews,
  groupByWeek,
  dedupeSources,
  buildLibraryIndex,
  splitForYou,
  byNewest,
  WEEK_VISIBLE,
  FORYOU_VISIBLE,
  cardArtChain,
  coverSrc,
  outletCount,
  OUTLET_CHIP_MIN,
  markNewsSeen,
  newestStamp,
  markRead,
  useReadNews,
  hostOf,
  NEWS_SORTS,
  getNewsSort,
  setNewsSort,
} from '../lib/news.js'
import { useWishlist, addToWishlist } from '../lib/wishlist.js'
import { useLibraryGames } from '../lib/useLibraryGames.js'
import { loadGamePass, fetchGameById } from '../lib/discover.js'
import DiscoverDetail from './DiscoverDetail.jsx'
import GameDetail from './GameDetail.jsx'
import Skeleton from './Skeleton.jsx'
import usePullRefresh from '../lib/usePullRefresh.js'
import './news.css'

export default function NewsTab() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [gamepassIds, setGamepassIds] = useState(null)
  const [openGame, setOpenGame] = useState(null)
  const mountedRef = useRef(true)
  const { ids: wishlistIds } = useWishlist()
  const { games } = useLibraryGames()
  const readSet = useReadNews()
  // Read from storage on the first render, not in an effect, so the list never
  // paints in one order and then reshuffles into the other.
  const [sort, setSortState] = useState(getNewsSort)
  const chooseSort = (v) => setSortState(setNewsSort(v))

  const load = useCallback(async () => {
    const data = await fetchNews()
    if (!mountedRef.current) return data
    setRows(data)
    // Seen is tracked by the newest created_at rather than the week, because a
    // refresh adds to the current week without moving week_of.
    markNewsSeen(newestStamp(data))
    return data
  }, [])

  useEffect(() => {
    mountedRef.current = true
    ;(async () => {
      setLoading(true)
      await load()
      if (mountedRef.current) setLoading(false)
    })()
    loadGamePass().then((gp) => {
      if (!mountedRef.current) return
      setGamepassIds(new Set((gp || []).map((g) => Number(g.id)).filter(Boolean)))
    })
    return () => {
      mountedRef.current = false
    }
  }, [load])

  // The library arrives as rows, not just titles: the row is what lets a card
  // open the OWNED sheet and what supplies the playtime in the "because" line.
  const libIndex = useMemo(() => buildLibraryIndex(games), [games])
  const sets = useMemo(
    () => ({ libIndex, wishlistIds, gamepassIds }),
    [libIndex, wishlistIds, gamepassIds],
  )

  const groups = useMemo(() => groupByWeek(rows), [rows])

  // Read through a ref, not through `rows`: the hook holds this callback across
  // the whole gesture and a captured `rows` would be the count from whenever the
  // callback was last rebuilt, which is exactly the value that just changed.
  const countRef = useRef(0)
  countRef.current = rows.length

  const onRefresh = useCallback(
    async ({ canTrigger }) => {
      const before = countRef.current
      // The n8n run takes minutes, so the trigger is fire-and-forget and the
      // reload below shows whatever has landed so far. New stories from this
      // run appear on a later visit; that is the cost of not blocking the
      // gesture for two minutes.
      if (canTrigger) {
        try {
          await fetch('/api/news-refresh', { method: 'POST' })
        } catch {
          // Offline, or the route is not deployed yet. Re-reading the table is
          // still the useful half of a refresh, so carry on.
        }
      }
      const data = await load()
      const gained = data.length - before
      if (gained > 0) return `${gained} new ${gained === 1 ? 'story' : 'stories'}`
      return canTrigger ? 'Checking for new stories' : 'Up to date'
    },
    [load],
  )

  const pull = usePullRefresh({ onRefresh })

  // A library game opens the owned sheet, which knows about playtime and
  // achievements. Anything else opens the discover sheet, which is the same
  // GameSheet with the IGDB payload instead.
  async function openGameFor(item, rel) {
    if (rel.row) {
      setOpenGame({ kind: 'owned', game: rel.row })
      return
    }
    if (!item.gameIgdbId) return
    const g = await fetchGameById(item.gameIgdbId)
    if (!g || !mountedRef.current) return
    setOpenGame({ kind: 'discover', game: g, inLibrary: false })
  }

  return (
    <div {...pull.handlers}>
      <div className="news-pull" ref={pull.gutterRef}>
        <span className="news-pull-inner">
          <span className={`news-pull-spin${pull.phase === 'working' ? ' spinning' : ''}`} ref={pull.spinRef} />
          <span className="news-pull-label" ref={pull.labelRef} />
        </span>
      </div>

      <div className="page-header">
        <h1 className="page-title">News</h1>
        <p className="page-subtitle">This week in gaming, for your library.</p>
        {!loading && rows.length > 0 ? (
          <button type="button" className="news-refresh-note" onClick={pull.refreshNow} disabled={pull.busy}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-3-6.7L21 8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M21 3v5h-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {pull.busy ? 'Fetching new stories' : pull.note || 'Tap to refresh'}
          </button>
        ) : null}
      </div>

      {!loading && groups.length > 0 ? (
        <div className="seg news-seg" role="group" aria-label="Sort stories">
          {NEWS_SORTS.map((o) => (
            <button
              key={o.key}
              type="button"
              className={`seg-btn${sort === o.key ? ' active' : ''}`}
              aria-pressed={sort === o.key}
              onClick={() => chooseSort(o.key)}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : null}

      {loading ? (
        <div style={{ padding: '0 16px' }}>
          <Skeleton count={4} />
        </div>
      ) : groups.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No news yet</div>
          <div>Your weekly gaming digest lands here every Sunday. Check back soon.</div>
        </div>
      ) : (
        <>
          {groups.map((group, gi) => (
            <WeekSection
              key={group.weekOf}
              group={group}
              past={gi > 0}
              sets={sets}
              readSet={readSet}
              onOpenGame={openGameFor}
              sort={sort}
            />
          ))}
          <div className="news-footer">
            You're all caught up &middot; next digest <b>Sunday</b>
          </div>
        </>
      )}

      {openGame?.kind === 'owned' ? (
        <GameDetail game={openGame.game} onClose={() => setOpenGame(null)} />
      ) : null}
      {openGame?.kind === 'discover' ? (
        <DiscoverDetail
          game={openGame.game}
          inLibrary={openGame.inLibrary}
          onClose={() => setOpenGame(null)}
        />
      ) : null}
    </div>
  )
}

// Only the newest week is split into For you / Also this week. Older weeks stay
// as one list; splitting a week you have already read just moves things around.
function WeekSection({ group, past, sets, readSet, onOpenGame, sort }) {
  const split = useMemo(() => splitForYou(group.items, sets), [group.items, sets])

  const list = (entries, key) => (
    <CappedList
      key={key}
      entries={entries}
      readSet={readSet}
      onOpenGame={onOpenGame}
      // Both lists cap now. For you was uncapped until a refreshed week grew to
      // 68 stories and the section ran ~30 cards deep; it just gets a longer
      // leash than the tail does.
      cap={key === 'foryou' ? FORYOU_VISIBLE : WEEK_VISIBLE}
    />
  )

  // Newest collapses the For you / Also split rather than sorting inside it.
  // The split IS the relevance ordering, so keeping the two headings while
  // claiming to sort by date would still show a four-day-old story above this
  // morning's - which is the exact thing this control exists to escape.
  //
  // Weeks stay as separate sections in both orders. They carry the date context
  // the cards themselves only give as "4d", and the groups already arrive newest
  // week first, so newest-within-newest reads correctly top to bottom.
  if (past || sort === 'newest') {
    const all = [...split.forYou, ...split.also].sort((a, b) => byNewest(a.item, b.item))
    return (
      <section className={past ? 'news-week-past' : undefined}>
        <div className="news-week-label">
          {weekLabel(group.weekOf)}
          <span className="news-week-count">&middot; {all.length}</span>
        </div>
        {list(all, 'past')}
      </section>
    )
  }

  return (
    <section>
      {split.forYou.length > 0 ? (
        <>
          <div className="news-week-label foryou">
            For you <span className="news-week-count">&middot; {split.forYou.length} of {group.items.length}</span>
          </div>
          {list(split.forYou, 'foryou')}
        </>
      ) : null}
      {split.also.length > 0 ? (
        <>
          <div className="news-week-label">
            {split.forYou.length > 0 ? 'Also this week' : weekLabel(group.weekOf)}
            <span className="news-week-count">&middot; {split.also.length}</span>
          </div>
          {list(split.also, 'also')}
        </>
      ) : null}
    </section>
  )
}

// Renders at most `cap` cards and offers the rest.
//
// Nothing is deleted to keep a week short - a refresh appends, so the week grows
// and the tail is simply not drawn until asked for. That way a story pushed down
// by a later refresh is one tap away instead of gone, and the read state keyed
// on its url stays meaningful.
function CappedList({ entries, readSet, onOpenGame, cap }) {
  const [showAll, setShowAll] = useState(false)
  const hidden = Math.max(0, entries.length - cap)
  const shown = showAll || hidden === 0 ? entries : entries.slice(0, cap)

  return (
    <>
      <div className="news-list">
        {shown.map((entry) => (
          <NewsCard
            key={entry.item.id}
            item={entry.item}
            rel={entry.rel}
            read={readSet.has(entry.item.primaryUrl)}
            onOpenGame={onOpenGame}
          />
        ))}
      </div>
      {hidden > 0 ? (
        <button type="button" className="news-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : `Show ${hidden} older ${hidden === 1 ? 'story' : 'stories'}`}
        </button>
      ) : null}
    </>
  )
}

function NewsCard({ item, rel, read, onOpenGame }) {
  // Index into the art chain, advanced on load failure. The article image is a
  // hotlink and dies on someone else's schedule; the cover behind it is ours.
  const [artStep, setArtStep] = useState(0)
  const sources = dedupeSources(item.sources)
  const lead = sources[0] || null
  const fav = lead ? faviconFor(lead.url) : ''
  const when = relTime(item.publishedAt)
  const chain = cardArtChain(item, rel.row?.cover_igdb)
  const art = chain[artStep] || null
  const outlets = outletCount(item.sources)

  const shownSources = sources.slice(0, 2)
  const extra = sources.length - shownSources.length
  const onRead = () => markRead(item.primaryUrl)

  return (
    <article className={`news-card${read ? ' read' : ''}${rel.tier >= 4 ? ' pin' : ''}`}>
      {art ? (
        <div className={`news-card-band${art.kind === 'cover' ? ' cover' : ''}`}>
          {/* A 3:4 cover cannot fill a 16:9 band, and the old answer was to
              shrink it to 76px wide inside a 368px card: 29% of the pixels IGDB
              actually served. It also cropped square key art, because the band
              was `object-fit: cover`. The fix is the standard one: the same
              image, blown up and blurred, fills the band behind a sharp copy at
              a size worth looking at. Nothing is cropped and nothing is guessed,
              since the fill is drawn from the artwork itself. Decorative, so it
              stays out of the a11y tree. */}
          {art.kind === 'cover' ? (
            <img className="news-card-fill" src={art.src} alt="" aria-hidden="true" loading="lazy" decoding="async" />
          ) : null}
          <img
            key={art.src}
            className="news-card-img"
            src={art.src}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setArtStep((s) => s + 1)}
          />
        </div>
      ) : null}
      <div className="news-card-body">
        <div className="news-meta">
          {fav ? <img className="news-meta-fav" src={fav} alt="" width="16" height="16" /> : null}
          {lead ? <span className="news-meta-source">{lead.name}</span> : null}
          {when ? <span className="news-meta-time">{when}</span> : null}
          {read ? <span className="news-read-flag">Read</span> : null}
          {!read && outlets >= OUTLET_CHIP_MIN ? (
            <span className="news-heat">{outlets} outlets</span>
          ) : null}
        </div>
        <h2 className="news-card-title">{item.title}</h2>
        <p className="news-card-summary">{item.summary}</p>

        {rel.why ? (
          <div className="news-why">
            <span className="news-why-dot" />
            <span>
              {rel.why}
              {rel.qty ? <span className="news-why-qty"> &middot; {rel.qty}</span> : null}
            </span>
          </div>
        ) : null}

        {/* A franchise match has no game of its own - the story named none - but it
            does have the library row it matched, and that row is worth opening. */}
        {item.gameName || rel.row ? (
          <GameRow item={item} rel={rel} onOpen={() => onOpenGame(item, rel)} />
        ) : null}

        <div className="news-sources">
          {shownSources.map((s, i) => (
            <span key={s.url + i}>
              {i > 0 ? <span className="news-source-sep" aria-hidden="true">|</span> : null}
              <a
                className="news-source-link"
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onRead}
              >
                {sources.length === 1 ? 'Read article →' : `${s.name} →`}
              </a>
            </span>
          ))}
          {extra > 0 ? <span className="news-source-more">+{extra} more</span> : null}
        </div>
      </div>
    </article>
  )
}

function GameRow({ item, rel, onOpen }) {
  const [imgFailed, setImgFailed] = useState(false)
  const owned = rel.status === 'library' || rel.status === 'wishlist'
  // Three sources, narrowest first: the story's own cover, then the matched
  // library row's IGDB id, then whatever art the platform sync stored. Only the
  // first two are IGDB image ids; cover_small is a full platform url and must
  // NOT go through coverSrc, which would mistake its filename for an image id.
  const coverUrl =
    coverSrc(item.gameCover, 't_cover_small') ||
    coverSrc(rel.row?.cover_igdb, 't_cover_small') ||
    rel.row?.cover_small ||
    null
  const initial = (rel.row?.title || item.gameName || '?').trim().charAt(0).toUpperCase()

  // The whole cover-plus-name block is the open target, not just a trailing
  // button, and it works for any matched game rather than only owned ones - a
  // Game Pass match previously had no way to open at all. Opening needs an IGDB
  // id (or a library row); without either the block stays plain text rather
  // than a button that does nothing.
  const canOpen = Boolean(rel.row || item.gameIgdbId)
  const Hit = canOpen ? 'button' : 'span'
  const hitProps = canOpen ? { type: 'button', onClick: onOpen } : {}

  return (
    <div className="news-game">
      <Hit className={`news-game-hit${canOpen ? '' : ' flat'}`} {...hitProps}>
        <span className="news-game-thumb">
          {coverUrl && !imgFailed ? (
            <img src={coverUrl} alt="" loading="lazy" decoding="async" onError={() => setImgFailed(true)} />
          ) : (
            <span aria-hidden="true">{initial}</span>
          )}
        </span>
        <span className="news-game-meta">
          <span className="news-game-name">{rel.row?.title || item.gameName}</span>
          {rel.status ? <StatusPill status={rel.status} /> : null}
        </span>
      </Hit>
      {!owned ? (
        <button
          type="button"
          className="news-game-btn primary"
          onClick={() =>
            addToWishlist({ id: item.gameIgdbId, name: item.gameName, cover: item.gameCover })
          }
        >
          + Wishlist
        </button>
      ) : null}
    </div>
  )
}

function StatusPill({ status }) {
  if (status === 'gamepass') {
    return (
      <span className="news-status gp">
        <span className="news-status-dot" /> On Game Pass
      </span>
    )
  }
  if (status === 'library') {
    return (
      <span className="news-status lib">
        <span className="news-status-dot" /> In your library
      </span>
    )
  }
  if (status === 'wishlist') {
    return (
      <span className="news-status wish">
        <svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11" aria-hidden="true">
          <path d="M12 21s-7.5-4.6-9.7-9C1 9.3 2.4 6.5 5.2 6.1c1.8-.3 3.4.6 4.3 2 .9-1.4 2.5-2.3 4.3-2 2.8.4 4.2 3.2 2.9 5.9C19.5 16.4 12 21 12 21z" />
        </svg>
        Wishlisted
      </span>
    )
  }
  return null
}

// --- helpers ---------------------------------------------------------------

function faviconFor(url) {
  const host = hostOf(url)
  return host ? `https://www.google.com/s2/favicons?domain=${host}&sz=32` : ''
}

function relTime(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (!then || isNaN(then)) return ''
  const diffH = Math.round((Date.now() - then) / 3600000)
  if (diffH < 1) return 'just now'
  if (diffH < 24) return `${diffH}h ago`
  const d = Math.round(diffH / 24)
  return d === 1 ? '1 day ago' : `${d} days ago`
}

// week_of is 'YYYY-MM-DD' (Monday). Label relative to the current week.
function weekLabel(weekOf) {
  const monday = (dt) => {
    const x = new Date(dt)
    const day = (x.getDay() + 6) % 7
    x.setDate(x.getDate() - day)
    x.setHours(0, 0, 0, 0)
    return x
  }
  const d = new Date(`${weekOf}T00:00:00`)
  if (isNaN(d.getTime())) return 'Recent'
  const diffWeeks = Math.round((monday(new Date()) - monday(d)) / (7 * 86400000))
  if (diffWeeks <= 0) return 'This week'
  if (diffWeeks === 1) return 'Last week'
  return `Week of ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}
