import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Cover from './Cover.jsx'
import HeaderSettingsButton from './HeaderSettingsButton.jsx'
import { useDelayedClose } from '../lib/useDelayedClose.js'
import { useEdgeBack } from '../lib/useEdgeBack.js'
import { lockScroll } from '../lib/scrollLock.js'
import { useAchievementsUrl, useLibraryGames } from '../lib/useLibraryGames.js'
import { igdbCover, platformMeta, minutesToHhm, formatDate, releaseLabel } from '../lib/format.js'
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
import { peekGameSheetMedia } from '../lib/gameSheetMedia.js'
import {
  REACTIONS,
  getRankingStateCache,
  isRankingEligible,
  loadRankingState,
  tierForPosition,
} from '../lib/ranking.js'
import { safeExternalUrl } from '../lib/safeUrl.js'
import { useDialogA11y } from '../lib/useDialogA11y.js'
import './gameSheet.css'
// OwnedRankingAction renders before the lazy ranking editor is opened.
import './rankings.css'

const loadRankGameSheet = () => import('./RankGameSheet.jsx')
const loadLightbox = () => import('./Lightbox.jsx')
const RankGameSheet = lazy(loadRankGameSheet)
const Lightbox = lazy(loadLightbox)

// ---- Pilot detail density: 18px page inset, 16px card padding, 22px radii,
// section titles ~20px, 44px touch targets. Inline styles keep the rebuild in
// this file only; colors come from the theme tokens.
const cardStyle = {
  background: 'var(--surface-2)',
  borderRadius: 22,
  padding: 16,
}
const sectionTitleStyle = {
  color: 'var(--text)',
  fontSize: 'var(--collection-heading)',
  fontWeight: 700,
}
const eyebrowStyle = {
  color: 'var(--accent)',
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 1,
  textTransform: 'uppercase',
}

function reactionLabel(reaction) {
  return REACTIONS.find((item) => item.key === reaction)?.label || String(reaction || '').replaceAll('_', ' ')
}

function OwnedRankingAction({ game }) {
  const cachedState = getRankingStateCache()
  const [rankingState, setRankingState] = useState(cachedState)
  const [rankOpen, setRankOpen] = useState(false)
  const [rankVisited, setRankVisited] = useState(false)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState('')
  const { games } = useLibraryGames()
  const gameById = useMemo(() => new Map(games.map((item) => [String(item.master_id), item])), [games])

  useEffect(() => {
    let alive = true
    loadRankingState(false, (fresh) => {
      if (alive) setRankingState(fresh)
    })
      .then((state) => {
        if (alive) setRankingState(state)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const ranks = rankingState?.ranks || []
  const index = ranks.findIndex((item) => String(item.master_id) === String(game.master_id))
  const rank = index >= 0 ? ranks[index] : null
  const eligible = Boolean(rank) || isRankingEligible(game, explicitStatus(game))
  if (!eligible) return null

  const tier = rank ? tierForPosition(index, ranks.length) : null

  async function openRanking() {
    if (opening) return
    setError('')
    if (!rankingState) {
      setOpening(true)
      try {
        setRankingState(await loadRankingState())
      } catch (err) {
        setError(err.message || 'Could not load your ranking.')
        setOpening(false)
        return
      }
      setOpening(false)
    }
    setRankVisited(true)
    setRankOpen(true)
  }

  async function refreshRanking() {
    const next = await loadRankingState(true)
    setRankingState(next)
  }

  return (
    <>
      <button type="button" className="game-sheet-rank" disabled={opening} onPointerDown={loadRankGameSheet} onFocus={loadRankGameSheet} onClick={openRanking}>
        <span>
          <small>My ranking</small>
          <strong>
            {rank
              ? `${reactionLabel(rank.reaction)} · ${Math.round(rank.score)} · Tier ${tier}`
              : opening
                ? 'Opening…'
                : 'Rank this game'}
          </strong>
        </span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-9 6" /></svg>
      </button>
      {error ? <p className="rank-error" role="alert">{error}</p> : null}
      {rankVisited ? (
        <Suspense fallback={null}>
          <RankGameSheet
            open={rankOpen}
            game={game}
            ranks={ranks}
            gameById={gameById}
            existingRank={rank}
            onClose={() => setRankOpen(false)}
            onSaved={refreshRanking}
          />
        </Suspense>
      ) : null}
    </>
  )
}

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

function Metric({ label, value }) {
  return (
    <div style={{ width: '50%', paddingRight: 10 }}>
      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{label}</div>
      <div style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600 }}>{value}</div>
    </div>
  )
}

function ProgressBar({ percent, label }) {
  if (percent == null) return null
  return (
    <div
      role="progressbar"
      aria-label={`${label}: ${percent} percent`}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{ height: 8, borderRadius: 999, overflow: 'hidden', background: 'var(--bg)' }}
    >
      <div
        style={{
          width: `${percent}%`,
          height: '100%',
          borderRadius: 999,
          background: 'var(--accent)',
        }}
      />
    </div>
  )
}

function ForYouContextCard({ recommendation }) {
  if (!recommendation) return null
  const evidence = recommendation.evidence || {}
  const source = evidence.source?.title
  const reason = String(
    recommendation.reason ||
      (evidence.shared?.length
        ? `Explore more ${evidence.shared.slice(0, 2).join(' and ')} games.`
        : 'A fresh discovery from your selected filters.'),
  )

  return (
    <section className="gs-for-you-card" aria-label="Why this game was recommended">
      <div className="gs-for-you-label">For you</div>
      <p className="gs-for-you-reason">{reason}</p>
      <p className="gs-for-you-note">
        {source ? 'Based on a related game and your GameDeck activity.' : 'Based on your GameDeck activity and the filters you chose.'}
      </p>
    </section>
  )
}

// One sheet for a game across Library (owned), Discover, and Wishlist. Same
// shell and section order everywhere (hero -> Ask GameDeck -> status/primary
// controls -> progress -> facts -> summary -> catalog -> screenshots); empty
// sections hide. The pilot's game-detail layout drives the density: 18px page
// inset, 16px card padding, 22px card radii, ~20px section titles, 44px touch
// targets. The primary control is the only structural swap: owned games get the
// status picker + ranking + progress, not-owned games get wishlist + Ask
// GameDeck + More like this. Owned and wishlist games fetch their IGDB blurb +
// screenshots by id so every sheet is equally rich.
export default function GameSheet({ variant, game, recommendation = null, onClose, inLibrary = false, onAsk, onMoreLikeThis, onNotInterested }) {
  const owned = variant === 'owned'
  const { closing, requestClose } = useDelayedClose(onClose)
  const dialogRef = useDialogA11y({ onClose: requestClose })
  const { ids: wishIds } = useWishlist()

  // Status (owned only). Two pieces of state, not one: which status is showing,
  // and whether that is something you chose or something the app derived from
  // your playtime. Without the second, a derived "Playing" looks identical to a
  // deliberate one and there is no way back out of an override.
  const [status, setStatusState] = useState('backlog')
  const [pinned, setPinned] = useState(false)

  // achievements_url is no longer carried on library rows: it was 34 kB across
  // 513 of them to serve this single link, on a sheet that shows one game at a
  // time. Fetched per game instead, so the link appears a beat after the sheet.
  const achievementsUrl = useAchievementsUrl(owned && game ? game.master_id : null, game)
  useEffect(() => {
    if (!owned || !game) return
    setPinned(Boolean(explicitStatus(game)))
    setStatusState(effectiveStatus(game))
  }, [owned, game])

  // IGDB media. Discover rail items already carry their summary + screenshots, so
  // we use them directly. Owned/wishlist items (and sparse Discover entries like a
  // wishlist card opened from the Discover home, which only has cover/title/year)
  // fetch it by id so every sheet is equally rich.
  const igdbId = owned ? game && game.igdb_id : game && (game.id ?? game.igdb_id)
  const discoverHasMedia = Boolean(
    variant === 'discover' && game && (game.summary || (game.screenshots && game.screenshots.length))
  )
  const initialMedia = discoverHasMedia ? game : peekGameSheetMedia(game, variant)
  const [media, setMedia] = useState(initialMedia)
  // True while we are still waiting on the IGDB fetch, so the body can hold the
  // space that summary + screenshots + chips will need. Seeded by the useState
  // initialiser rather than an effect so the very first paint already reserves
  // the room; reserving it one render late would reintroduce the jump.
  const [mediaPending, setMediaPending] = useState(() => !initialMedia && Boolean(igdbId))
  useEffect(() => {
    if (discoverHasMedia) {
      setMedia(game)
      setMediaPending(false)
      return undefined
    }
    const cached = peekGameSheetMedia(game, variant)
    if (cached) {
      setMedia(cached)
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

  // (Full-screen page: no swipe-down-to-close; the header back button and the
  // iOS edge swipe handle dismissal.)

  // Screenshot lightbox (null = closed, else the index being viewed).
  const [shotIndex, setShotIndex] = useState(null)
  // Lock background scroll while the sheet is open (shared ref-counted lock).
  useEffect(() => lockScroll(), [])

  // Full-screen page: iOS edge-swipe goes back. Suppressed while the screenshot
  // lightbox is up (it has its own close) or while Settings is open over the
  // page (Settings has its own bespoke edge-back). The rank sheet registers
  // itself in the edge-back stack, so it owns the gesture while open.
  const [settingsUp, setSettingsUp] = useState(false)
  useEffect(() => {
    const onSettingsClosed = () => setSettingsUp(false)
    window.addEventListener('gamedeck:settings-close', onSettingsClosed)
    return () => window.removeEventListener('gamedeck:settings-close', onSettingsClosed)
  }, [])
  const openSettings = useCallback(() => {
    setSettingsUp(true)
    window.dispatchEvent(new CustomEvent('gamedeck:open-settings'))
  }, [])
  useEdgeBack(requestClose, { disabled: settingsUp || shotIndex !== null })

  if (!game) return null

  const title = game.title || game.name
  const isForYou = Boolean(recommendation)
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
  const platformText = owned
    ? platformMeta(game.environment).label
    : platforms.slice(0, 3).join(', ')
  const rating = owned
    ? Number(game.igdb_rating) >= 0
      ? Number(game.igdb_rating)
      : (media && media.rating) || null
    : game.rating != null
      ? game.rating
      : (media && media.rating) || null
  const studio = ((companies.find((c) => c.developer) || companies[0] || {}).name) || null
  const genreYearText = [genreText, year].filter(Boolean).join(' · ')

  // Owned progress. Prefer story progress (playtime vs length); fall back to
  // achievement completion when no story length is known.
  const len = Number(game.length_minutes) || 0
  const storyPct =
    len > 0 ? Math.max(0, Math.min(100, Math.round(((game.playtime_minutes || 0) / len) * 100))) : null
  const achievementPct = Math.round(Number(game.percent) || 0)
  const progressPercent = storyPct ?? achievementPct
  const progressLabel = storyPct != null ? 'Story progress' : 'Achievement completion'
  const playtime = game.playtime_label || minutesToHhm(game.playtime_minutes)

  const wishActive = wishIds.has(Number(igdbId))
  const safeAchievementsUrl = safeExternalUrl(achievementsUrl)
  const safeGameUrl = safeExternalUrl(url)
  const seed = owned
    ? { master_id: game.master_id, id: igdbId, name: title, year, genres }
    : { id: igdbId, name: title, year, genres }
  const hasCatalogFacts = Boolean(studio || releaseText || platforms.length || rating != null)

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) requestClose()
  }

  // Portal to <body> so the fixed-position backdrop always anchors to the viewport,
  // not to a transformed ancestor (e.g. the Wishlist / list overlays use
  // `will-change: transform`, which would otherwise trap this sheet and make it
  // glitch or open misaligned). Keeps every sheet in the app on one identical path.
  //
  // The game detail renders as a full-screen page (Expo parity): a sticky header
  // row with a circular back button, the centered game title, and the settings
  // gear. Back returns to whatever opened the page, via requestClose.
  return createPortal(
    <div className={`modal-backdrop${closing ? ' closing' : ''}`} onClick={handleOverlayClick}>
      <div
        ref={dialogRef}
        className="modal-sheet game-sheet game-page"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          transform: closing ? 'translateX(100%)' : undefined,
          transition: 'transform var(--d-base) var(--ease-out)',
        }}
      >
        <div className="game-page-header">
          <button type="button" className="header-back" onClick={requestClose} aria-label="Back">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <p className="game-page-title">{title}</p>
          <HeaderSettingsButton onOpenSettings={openSettings} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 6 }}>
          {/* Hero: cover + title + key metadata, pilot arrangement. */}
          <div className="game-page-hero">
            <div className="game-page-cover">
              <Cover src={coverSrc} title={title} size="lg" priority />
            </div>
            <div className="game-page-hero-copy">
              {owned || inLibrary ? (
                <span style={eyebrowStyle}>In your library</span>
              ) : isForYou ? (
                <span style={eyebrowStyle}>Discover a game</span>
              ) : null}
              <div
                className="gs-hero-title"
                style={{
                  color: 'var(--text)',
                  fontSize: 'var(--t-t3)',
                  lineHeight: 1.25,
                  fontWeight: 700,
                }}
              >
                {title}
              </div>
              {isForYou && rating != null ? (
                <div className="gs-hero-rating">IGDB {Math.round(Number(rating))}/100</div>
              ) : !isForYou && genreYearText ? (
                <div className="gs-hero-meta">{genreYearText}</div>
              ) : null}
              {isForYou && releaseText ? (
                <div className="gs-hero-release">{releaseText}</div>
              ) : !isForYou && platformText ? (
                <div className="gs-hero-meta gs-hero-platforms">{platformText}</div>
              ) : null}
            </div>
          </div>

          {/* Ask GameDeck, pilot CTA. Owned sheets did not have this before. */}
          {onAsk && !isForYou ? (
            <button
              type="button"
              className="gs-ask"
              onClick={() => onAsk(seed)}
              aria-label={`Ask GameDeck about ${title}`}
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 9,
                width: '100%',
                minHeight: 46,
                padding: '8px 14px',
                border: 0,
                borderRadius: 16,
                background: 'var(--accent)',
                color: 'var(--bg)',
                cursor: 'pointer',
                font: 'inherit',
                textAlign: 'left',
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 17, fontWeight: 800 }}>✦</span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontWeight: 800 }}>Ask GameDeck</span>
                <span style={{ display: 'block', fontSize: 11, opacity: 0.72 }}>
                  Get guidance using your GameDeck context
                </span>
              </span>
              <span aria-hidden="true" style={{ fontSize: 19 }}>›</span>
            </button>
          ) : null}

          {isForYou ? (
            <>
              {genres.length ? (
                <div className="chip-wrap game-page-hero-chips">
                  {genres.map((genre) => (
                    <span className="meta-chip" key={genre}>{genre}</span>
                  ))}
                </div>
              ) : null}
              <ForYouContextCard recommendation={recommendation} />
            </>
          ) : null}

          {owned ? (
            <>
              {/* Your status, pilot card. */}
              <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                  <span style={sectionTitleStyle}>Your status</span>
                  <span
                    style={{
                      color: pinned ? 'var(--accent)' : 'var(--muted)',
                      fontSize: 12,
                      fontWeight: 800,
                      letterSpacing: 0.7,
                    }}
                  >
                    {pinned ? 'SET BY YOU' : 'GAMEDECK SUGGESTION'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }} role="group" aria-label="Your status for this game">
                  {STATUSES.map((s) => {
                    const active = status === s
                    const isPinned = pinned && active
                    return (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          // Tapping the status you already chose clears it, which is
                          // the only route back to the derived value. That branch of
                          // setStatus deletes the row; until now nothing in the app
                          // called it, so a status was permanent once set.
                          const clearing = pinned && status === s
                          setStatus(game.master_id, clearing ? null : s)
                          setPinned(!clearing)
                          setStatusState(clearing ? derivedStatus(game) : s)
                        }}
                        style={{
                          flex: 1,
                          minHeight: 44,
                          padding: '0 4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 13,
                          border: `1px solid ${isPinned ? 'var(--text)' : 'var(--line)'}`,
                          background: active ? 'var(--accent)' : 'var(--surface)',
                          color: active ? 'var(--bg)' : 'var(--text)',
                          font: 'inherit',
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        {STATUS_LABELS[s]}
                      </button>
                    )
                  })}
                </div>
                <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: '20px', margin: 0 }}>
                  {pinned
                    ? 'Set by you. Tap it again to clear.'
                    : 'Worked out from your playtime. Tap to set your own.'}
                </p>
              </div>

              <OwnedRankingAction game={game} />

              {/* Your progress, pilot card + metrics grid. */}
              <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={sectionTitleStyle}>Your progress</span>
                <ProgressBar percent={progressPercent} label={progressLabel} />
                <div style={{ display: 'flex', flexWrap: 'wrap', rowGap: 10 }}>
                  <Metric label="Status" value={STATUS_LABELS[status] || status} />
                  <Metric label="Playtime" value={playtime || 'Not recorded'} />
                  <Metric label={progressLabel} value={`${progressPercent}%`} />
                  {game.total_awards ? (
                    <Metric
                      label="Achievements"
                      value={`${game.earned_awards ?? 0} of ${game.total_awards}`}
                    />
                  ) : null}
                </div>
              </div>

              {/* At a glance, pilot card + metrics grid. */}
              <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={sectionTitleStyle}>At a glance</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', rowGap: 10 }}>
                  <Metric label="Last played" value={formatDate(game.last_played) || 'Not recorded'} />
                  <Metric
                    label="Story length"
                    value={len > 0 ? `~${Math.round(len / 60)}h` : 'Not available'}
                  />
                  <Metric
                    label="IGDB rating"
                    value={rating != null ? `${rating} / 100` : 'Not available'}
                  />
                  {(game.franchises || []).length ? (
                    <Metric label="Franchise" value={game.franchises.join(', ')} />
                  ) : null}
                </div>
              </div>
            </>
          ) : isForYou ? (
            <div className="game-page-primary-actions">
              <button
                type="button"
                className="game-page-primary"
                aria-pressed={wishActive}
                onClick={() => toggleWishlist({ id: igdbId, name: title, cover: coverSrc, year })}
              >
                {wishActive ? '✓ Wishlisted' : '+ Wishlist'}
              </button>
              {onAsk ? (
                <button
                  type="button"
                  className="game-page-secondary"
                  onClick={() => onAsk(seed)}
                  aria-label={`Ask GameDeck about ${title}`}
                >
                  ✦ Ask GameDeck
                </button>
              ) : null}
            </div>
          ) : (
            /* Discover / wishlist primary actions: wishlist toggle + More like this. */
            <div className="discover-actions" style={{ margin: 0 }}>
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
              {onMoreLikeThis ? (
                <button
                  type="button"
                  className="discover-action"
                  style={{ flex: 1, minHeight: 46 }}
                  onClick={() => onMoreLikeThis(seed)}
                >
                  More like this
                </button>
              ) : null}
            </div>
          )}

          {mediaPending ? (
            <MediaSkeleton owned={owned} />
          ) : (
            <>
              {/* About this game, pilot card. */}
              {summary ? (
                <div style={cardStyle}>
                  <div style={{ ...sectionTitleStyle, marginBottom: 10 }}>About this game</div>
                  <p style={{ color: 'var(--muted)', lineHeight: '21px', margin: 0 }}>{summary}</p>
                </div>
              ) : null}

              {/* Catalog details, pilot card. */}
              {hasCatalogFacts || url ? (
                <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <span style={sectionTitleStyle}>Catalog details</span>
                  {studio ? (
                    <div>
                      <div style={{ color: 'var(--muted)', fontSize: 13 }}>Studio</div>
                      <div style={{ color: 'var(--text)', fontSize: 'var(--collection-title)', fontWeight: 600 }}>{studio}</div>
                    </div>
                  ) : null}
                  {releaseText ? (
                    <div>
                      <div style={{ color: 'var(--muted)', fontSize: 13 }}>Released</div>
                      <div style={{ color: 'var(--text)', fontSize: 'var(--collection-title)', fontWeight: 600 }}>{releaseText}</div>
                    </div>
                  ) : null}
                  {platforms.length ? (
                    <div>
                      <div style={{ color: 'var(--muted)', fontSize: 13 }}>Platforms</div>
                      <div style={{ color: 'var(--text)', fontSize: 'var(--collection-title)', fontWeight: 600 }}>
                        {platforms.join(' · ')}
                      </div>
                    </div>
                  ) : null}
                  {rating != null && !owned ? (
                    <div>
                      <div style={{ color: 'var(--muted)', fontSize: 13 }}>IGDB rating</div>
                      <div style={{ color: 'var(--text)', fontSize: 'var(--collection-title)', fontWeight: 600 }}>{rating} / 100</div>
                    </div>
                  ) : null}
                  {safeGameUrl ? (
                    <a
                      className="detail-link"
                      href={safeGameUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      style={{ color: 'var(--accent)', fontWeight: 800 }}
                    >
                      View on IGDB
                    </a>
                  ) : null}
                  {owned && safeAchievementsUrl ? (
                    <a
                      className="detail-link"
                      href={safeAchievementsUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      style={{ color: 'var(--accent)', fontWeight: 800 }}
                    >
                      View achievements
                    </a>
                  ) : null}
                </div>
              ) : null}

              {/* Screenshots, pilot section. */}
              {screenshots.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <span style={sectionTitleStyle}>Screenshots</span>
                  <div className="shot-strip" style={{ margin: '0 -18px', paddingLeft: 18, paddingRight: 18 }}>
                    {screenshots.map((s, i) => (
                      <button
                        type="button"
                        className="shot-btn"
                        key={i}
                        onPointerDown={loadLightbox}
                        onFocus={loadLightbox}
                        onClick={() => setShotIndex(i)}
                        aria-label={`View ${title} screenshot ${i + 1} larger`}
                        style={{
                          border: 0,
                          padding: 0,
                          background: 'none',
                          cursor: 'pointer',
                          font: 'inherit',
                        }}
                      >
                        <img
                          className="shot"
                          src={s}
                          alt={`${title} screenshot ${i + 1}`}
                          loading="lazy"
                          decoding="async"
                          style={{ borderRadius: 16 }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {genres.length && !isForYou ? (
                <div className="chip-wrap" style={{ margin: 0 }}>
                  {genres.map((g) => (
                    <span className="meta-chip" key={g}>
                      {g}
                    </span>
                  ))}
                </div>
              ) : null}
            </>
          )}

          {!owned && onNotInterested ? (
            <button
              type="button"
              className="game-sheet-not-interested"
              onClick={() => onNotInterested(game)}
            >
              Not interested
            </button>
          ) : null}
        </div>
      </div>

      {shotIndex != null ? (
        <Suspense fallback={null}>
          <Lightbox
            shots={screenshots}
            index={shotIndex}
            title={title}
            onClose={() => setShotIndex(null)}
          />
        </Suspense>
      ) : null}
    </div>,
    document.body,
  )
}
