import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Cover from './Cover.jsx'
import { useDelayedClose } from '../lib/useDelayedClose.js'
import { lockScroll } from '../lib/scrollLock.js'
import { igdbCover, platformMeta, minutesToHhm, formatDate } from '../lib/format.js'
import { STATUSES, STATUS_LABELS, effectiveStatus, setStatus } from '../lib/userStatus.js'
import { useWishlist, toggleWishlist } from '../lib/wishlist.js'
import { fetchGameById } from '../lib/discover.js'
import Lightbox from './Lightbox.jsx'
import './gameSheet.css'

// Holds the vertical space that the summary + screenshot strip + genre chips
// will occupy once the IGDB media fetch lands. Without it the sheet paints
// short, finishes sliding up, and then snaps ~230px taller the moment the fetch
// resolves - which is the jolt that reads as the sheet "glitching" just as its
// images appear. Sized to match the real content it stands in for.
function MediaSkeleton({ owned }) {
  // The media response also fills in fact rows lower down - Studio for an owned
  // game, Platforms + Studio otherwise - so those are reserved here too. They
  // sit slightly higher than where the real rows land, which is invisible while
  // everything is shimmer and keeps the total height right, which is the part
  // that matters.
  const rows = owned ? 1 : 2
  return (
    <div aria-hidden="true">
      <div className="gs-sk-summary">
        <div className="skeleton gs-sk-line" />
        <div className="skeleton gs-sk-line" />
        <div className="skeleton gs-sk-line" />
        <div className="skeleton gs-sk-line" />
        <div className="skeleton gs-sk-line last" />
      </div>
      <div className="gs-sk-strip">
        <div className="skeleton gs-sk-shot" />
        <div className="skeleton gs-sk-shot" />
      </div>
      <div className="gs-sk-chips">
        <div className="skeleton gs-sk-chip" />
        <div className="skeleton gs-sk-chip" />
        <div className="skeleton gs-sk-chip" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div className="detail-row" key={i}>
          <span className="skeleton gs-sk-cell label" />
          <span className="skeleton gs-sk-cell" />
        </div>
      ))}
    </div>
  )
}

// One sheet for a game across Library (owned), Discover, and Wishlist. Same shell
// and section order everywhere (cover -> title -> meta -> primary control ->
// summary -> screenshots -> chips -> facts -> link); empty sections hide. The
// primary control is the only structural swap: owned games get the status picker
// + progress, not-owned games get wishlist + Ask AI + More like this. Owned and
// wishlist games fetch their IGDB blurb + screenshots by id so every sheet is
// equally rich.
export default function GameSheet({ variant, game, onClose, inLibrary = false, onAsk, onMoreLikeThis }) {
  const owned = variant === 'owned'
  const { closing, requestClose } = useDelayedClose(onClose)
  const { ids: wishIds } = useWishlist()

  // Status (owned only): reflect the current override/derived status.
  const [status, setStatusState] = useState('backlog')
  useEffect(() => {
    if (owned && game) setStatusState(effectiveStatus(game))
  }, [owned, game])

  // IGDB media. Discover rail items already carry their summary + screenshots, so
  // we use them directly. Owned/wishlist items (and sparse Discover entries like a
  // wishlist card opened from the Discover home, which only has cover/title/year)
  // fetch it by id so every sheet is equally rich.
  const igdbId = variant === 'discover' ? game && game.id : game && game.igdb_id
  const discoverHasMedia = Boolean(
    variant === 'discover' && game && (game.summary || (game.screenshots && game.screenshots.length))
  )
  const [media, setMedia] = useState(discoverHasMedia ? game : null)
  // True while we are still waiting on the IGDB fetch, so the body can hold the
  // space that summary + screenshots + chips will need. Seeded by the useState
  // initialiser rather than an effect so the very first paint already reserves
  // the room; reserving it one render late would reintroduce the jump.
  const [mediaPending, setMediaPending] = useState(() => !discoverHasMedia && Boolean(igdbId))
  useEffect(() => {
    if (discoverHasMedia) {
      setMedia(game)
      setMediaPending(false)
      return undefined
    }
    let alive = true
    let t = null
    setMedia(null)
    setMediaPending(Boolean(igdbId))
    if (igdbId) {
      fetchGameById(igdbId)
        .then((m) => {
          if (!alive) return
          // Swap in after the ~200ms open animation settles. The skeleton above
          // already holds the space, so this is only belt-and-braces: any small
          // residual difference in height lands after the slide, not during it.
          t = setTimeout(() => {
            if (!alive) return
            setMedia(m)
            setMediaPending(false)
          }, 240)
        })
        .catch(() => {
          // Fetch failed: drop the placeholder rather than shimmer forever.
          if (alive) setMediaPending(false)
        })
    }
    return () => {
      alive = false
      if (t) clearTimeout(t)
    }
  }, [variant, igdbId, discoverHasMedia]) // eslint-disable-line react-hooks/exhaustive-deps

  // Swipe-down-to-close, from the cover/handle zone so details below still scroll.
  const drag = useRef({ startY: 0, active: false })
  const [dragY, setDragY] = useState(0)

  // Screenshot lightbox (null = closed, else the index being viewed).
  const [shotIndex, setShotIndex] = useState(null)
  function onDragStart(e) {
    drag.current = { startY: e.touches[0].clientY, active: true }
  }
  function onDragMove(e) {
    if (!drag.current.active) return
    const dy = e.touches[0].clientY - drag.current.startY
    if (dy > 0) {
      setDragY(dy)
      if (e.cancelable) e.preventDefault()
    } else {
      setDragY(0)
    }
  }
  function onDragEnd() {
    const shouldClose = dragY > 110
    drag.current.active = false
    if (shouldClose) requestClose()
    else setDragY(0)
  }

  // Lock background scroll while the sheet is open (shared ref-counted lock).
  useEffect(() => lockScroll(), [])

  if (!game) return null

  const title = game.title || game.name
  const coverSrc = owned
    ? game.cover_igdb
      ? igdbCover(game.cover_igdb, 't_720p')
      : game.cover_tile || game.cover_standard || game.cover_small
    : game.cover
  const genres = (media && media.genres) || game.genres || []
  const platforms = (media && media.platforms) || game.platforms || []
  const companies = (media && media.companies) || game.companies || []
  const summary = (media && media.summary) || game.summary || null
  const screenshots = (media && media.screenshots) || game.screenshots || []
  const url = (media && media.url) || game.url || null
  const year = game.release_year || game.year || (media && media.year) || null
  const genreText = game.genre || genres[0] || null
  const platformText = owned ? platformMeta(game.environment).label : platforms.slice(0, 3).join(', ')
  const rating = owned
    ? Number(game.igdb_rating) >= 0
      ? Number(game.igdb_rating)
      : (media && media.rating) || null
    : game.rating != null
      ? game.rating
      : (media && media.rating) || null
  const studio = ((companies.find((c) => c.developer) || companies[0] || {}).name) || null
  const metaText = [year, genreText, platformText].filter(Boolean).join('  ·  ')

  // Owned progress.
  const len = Number(game.length_minutes) || 0
  const percent = Math.round(Number(game.percent) || 0)
  const storyPct =
    len > 0 ? Math.max(0, Math.min(100, Math.round(((game.playtime_minutes || 0) / len) * 100))) : null
  const playtime = game.playtime_label || minutesToHhm(game.playtime_minutes)

  const wishActive = wishIds.has(Number(igdbId))
  const seed = { id: igdbId, name: title, year, genres }

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) requestClose()
  }

  // Portal to <body> so the fixed-position backdrop always anchors to the viewport,
  // not to a transformed ancestor (e.g. the Wishlist / list overlays use
  // `will-change: transform`, which would otherwise trap this sheet and make it
  // glitch or open misaligned). Keeps every sheet in the app on one identical path.
  return createPortal(
    <div className={`modal-backdrop${closing ? ' closing' : ''}`} onClick={handleBackdropClick}>
      <div
        className="modal-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          transform: closing ? 'translateY(110%)' : dragY ? `translateY(${dragY}px)` : undefined,
          transition: drag.current.active ? 'none' : 'transform 0.2s ease',
        }}
      >
        <div className="sheet-drag-zone" onTouchStart={onDragStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd}>
          <div className="modal-handle" />
          <Cover src={coverSrc} title={title} size="lg" />
        </div>

        <div className="detail-title">{title}</div>
        {metaText || rating != null ? (
          <div className="gs-meta">
            {metaText ? <span>{metaText}</span> : null}
            {rating != null ? <span className="gs-star">{'★'} {rating}</span> : null}
          </div>
        ) : null}
        {!owned && inLibrary ? <span className="in-library-badge sheet">In your library</span> : null}

        {owned ? (
          <div className="status-picker" role="group" aria-label="Your status for this game">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                className={`status-btn${status === s ? ' active' : ''}`}
                onClick={() => {
                  setStatus(game.master_id, s)
                  setStatusState(s)
                }}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        ) : (
          <div className="discover-actions">
            <button
              type="button"
              className={`discover-action wish-action${wishActive ? ' on' : ''}`}
              aria-pressed={wishActive}
              aria-label={wishActive ? 'Remove from wishlist' : 'Add to wishlist'}
              onClick={() => toggleWishlist({ id: igdbId, name: title, cover: coverSrc, year })}
            >
              <svg viewBox="0 0 24 24" width="17" height="17" fill={wishActive ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 21s-7-4.5-9.5-8.5A5 5 0 0 1 12 6a5 5 0 0 1 9.5 6.5C19 16.5 12 21 12 21z" />
              </svg>
            </button>
            {onAsk ? (
              <button type="button" className="discover-action primary" onClick={() => onAsk(seed)}>
                Ask AI about this
              </button>
            ) : null}
            {onMoreLikeThis ? (
              <button type="button" className="discover-action" onClick={() => onMoreLikeThis(seed)}>
                More like this
              </button>
            ) : null}
          </div>
        )}

        {owned ? (
          <div className="detail-percent">
            {storyPct != null ? (
              <>
                {storyPct}%<span className="detail-percent-label">of story</span>
              </>
            ) : (
              <>
                {percent}%<span className="detail-percent-label">achievements</span>
              </>
            )}
          </div>
        ) : null}

        {mediaPending ? (
          <MediaSkeleton owned={owned} />
        ) : (
          <>
            {summary ? <p className="discover-summary">{summary}</p> : null}

            {screenshots.length ? (
              <div className="shot-strip">
                {screenshots.map((s, i) => (
                  <button
                    type="button"
                    className="shot-btn"
                    key={i}
                    onClick={() => setShotIndex(i)}
                    aria-label={`View ${title} screenshot ${i + 1} larger`}
                  >
                    <img className="shot" src={s} alt={`${title} screenshot ${i + 1}`} loading="lazy" decoding="async" />
                  </button>
                ))}
              </div>
            ) : null}

            {genres.length ? (
              <div className="chip-wrap">
                {genres.map((g) => (
                  <span className="meta-chip" key={g}>
                    {g}
                  </span>
                ))}
              </div>
            ) : null}
          </>
        )}

        {owned ? (
          <>
            {storyPct != null ? (
              <div className="detail-row">
                <span className="detail-label">Story progress</span>
                <span className="detail-value">
                  {storyPct}% {'·'} {minutesToHhm(game.playtime_minutes)} of ~{Math.round(len / 60)}h
                </span>
              </div>
            ) : null}
            <div className="detail-row">
              <span className="detail-label">Achievements</span>
              <span className="detail-value">
                {game.earned_awards ?? 0} / {game.total_awards ?? 0}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Playtime</span>
              <span className="detail-value">{playtime}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Last played</span>
              <span className="detail-value">{formatDate(game.last_played)}</span>
            </div>
            {len > 0 ? (
              <div className="detail-row">
                <span className="detail-label">Story length</span>
                <span className="detail-value">~{Math.round(len / 60)}h</span>
              </div>
            ) : null}
            {studio ? (
              <div className="detail-row">
                <span className="detail-label">Studio</span>
                <span className="detail-value">{studio}</span>
              </div>
            ) : null}
          </>
        ) : (
          <>
            {platforms.length ? (
              <div className="detail-row">
                <span className="detail-label">Platforms</span>
                <span className="detail-value">{platforms.join(', ')}</span>
              </div>
            ) : null}
            {studio ? (
              <div className="detail-row">
                <span className="detail-label">Studio</span>
                <span className="detail-value">{studio}</span>
              </div>
            ) : null}
            {year ? (
              <div className="detail-row">
                <span className="detail-label">Released</span>
                <span className="detail-value">{year}</span>
              </div>
            ) : null}
          </>
        )}

        {owned && game.achievements_url ? (
          <a className="detail-link" href={game.achievements_url} target="_blank" rel="noreferrer noopener">
            View achievements
          </a>
        ) : null}
        {!owned && url ? (
          <a className="detail-link" href={url} target="_blank" rel="noreferrer noopener">
            View on IGDB
          </a>
        ) : null}
      </div>

      {shotIndex != null ? (
        <Lightbox
          shots={screenshots}
          index={shotIndex}
          title={title}
          onClose={() => setShotIndex(null)}
        />
      ) : null}
    </div>,
    document.body,
  )
}
