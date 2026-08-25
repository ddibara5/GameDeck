import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Cover from './Cover.jsx'
import { useDelayedClose } from '../lib/useDelayedClose.js'
import { useSheetDrag } from '../lib/useSheetDrag.js'
import { lockScroll } from '../lib/scrollLock.js'
import { useAchievementsUrl } from '../lib/useLibraryGames.js'
import { coverImageId, igdbCover, platformMeta, minutesToHhm, formatDate, releaseLabel } from '../lib/format.js'
import {
  STATUSES,
  STATUS_LABELS,
  effectiveStatus,
  explicitStatus,
  derivedStatus,
  setStatus,
} from '../lib/userStatus.js'
import { useWishlist, toggleWishlist } from '../lib/wishlist.js'
import { fetchGameById } from '../lib/discover.js'
import { coverLook } from '../lib/tint.js'
import { resolveTheme } from '../lib/theme.js'
import Lightbox from './Lightbox.jsx'
import RankingReaction from './RankingReaction.jsx'
import { getGameRankCache, loadGameRank, seedForReaction } from '../lib/ranking.js'
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

  // Status (owned only). Two pieces of state, not one: which status is showing,
  // and whether that is something you chose or something the app derived from
  // your playtime. Without the second, a derived "Playing" looks identical to a
  // deliberate one and there is no way back out of an override.
  const [status, setStatusState] = useState('backlog')
  const [pinned, setPinned] = useState(false)
  const [rank, setRank] = useState(() => (owned && game ? getGameRankCache(game.master_id) || null : null))
  const [reactionPrompt, setReactionPrompt] = useState(false)

  // achievements_url is no longer carried on library rows: it was 34 kB across
  // 513 of them to serve this single link, on a sheet that shows one game at a
  // time. Fetched per game instead, so the link appears a beat after the sheet.
  const achievementsUrl = useAchievementsUrl(owned && game ? game.master_id : null, game)
  useEffect(() => {
    if (!owned || !game) return
    setPinned(Boolean(explicitStatus(game)))
    setStatusState(effectiveStatus(game))
  }, [owned, game])

  useEffect(() => {
    if (!owned || !game) return undefined
    let alive = true
    setReactionPrompt(false)
    const cached = getGameRankCache(game.master_id)
    setRank(cached === undefined ? null : cached)
    loadGameRank(game.master_id, (fresh) => {
      if (alive) setRank(fresh)
    }).then((data) => {
      if (alive) setRank(data || null)
    }).catch(() => {})
    return () => { alive = false }
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
    const openedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    setMedia(null)
    setMediaPending(Boolean(igdbId))
    if (igdbId) {
      fetchGameById(igdbId)
        .then((m) => {
          if (!alive) return
          // Swap in once the ~200ms open animation has settled. This is a
          // DEADLINE from sheet open, not 240ms added after the network: a slow
          // response that arrives after the slide should paint immediately.
          const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
          const remaining = Math.max(0, 240 - (now - openedAt))
          t = setTimeout(() => {
            if (!alive) return
            setMedia(m)
            setMediaPending(false)
          }, remaining)
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
  const { dragY, dragging, handlers: dragHandlers } = useSheetDrag(requestClose)

  // Screenshot lightbox (null = closed, else the index being viewed).
  const [shotIndex, setShotIndex] = useState(null)
  // Lock background scroll while the sheet is open (shared ref-counted lock).
  useEffect(() => lockScroll(), [])

  // The card's colour. Sampled from the COVER rather than from a screenshot,
  // for two reasons. It is fast: the cover is the image you just tapped, so it
  // is already decoded and in cache, and the tint lands on the first frame
  // instead of after the IGDB media fetch that the old blurred backdrop waited
  // on. And it is stable: one source means the card does not change colour a
  // beat after it opens.
  //
  // Read through /api/tint rather than straight off the image CDN. A canvas
  // read of a cross-origin image needs the host to send CORS headers, neither
  // IGDB nor wsrv.nl documents that it does, and a missing header fails silently
  // as "no tint". The API route serves the same bytes from this origin, so the
  // question does not arise. See web/api/tint.js.
  // THE CARD SETTLES IN TWO MOVES, and the rule that shapes both of them is
  // that the colour and the backdrop must always come from the SAME picture.
  // The version that did not - key art behind a cover-sampled colour - looked
  // like a rendering fault: warm art dissolving into a teal card. Mocking it is
  // the only reason it was caught.
  //
  //   fast  the cover, colour only. Already decoded and in cache because it is
  //         the image you just tapped, so the card is the right colour in ~80ms
  //         and no picture is encoded that nobody paints.
  //   rich  the key art, colour AND backdrop, from one read. Arrives with the
  //         IGDB media fetch for a library game, immediately for a Discover one
  //         whose payload already carries it, and instantly on any second open
  //         because that fetch is on disk for a week.
  //
  // `rich` wins whenever it exists rather than the two racing, so whichever
  // resolves first the pair on screen is never mismatched.
  const [fast, setFast] = useState(null)
  const [rich, setRich] = useState(null)
  const coverId = game ? coverImageId(game) : null
  const fastSrc = coverId ? `/api/tint?id=${encodeURIComponent(coverId)}&kind=cover` : null
  // The discover payload carries backdropId at open; a library row only learns
  // it from the media fetch. Same field either way, so this is one expression.
  const bdSrc = (() => {
    const from = (media && media.backdropId ? media : null) || (game && game.backdropId ? game : null)
    if (!from) return null
    return `/api/tint?id=${encodeURIComponent(from.backdropId)}&kind=${encodeURIComponent(from.backdropKind || 'screenshot')}`
  })()

  useEffect(() => {
    if (!fastSrc) { setFast(null); return undefined }
    let alive = true
    setFast(null)
    coverLook(fastSrc, resolveTheme()).then((c) => {
      if (alive) setFast(c)
    })
    return () => { alive = false }
  }, [fastSrc])

  useEffect(() => {
    if (!bdSrc) { setRich(null); return undefined }
    let alive = true
    setRich(null)
    coverLook(bdSrc, resolveTheme()).then((c) => {
      // Only promote once a colour actually came back. A read that failed means
      // the picture will not paint either, so the card stays on the cover's.
      if (alive && c) setRich(c)
    })
    return () => { alive = false }
  }, [bdSrc])

  const tint = rich || fast
  // The <img> below is the same url the colour was sampled from, so painting it
  // is a cache hit rather than a second download.
  const backdrop = rich ? bdSrc : null

  if (!game) return null

  const title = game.title || game.name
  const coverSrc = owned
    ? game.cover_igdb
      ? igdbCover(game.cover_igdb, 't_720p')
      : game.cover_small
    : game.cover
  const genres = (media && media.genres) || game.genres || []
  const platforms = (media && media.platforms) || game.platforms || []
  const companies = (media && media.companies) || game.companies || []
  const summary = (media && media.summary) || game.summary || null
  const screenshots = (media && media.screenshots) || game.screenshots || []
  const url = (media && media.url) || game.url || null
  const year = game.release_year || game.year || (media && media.year) || null
  // Exact release date, as precise as IGDB actually is about it (a full day for
  // dated games, "August 2026" / "Q3 2026" for ones only pinned to a month or
  // quarter). Comes from the media fetch for owned + wishlist games; Discover
  // rail items already carry it. Falls back to the bare year.
  const releaseText = releaseLabel((media && media.release) || game.release, year)
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
          transition: dragging ? 'none' : 'transform var(--d-base) var(--ease-out)',
          // Falls back to --surface in the stylesheet until (or unless) a tint
          // resolves, so a game with no cover, or a CDN that will not send CORS
          // headers, gets exactly the card it had before.
          ...(tint ? { '--gs-tint': tint } : null),
        }}
      >
        {/* The game's KEY ART, blurred and full bleed, masked out before any
            text starts. Not the cover: the cover is the poster sitting on top
            of this, and blurring the same picture behind itself is what made
            the card read as the poster twice. Artworks are landscape and carry
            no HUD, which is why they beat screenshots here.

            A plain <img>. It carries crossOrigin only to match the sampler's
            request exactly; the sharing itself does not depend on that, since
            Chromium keys the cache by url and this route is same-origin and
            immutable. Measured: the second read of the same url transfers 300
            bytes against the first one's 5611. */}
        {backdrop ? (
          <div className="gs-hero" aria-hidden="true">
            <img className="gs-hero-img" src={backdrop} crossOrigin="anonymous" alt="" decoding="async" />
          </div>
        ) : null}

        <div className="sheet-drag-zone" {...dragHandlers}>
          <div className="modal-handle" />
          <Cover src={coverSrc} title={title} size="lg" />
        </div>

        <div className="detail-title">{title}</div>
        {metaText || rating != null ? (
          <div className="gs-meta">
            {metaText ? <span>{metaText}</span> : null}
            {rating != null ? (
              <span className="gs-star">
                <i aria-hidden="true">{'★'}</i> {rating}
              </span>
            ) : null}
          </div>
        ) : null}
        {!owned && inLibrary ? <span className="in-library-badge sheet">In your library</span> : null}
        {owned && rank ? <span className="rank-sheet-badge">My rank · {Math.round(rank.score)}</span> : null}

        {owned ? (
          <>
            <div className="status-picker" role="group" aria-label="Your status for this game">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={status === s}
                  className={`status-btn${status === s ? ' active' : ''}${
                    pinned && status === s ? ' pinned' : ''
                  }`}
                  onClick={() => {
                    // Tapping the status you already chose clears it, which is
                    // the only route back to the derived value. That branch of
                    // setStatus deletes the row; until now nothing in the app
                    // called it, so a status was permanent once set.
                    const clearing = pinned && status === s
                    setStatus(game.master_id, clearing ? null : s)
                    setPinned(!clearing)
                    setStatusState(clearing ? derivedStatus(game) : s)
                    if (!clearing && s === 'finished' && !rank) setReactionPrompt(true)
                  }}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
            <p className="status-hint">
              {pinned
                ? 'Set by you. Tap it again to clear.'
                : 'Worked out from your playtime. Tap to set your own.'}
            </p>
            {reactionPrompt ? (
              <RankingReaction
                masterId={game.master_id}
                onSaved={(reaction) => {
                  setRank({ score: seedForReaction(reaction), reaction, comparison_count: 0 })
                  setReactionPrompt(false)
                }}
              />
            ) : null}
          </>
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
            {releaseText ? (
              <div className="detail-row">
                <span className="detail-label">Released</span>
                <span className="detail-value">{releaseText}</span>
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
            {releaseText ? (
              <div className="detail-row">
                <span className="detail-label">Released</span>
                <span className="detail-value">{releaseText}</span>
              </div>
            ) : null}
          </>
        )}

        {owned && achievementsUrl ? (
          <a className="detail-link" href={achievementsUrl} target="_blank" rel="noreferrer noopener">
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
