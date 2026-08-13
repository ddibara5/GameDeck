import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Cover from './Cover.jsx'
import GameDetail from './GameDetail.jsx'
import GameSheet from './GameSheet.jsx'
import { igdbCover, minutesToHhm, releaseDayDelta, platformMeta } from '../lib/format.js'
import { useLibraryGames } from '../lib/useLibraryGames.js'
import { useWishlist } from '../lib/wishlist.js'
import { loadGamePass, fetchGamesByIds } from '../lib/discover.js'
import { lockScroll } from '../lib/scrollLock.js'
import { useDelayedClose } from '../lib/useDelayedClose.js'
import { useEdgeBack } from '../lib/useEdgeBack.js'
import { useStatusMap, effectiveStatus } from '../lib/userStatus.js'
import {
  PLAY_POOLS, BUY_POOLS, LENGTH_STEPS, shuffle, shuffleId, eligible,
  loadSnooze, addSnooze, removeSnooze, clearSnooze, topGenres,
} from '../lib/shuffle.js'
import { availableVibes } from '../lib/vibes.js'
import './shuffle.css'

// Horizontal travel before a drag counts as a swipe rather than a stray finger.
const SWIPE_PX = 56
// Below this the gesture has not committed to an axis yet, so vertical scrolling
// still wins.
const AXIS_PX = 8
// The edge-back gesture owns this strip. Starting a card swipe inside it would
// fire both, so the card simply ignores touches that begin there.
const EDGE_PX = 24

function coverSrc(item, mode) {
  if (mode === 'buy') return item.cover || null
  return item.cover_igdb ? igdbCover(item.cover_igdb, 't_cover_big') : item.cover_standard || item.cover_small
}

const titleOf = (item) => (item && item.title) || 'Untitled'

export default function ShufflePicker({ open, onClose }) {
  const { closing, requestClose } = useDelayedClose(onClose)
  const { games } = useLibraryGames()
  const { items: wishItems } = useWishlist()
  const statusMap = useStatusMap()
  const [gamePass, setGamePass] = useState(null)

  const [mode, setMode] = useState('play')
  const [pool, setPool] = useState('never')
  const [platform, setPlatform] = useState('any')
  const [genre, setGenre] = useState('any')
  const [vibe, setVibe] = useState('any')
  const [maxMinutes, setMaxMinutes] = useState(0)
  const [gamePassOnly, setGamePassOnly] = useState(false)
  const [boost, setBoost] = useState(true)
  const [showFilters, setShowFilters] = useState(false)

  const [snoozeMap, setSnoozeMap] = useState(() => loadSnooze())
  // The last "Not tonight", kept only so it can be undone. A 30-day hide with no
  // visible trace and no way back is too destructive for a one-tap button.
  const [undo, setUndo] = useState(null)
  const [result, setResult] = useState(null)
  const [sheet, setSheet] = useState(null)

  // Every pick this session, so a swipe back can return to one you skipped past.
  const deck = useRef({ list: [], at: -1 })
  const [dx, setDx] = useState(0)
  const drag = useRef(null)

  useEffect(() => (open ? lockScroll() : undefined), [open])
  // Suppressed while a sheet is up so a back-swipe closes that first.
  useEdgeBack(requestClose, { disabled: !open || Boolean(sheet) || showFilters })

  useEffect(() => {
    let alive = true
    loadGamePass().then((rows) => {
      if (!alive) return
      const map = new Map()
      for (const r of rows || []) map.set(Number(r.id), r)
      setGamePass(map)
    })
    return () => {
      alive = false
    }
  }, [])

  // Wishlist rows carry title/cover/year and nothing else, so Buy mode had no
  // genre or keywords to filter on. Same batched, per-id cached fetch Discover
  // uses for its wishlist rails, so this is usually free.
  const [buyMeta, setBuyMeta] = useState({})
  const wishSig = wishItems.map((r) => r.igdb_id).join(',')
  useEffect(() => {
    if (mode !== 'buy') return undefined
    let alive = true
    fetchGamesByIds(wishItems.map((r) => r.igdb_id).filter(Boolean))
      .then((m) => alive && setBuyMeta(m || {}))
      .catch(() => {})
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, wishSig])

  const buyItems = useMemo(
    () =>
      wishItems.map((r) => {
        const m = buyMeta[r.igdb_id]
        return m ? { ...r, genres: m.genres || [], keywords: m.keywords || [] } : r
      }),
    [wishItems, buyMeta]
  )

  const items = mode === 'buy' ? buyItems : games

  // Injected into the pool rules rather than imported by them, so the selection
  // logic stays pure and testable. Explicit tags win, derivation fills the rest.
  const statusOf = useMemo(() => (g) => effectiveStatus(g, statusMap), [statusMap])

  const filters = useMemo(
    () => ({ platform, genre, vibe, maxMinutes, gamePassOnly }),
    [platform, genre, vibe, maxMinutes, gamePassOnly]
  )

  const genres = useMemo(() => topGenres(items), [items])
  const vibes = useMemo(() => availableVibes(items, mode === 'buy' ? 2 : 5), [items, mode])
  const pools = mode === 'buy' ? BUY_POOLS : PLAY_POOLS
  const poolMeta = pools.find((p) => p.key === pool) || pools[0]

  const poolCounts = useMemo(() => {
    const out = {}
    for (const p of pools) {
      out[p.key] = eligible({ items, mode, pool: p.key, filters, gamePass, statusOf }).length
    }
    return out
  }, [items, mode, pools, filters, gamePass, statusOf])

  // What the current filters would leave. Shown on the sheet's primary button so
  // the effect of a filter is visible before the sheet closes, and so the dead end
  // of "nothing matches that combination" is visible on the way in.
  const eligibleCount = poolCounts[pool] || 0
  const snoozedCount = Object.keys(snoozeMap).length
  const activeCount =
    (platform !== 'any' ? 1 : 0) + (genre !== 'any' ? 1 : 0) + (vibe !== 'any' ? 1 : 0) +
    (maxMinutes ? 1 : 0) + (gamePassOnly ? 1 : 0)

  // `reset` starts a fresh deck: the question itself changed, so the earlier picks
  // answered a different one and are not worth swiping back to.
  function roll(reset) {
    const d = deck.current
    const current = d.at >= 0 ? d.list[d.at] : null
    const outcome = shuffle({
      items, mode, pool, filters, gamePass, snoozeMap, statusOf,
      exclude: !reset && current && current.pick ? shuffleId(current.pick, mode) : null,
      boost,
    })
    const list = reset ? [outcome] : [...d.list.slice(0, d.at + 1), outcome]
    deck.current = { list, at: list.length - 1 }
    setResult(outcome)
  }

  // Roll on open, and again whenever the shape of the question changes.
  //
  // gamePass is deliberately NOT a dependency. It arrives a moment after open, and
  // re-rolling on it made the first pick visibly swap itself out. It only changes
  // the odds, never the eligible set, unless gamePassOnly is on - which IS a
  // dependency, through `filters`.
  useEffect(() => {
    if (!open) return
    setUndo(null)
    roll(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, pool, platform, genre, vibe, maxMinutes, gamePassOnly, boost, items.length, statusMap])

  useEffect(() => {
    if (!open) return
    setSnoozeMap(loadSnooze())
  }, [open])

  function switchMode(next) {
    setMode(next)
    setPool(next === 'buy' ? 'outnow' : 'never')
    setPlatform('any')
    setGenre('any')
    setVibe('any')
    setMaxMinutes(0)
    setGamePassOnly(false)
    setUndo(null)
  }

  function resetFilters() {
    setPlatform('any')
    setGenre('any')
    setVibe('any')
    setMaxMinutes(0)
    setGamePassOnly(false)
  }

  function handleSnooze() {
    const pick = result && result.pick
    if (!pick) return
    const id = shuffleId(pick, mode)
    setSnoozeMap((m) => addSnooze(m, id))
    setUndo({ id, title: titleOf(pick) })
    roll(false)
  }

  function undoSnooze() {
    if (!undo) return
    setSnoozeMap((m) => removeSnooze(m, undo.id))
    setUndo(null)
  }

  // Stepping back through the deck is free and always was; with the reroll budget
  // gone, so is going forward.
  function stepTo(at) {
    deck.current = { list: deck.current.list, at }
    setResult(deck.current.list[at])
  }

  function goForward() {
    const d = deck.current
    if (d.at < d.list.length - 1) stepTo(d.at + 1)
    else roll(false)
  }

  function goBack() {
    const d = deck.current
    // Nothing behind the first pick, so a right swipe there just skips onward -
    // both directions have to do something or the gesture reads as broken.
    if (d.at <= 0) return false
    stepTo(d.at - 1)
    return true
  }

  function onTouchStart(e) {
    const t = e.touches && e.touches[0]
    if (!t || t.clientX <= EDGE_PX) return
    drag.current = { x: t.clientX, y: t.clientY, axis: null, dx: 0 }
  }

  function onTouchMove(e) {
    const d = drag.current
    const t = e.touches && e.touches[0]
    if (!d || !t) return
    const moveX = t.clientX - d.x
    const moveY = t.clientY - d.y
    if (!d.axis) {
      if (Math.abs(moveX) < AXIS_PX && Math.abs(moveY) < AXIS_PX) return
      d.axis = Math.abs(moveX) > Math.abs(moveY) ? 'x' : 'y'
    }
    if (d.axis !== 'x') return
    d.dx = moveX
    setDx(moveX)
  }

  function onTouchEnd() {
    const d = drag.current
    drag.current = null
    setDx(0)
    if (!d || d.axis !== 'x' || Math.abs(d.dx) < SWIPE_PX) return
    if (d.dx < 0) goForward()
    else if (!goBack()) goForward()
  }

  if (!open) return null

  const pick = result && result.pick
  const gp = pick && gamePass ? gamePass.get(Number(pick.igdb_id)) : null
  const dayDelta = mode === 'buy' && pick ? releaseDayDelta(pick.released) : null
  const pickStatus = pick && mode === 'play' ? statusOf(pick) : null

  const meta = []
  if (pick && mode === 'play') {
    const p = platformMeta(pick.environment)
    meta.push({ dot: p.color, text: p.label })
    if (pick.genre) meta.push({ text: pick.genre })
    if (pick.length_minutes) meta.push({ text: `${minutesToHhm(pick.length_minutes)} to beat` })
    if (pick.playtime_minutes > 0) meta.push({ text: `${minutesToHhm(pick.playtime_minutes)} played` })
  } else if (pick) {
    if (dayDelta === null) meta.push({ text: pick.year ? String(pick.year) : 'Date unknown' })
    else if (dayDelta === 0) meta.push({ text: 'Out today' })
    else if (dayDelta < 0) meta.push({ text: `Out ${Math.abs(dayDelta)} days ago` })
    else meta.push({ text: `In ${dayDelta} days` })
    if (pick.year) meta.push({ text: String(pick.year) })
  }

  const openPick = () => pick && setSheet(pick)

  return createPortal(
    <div className={`shuffle-page${closing ? ' closing' : ''}`}>
      {pick ? (
        <div className="shuffle-bg" aria-hidden="true">
          <Cover src={coverSrc(pick, mode)} title="" size="lg" />
        </div>
      ) : null}
      <div className="shuffle-veil" aria-hidden="true" />

      <div className="shuffle-in">
        <div className="shuffle-top">
          <h2>{mode === 'buy' ? 'What should I buy?' : 'What should I play?'}</h2>
          <div className="shuffle-top-actions">
            <button
              type="button"
              className={`filter-btn${activeCount ? ' active' : ''}`}
              onClick={() => setShowFilters(true)}
              aria-label={activeCount ? `Filters, ${activeCount} active` : 'Filters'}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 6h16M7 12h10M10 18h4" />
              </svg>
              {activeCount ? <span className="filter-count">{activeCount}</span> : null}
            </button>
            <button type="button" className="shuffle-x" onClick={requestClose} aria-label="Close">
              <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="shuffle-mode" role="tablist">
          {[['play', 'Play'], ['buy', 'Buy']].map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mode === key}
              className={mode === key ? 'on' : ''}
              onClick={() => switchMode(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="shuffle-seg">
          {pools.map((p) => (
            <button
              key={p.key}
              type="button"
              className={pool === p.key ? 'on' : ''}
              onClick={() => setPool(p.key)}
            >
              <b>{poolCounts[p.key] != null ? poolCounts[p.key] : '-'}</b>
              {p.label}
            </button>
          ))}
        </div>

        <div
          className={`shuffle-stage${dx ? ' dragging' : ''}`}
          style={dx ? { transform: `translateX(${dx}px)`, opacity: 1 - Math.min(Math.abs(dx) / 320, 0.45) } : undefined}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          {pick ? (
            <button type="button" className="shuffle-cover" onClick={openPick} aria-label={`Open ${titleOf(pick)}`}>
              <Cover src={coverSrc(pick, mode)} title={titleOf(pick)} size="lg" />
            </button>
          ) : (
            <div className="shuffle-empty">
              <p>Nothing matches that combination.</p>
              <p className="shuffle-empty-sub">
                {activeCount ? 'Clear a filter to widen the pool.' : 'Try a different pool.'}
              </p>
              {activeCount ? (
                <button type="button" className="discover-action" onClick={resetFilters}>
                  Clear {activeCount} {activeCount === 1 ? 'filter' : 'filters'}
                </button>
              ) : null}
            </div>
          )}

          {pick ? (
            <>
              <div className="shuffle-badges">
                {gp && !gp.leaving_soon ? <span className="shuffle-badge gp">On Game Pass</span> : null}
                {gp && gp.leaving_soon ? <span className="shuffle-badge leaving">Leaving Game Pass soon</span> : null}
                {mode === 'buy' && gp ? <span className="shuffle-badge owned">Own it free</span> : null}
                {pickStatus === 'finished' ? <span className="shuffle-badge owned">Finished</span> : null}
              </div>
              <button type="button" className="shuffle-title-btn" onClick={openPick}>
                <h3 className="shuffle-title">{titleOf(pick)}</h3>
              </button>
              <div className="shuffle-meta">
                {meta.map((m, i) => (
                  <span key={i}>
                    {i > 0 ? <i className="shuffle-sep">·</i> : null}
                    {m.dot ? <span className="sfdot" style={{ background: m.dot }} /> : null}
                    {m.text}
                  </span>
                ))}
              </div>
              <p className="shuffle-why">
                Chose from <b>{result.poolSize}</b> games {poolMeta.sub}
                {result.reason ? <>{'. Favoured because it is '}<b>{result.reason}</b></> : null}
                {result.usedSnoozed ? '. Everything fresh was snoozed, so this one came back around' : null}
              </p>
            </>
          ) : null}
        </div>

        {undo ? (
          <div className="shuffle-undo">
            <span>Snoozed {undo.title} for 30 days</span>
            <button type="button" onClick={undoSnooze}>Undo</button>
          </div>
        ) : null}

        <div className="shuffle-acts">
          <button type="button" className="shuffle-btn primary" onClick={openPick} disabled={!pick}>Open</button>
          <button type="button" className="shuffle-btn" onClick={() => roll(false)} disabled={!pick}>Reroll</button>
          <button type="button" className="shuffle-btn ghost" onClick={handleSnooze} disabled={!pick}>
            {mode === 'buy' ? 'Not now' : 'Not tonight'}
          </button>
        </div>
      </div>

      {showFilters ? (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowFilters(false)}>
          <div className="modal-sheet filter-sheet" role="dialog" aria-modal="true" aria-label="Filters">
            <div className="modal-handle" />
            <div className="detail-title">Filters</div>

            {mode === 'play' ? (
              <div className="filter-group">
                <span className="filter-label">Platform</span>
                <div className="filter-options">
                  <button type="button" className={`filter-opt${platform === 'any' ? ' active' : ''}`} onClick={() => setPlatform('any')}>
                    All
                  </button>
                  {['xbox', 'psn', 'steam'].map((env) => (
                    <button
                      key={env}
                      type="button"
                      className={`filter-opt${platform === env ? ' active' : ''}`}
                      onClick={() => setPlatform(platform === env ? 'any' : env)}
                    >
                      {platformMeta(env).label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {genres.length ? (
              <div className="filter-group">
                <span className="filter-label">Genre</span>
                <div className="filter-options">
                  <button type="button" className={`filter-opt${genre === 'any' ? ' active' : ''}`} onClick={() => setGenre('any')}>
                    All genres
                  </button>
                  {genres.map((g) => (
                    <button
                      key={g}
                      type="button"
                      className={`filter-opt${genre === g ? ' active' : ''}`}
                      onClick={() => setGenre(genre === g ? 'any' : g)}
                    >
                      {g.replace(' (RPG)', '')}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {vibes.length ? (
              <div className="filter-group">
                <span className="filter-label">Vibe</span>
                <div className="filter-options">
                  <button type="button" className={`filter-opt${vibe === 'any' ? ' active' : ''}`} onClick={() => setVibe('any')}>
                    Any
                  </button>
                  {vibes.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      className={`filter-opt${vibe === v.key ? ' active' : ''}`}
                      onClick={() => setVibe(vibe === v.key ? 'any' : v.key)}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {mode === 'play' ? (
              <div className="filter-group">
                <span className="filter-label">Length</span>
                <div className="filter-options">
                  {LENGTH_STEPS.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      className={`filter-opt${maxMinutes === s.key ? ' active' : ''}`}
                      onClick={() => setMaxMinutes(s.key)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="filter-group">
              <span className="filter-label">Game Pass</span>
              <div className="filter-options">
                <button
                  type="button"
                  className={`filter-opt${!gamePassOnly && !boost ? ' active' : ''}`}
                  onClick={() => { setGamePassOnly(false); setBoost(false) }}
                >
                  Ignore
                </button>
                <button
                  type="button"
                  className={`filter-opt${!gamePassOnly && boost ? ' active' : ''}`}
                  onClick={() => { setGamePassOnly(false); setBoost(true) }}
                >
                  {mode === 'buy' ? 'Flag if included' : 'Favour'}
                </button>
                <button
                  type="button"
                  className={`filter-opt${gamePassOnly ? ' active' : ''}`}
                  onClick={() => { setGamePassOnly(true); setBoost(true) }}
                >
                  Only
                </button>
              </div>
            </div>

            {snoozedCount ? (
              <div className="filter-group">
                <span className="filter-label">Snoozed</span>
                <div className="filter-options">
                  <button type="button" className="filter-opt" onClick={() => setSnoozeMap(clearSnooze())}>
                    Clear {snoozedCount} snoozed {snoozedCount === 1 ? 'game' : 'games'}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="filter-sheet-actions">
              <button type="button" className="discover-action" onClick={resetFilters}>Reset</button>
              <button type="button" className="discover-action primary" onClick={() => setShowFilters(false)}>
                {eligibleCount} {eligibleCount === 1 ? 'game' : 'games'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* The same sheet every other surface opens: GameDetail is exactly what the
          Library renders, and the wishlist variant is what the Wishlist page
          renders, so a game opened from here is identical to one opened there.
          This was already the right sheet - it was simply painting underneath the
          picker, because .shuffle-page sat above the sheet's own z-index. */}
      {sheet ? (
        mode === 'buy'
          ? <GameSheet variant="wishlist" game={sheet} onClose={() => setSheet(null)} />
          : <GameDetail game={sheet} onClose={() => setSheet(null)} />
      ) : null}
    </div>,
    document.body
  )
}
