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
  outletCount,
  OUTLET_CHIP_MIN,
  markNewsSeen,
  newestStamp,
  markRead,
  useReadNews,
  relTime,
  NEWS_SORTS,
  getNewsSort,
  setNewsSort,
} from '../lib/news.js'
import { useWishlist } from '../lib/wishlist.js'
import { useLibraryGames } from '../lib/useLibraryGames.js'
import { loadGamePass, fetchGameById } from '../lib/discover.js'
import NewsSheet from './NewsSheet.jsx'
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
  // The story whose sheet is up. { item, rel } rather than an id, because the
  // relevance is computed per week-section and is not on the row.
  const [openStory, setOpenStory] = useState(null)
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

  // Opening the sheet IS reading the story now: the row shows the headline and
  // nothing else, so a tap is the only way to have read anything. Following a
  // source link still marks it too, for the case where the sheet is skipped.
  function openStoryFor(item, rel) {
    markRead(item.primaryUrl)
    setOpenStory({ item, rel })
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
              onOpenStory={openStoryFor}
              sort={sort}
            />
          ))}
          <div className="news-footer">
            You're all caught up &middot; next digest <b>Sunday</b>
          </div>
        </>
      )}

      {openStory ? (
        <NewsSheet
          item={openStory.item}
          rel={openStory.rel}
          onClose={() => setOpenStory(null)}
          onOpenGame={openGameFor}
        />
      ) : null}

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
function WeekSection({ group, past, sets, readSet, onOpenStory, sort }) {
  const split = useMemo(() => splitForYou(group.items, sets), [group.items, sets])

  const list = (entries, key) => (
    <CappedList
      key={key}
      entries={entries}
      readSet={readSet}
      onOpenStory={onOpenStory}
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
function CappedList({ entries, readSet, onOpenStory, cap }) {
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
            onOpen={() => onOpenStory(entry.item, entry.rel)}
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

function NewsCard({ item, rel, read, onOpen }) {
  // Index into the art chain, advanced on load failure. The article image is a
  // hotlink and dies on someone else's schedule; the cover behind it is ours.
  const [artStep, setArtStep] = useState(0)
  const sources = dedupeSources(item.sources)
  const lead = sources[0] || null
  const when = relTime(item.publishedAt)
  const chain = cardArtChain(item, rel.row?.cover_igdb)
  const art = chain[artStep] || null
  const outlets = outletCount(item.sources)

  // ONE right-hand slot, and the relevance hook owns it. "In your library" says
  // more about whether to open a story than "4 outlets" does, and the two
  // stacked wrapped the meta line onto a second row, which is 20px this layout
  // does not have. The outlet count still shows in the sheet either way.
  const flag = rel.why
    ? { cls: 'news-row-why', text: rel.why, dot: true }
    : outlets >= OUTLET_CHIP_MIN
      ? { cls: 'news-row-heat', text: `${outlets} outlets`, dot: false }
      : null

  return (
    <button
      type="button"
      className={`news-row${read ? ' read' : ''}${rel.tier >= 4 ? ' pin' : ''}`}
      onClick={onOpen}
    >
      <span className="news-row-thumb">
        {art ? (
          <img
            key={art.src}
            className={art.kind === 'cover' ? 'is-cover' : undefined}
            src={art.src}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setArtStep((s) => s + 1)}
          />
        ) : (
          <span className="news-row-noart" aria-hidden="true" />
        )}
      </span>

      <span className="news-row-text">
        {/* Three lines, not two. At two this clipped 10 of one real week's 12
            headlines mid-phrase, because the digest writes 48-73 character
            titles into 261px. The third line costs 20px and one story per
            screen; see news.css for the thumbnail width it is paired with. */}
        <span className="news-row-title">{item.title}</span>
        <span className="news-row-meta">
          {lead ? <span className="news-row-src">{lead.name}</span> : null}
          {when ? (
            <>
              <span className="news-row-dot" aria-hidden="true">&middot;</span>
              <span className="news-row-time">{when}</span>
            </>
          ) : null}
          {flag ? (
            <span className={flag.cls}>
              {flag.dot ? <span className="news-why-dot" /> : null}
              {flag.text}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  )
}

// --- helpers ---------------------------------------------------------------

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
