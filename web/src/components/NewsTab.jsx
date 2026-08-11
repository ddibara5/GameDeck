import { useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchNews,
  groupByWeek,
  dedupeSources,
  gameStatus,
  markNewsSeen,
  hostOf,
} from '../lib/news.js'
import { useWishlist, addToWishlist } from '../lib/wishlist.js'
import { loadGamePass, loadLibraryTitles, fetchGameById } from '../lib/discover.js'
import { igdbCover } from '../lib/format.js'
import DiscoverDetail from './DiscoverDetail.jsx'
import Skeleton from './Skeleton.jsx'
import './news.css'

const PULL_THRESHOLD = 68

export default function NewsTab() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [gamepassIds, setGamepassIds] = useState(null)
  const [libraryTitles, setLibraryTitles] = useState(null)
  const [openGame, setOpenGame] = useState(null)
  const [openInLibrary, setOpenInLibrary] = useState(false)
  const mountedRef = useRef(true)
  const { ids: wishlistIds } = useWishlist()

  const load = async () => {
    const data = await fetchNews()
    if (!mountedRef.current) return
    setRows(data)
    if (data.length) markNewsSeen(data[0].weekOf) // newest week -> clears the tab dot
  }

  useEffect(() => {
    mountedRef.current = true
    ;(async () => {
      setLoading(true)
      await load()
      if (mountedRef.current) setLoading(false)
    })()
    // Membership sets for status badges (Game Pass by igdb id, library by title).
    Promise.all([loadGamePass(), loadLibraryTitles()]).then(([gp, lib]) => {
      if (!mountedRef.current) return
      setGamepassIds(new Set((gp || []).map((g) => Number(g.id)).filter(Boolean)))
      setLibraryTitles(lib || new Set())
    })
    return () => {
      mountedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    await load()
    if (mountedRef.current) setRefreshing(false)
  }

  const groups = useMemo(() => groupByWeek(rows), [rows])
  const sets = useMemo(
    () => ({ wishlistIds, gamepassIds, libraryTitles }),
    [wishlistIds, gamepassIds, libraryTitles],
  )
  const updatedLabel = useMemo(() => freshestLabel(rows), [rows])

  async function openSheet(item, inLib) {
    const g = await fetchGameById(item.gameIgdbId)
    if (!g || !mountedRef.current) return
    setOpenInLibrary(Boolean(inLib))
    setOpenGame(g)
  }

  // Pull-to-refresh (only engages when the page is scrolled to the very top).
  const pull = useRef({ startY: 0, active: false })
  const [pullY, setPullY] = useState(0)
  const onTouchStart = (e) => {
    if (window.scrollY > 0 || refreshing) return
    pull.current = { startY: e.touches[0].clientY, active: true }
  }
  const onTouchMove = (e) => {
    if (!pull.current.active) return
    const dy = e.touches[0].clientY - pull.current.startY
    if (dy <= 0 || window.scrollY > 0) {
      setPullY(0)
      return
    }
    setPullY(Math.min(dy * 0.5, 90)) // damped
  }
  const onTouchEnd = () => {
    if (!pull.current.active) return
    pull.current.active = false
    if (pullY >= PULL_THRESHOLD) refresh()
    setPullY(0)
  }

  const pulling = pullY > 0 || refreshing

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div
        className={`news-pull${pulling ? ' on' : ''}`}
        style={{ height: refreshing ? 40 : pullY }}
      >
        <span className="news-pull-label">
          {refreshing ? 'Refreshing…' : pullY >= PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}
        </span>
      </div>

      <div className="page-header">
        <h1 className="page-title">News</h1>
        <p className="page-subtitle">This week in gaming, curated.</p>
        {!loading && rows.length > 0 ? (
          <button type="button" className="news-refresh-note" onClick={refresh}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-3-6.7L21 8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M21 3v5h-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {updatedLabel ? `Updated ${updatedLabel} · tap to refresh` : 'Tap to refresh'}
          </button>
        ) : null}
      </div>

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
            <section key={group.weekOf} className={gi > 0 ? 'news-week-past' : undefined}>
              <div className="news-week-label">{weekLabel(group.weekOf)}</div>
              <div className="news-list">
                {group.items.map((item) => (
                  <NewsCard
                    key={item.id}
                    item={item}
                    sets={sets}
                    onWishlist={() =>
                      addToWishlist({ id: item.gameIgdbId, name: item.gameName, cover: item.gameCover })
                    }
                    onOpen={(inLib) => openSheet(item, inLib)}
                  />
                ))}
              </div>
            </section>
          ))}
          <div className="news-footer">
            You're all caught up · next digest <b>Sunday</b>
          </div>
        </>
      )}

      {openGame ? (
        <DiscoverDetail
          game={openGame}
          inLibrary={openInLibrary}
          onClose={() => setOpenGame(null)}
        />
      ) : null}
    </div>
  )
}

function NewsCard({ item, sets, onWishlist, onOpen }) {
  const [imgFailed, setImgFailed] = useState(false)
  const status = gameStatus(item, sets)
  const sources = dedupeSources(item.sources)
  const lead = sources[0] || null
  const fav = lead ? faviconFor(lead.url) : ''
  const when = relTime(item.publishedAt)
  const sourceLabel = sources.length <= 1 ? (lead ? lead.name : '') : `${sources.length} sources`

  const shownSources = sources.slice(0, 2)
  const extra = sources.length - shownSources.length

  return (
    <article className="news-card">
      {item.image && !imgFailed ? (
        <img
          className="news-card-img"
          src={item.image}
          alt=""
          loading="lazy"
          onError={() => setImgFailed(true)}
        />
      ) : null}
      <div className="news-card-body">
        <div className="news-meta">
          {fav ? <img className="news-meta-fav" src={fav} alt="" width="16" height="16" /> : null}
          {sourceLabel ? <span className="news-meta-source">{sourceLabel}</span> : null}
          {when ? <span className="news-meta-time">{when}</span> : null}
        </div>
        <h2 className="news-card-title">{item.title}</h2>
        <p className="news-card-summary">{item.summary}</p>

        {item.gameName ? (
          <GameRow item={item} status={status} onWishlist={onWishlist} onOpen={onOpen} />
        ) : null}

        <div className="news-sources">
          {shownSources.map((s, i) => (
            <span key={s.url + i}>
              {i > 0 ? <span className="news-source-sep" aria-hidden="true">|</span> : null}
              <a className="news-source-link" href={s.url} target="_blank" rel="noopener noreferrer">
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

function GameRow({ item, status, onWishlist, onOpen }) {
  const [imgFailed, setImgFailed] = useState(false)
  const owned = status === 'library' || status === 'wishlist'
  const coverUrl = item.gameCover ? igdbCover(item.gameCover, 't_cover_small') : ''
  const initial = (item.gameName || '?').trim().charAt(0).toUpperCase()

  return (
    <div className="news-game">
      <span className="news-game-thumb">
        {coverUrl && !imgFailed ? (
          <img src={coverUrl} alt="" loading="lazy" onError={() => setImgFailed(true)} />
        ) : (
          <span aria-hidden="true">{initial}</span>
        )}
      </span>
      <div className="news-game-meta">
        <span className="news-game-name">{item.gameName}</span>
        {status ? <StatusPill status={status} /> : null}
      </div>
      {owned ? (
        <button type="button" className="news-game-btn" onClick={() => onOpen(status === 'library')}>
          Open
        </button>
      ) : (
        <button type="button" className="news-game-btn primary" onClick={onWishlist}>
          + Wishlist
        </button>
      )}
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

function freshestLabel(rows) {
  let newest = 0
  for (const r of rows) {
    const t = r.publishedAt ? new Date(r.publishedAt).getTime() : 0
    if (t && t > newest) newest = t
  }
  return newest ? relTime(new Date(newest).toISOString()) : ''
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
