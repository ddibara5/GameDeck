import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Cover from './Cover.jsx'
import GameSheet from './GameSheet.jsx'
import { igdbCover, minutesToHhm, releaseDayDelta, platformMeta } from '../lib/format.js'
import { useLibraryGames } from '../lib/useLibraryGames.js'
import { useWishlist } from '../lib/wishlist.js'
import { loadGamePass } from '../lib/discover.js'
import { lockScroll } from '../lib/scrollLock.js'
import { useDelayedClose } from '../lib/useDelayedClose.js'
import { useEdgeBack } from '../lib/useEdgeBack.js'
import {
  REROLL_BUDGET, PLAY_POOLS, BUY_POOLS, shuffle, shuffleId,
  loadSnooze, addSnooze, topGenres, availableVibes,
} from '../lib/shuffle.js'
import './shuffle.css'

// How many covers flick past before the roll settles. Not a loading state - the
// data is already in memory - so it is deliberately short.
const CYCLE_FRAMES = 8
const CYCLE_MS = 70

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

function coverSrc(item, mode) {
  if (mode === 'buy') return item.cover || null
  return item.cover_igdb ? igdbCover(item.cover_igdb, 't_cover_big') : item.cover_standard || item.cover_small
}

function titleOf(item, mode) {
  return (mode === 'buy' ? item.title : item.title) || 'Untitled'
}

export default function ShufflePicker({ open, onClose }) {
  const { closing, requestClose } = useDelayedClose(onClose)
  const { games } = useLibraryGames()
  const { items: wishItems } = useWishlist()
  const [gamePass, setGamePass] = useState(null)

  const [mode, setMode] = useState('play')
  const [pool, setPool] = useState('never')
  const [platform, setPlatform] = useState('any')
  const [genre, setGenre] = useState('any')
  const [vibe, setVibe] = useState('any')
  const [maxMinutes, setMaxMinutes] = useState(0)
  const [boost, setBoost] = useState(true)

  const [snoozeMap, setSnoozeMap] = useState(() => loadSnooze())
  const [rerolls, setRerolls] = useState(REROLL_BUDGET)
  const [result, setResult] = useState(null)
  const [flicker, setFlicker] = useState(null)
  // The picked game's sheet, rendered from here so "Open" reuses the same detail
  // view every other surface uses rather than inventing a second one.
  const [sheet, setSheet] = useState(null)
  const timer = useRef(null)

  useEffect(() => (open ? lockScroll() : undefined), [open])
  // Suppressed while the game sheet is up so a back-swipe closes that first.
  useEdgeBack(requestClose, { disabled: !open || Boolean(sheet) })

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

  useEffect(() => () => clearInterval(timer.current), [])

  const items = mode === 'buy' ? wishItems : games
  const filters = useMemo(
    () => ({ platform, genre, vibe, maxMinutes }),
    [platform, genre, vibe, maxMinutes]
  )

  const genres = useMemo(() => topGenres(games), [games])
  const vibes = useMemo(() => availableVibes(games), [games])
  const pools = mode === 'buy' ? BUY_POOLS : PLAY_POOLS
  const poolMeta = pools.find((p) => p.key === pool) || pools[0]

  const poolCounts = useMemo(() => {
    const out = {}
    for (const p of pools) {
      out[p.key] = shuffle({
        items, mode, pool: p.key, filters, gamePass, snoozeMap: {}, boost: false,
      }).poolSize
    }
    return out
  }, [items, mode, pools, filters, gamePass])

  function roll(nextResult) {
    clearInterval(timer.current)
    const outcome = nextResult !== undefined ? nextResult : shuffle({
      items, mode, pool, filters, gamePass, snoozeMap,
      exclude: result && result.pick ? shuffleId(result.pick, mode) : null,
      boost,
    })
    if (prefersReducedMotion() || !outcome.pick) {
      setFlicker(null)
      setResult(outcome)
      return
    }
    const bag = items.length ? items : []
    let n = 0
    timer.current = setInterval(() => {
      setFlicker(bag[Math.floor(Math.random() * bag.length)] || null)
      if (++n >= CYCLE_FRAMES) {
        clearInterval(timer.current)
        setFlicker(null)
        setResult(outcome)
      }
    }, CYCLE_MS)
  }

  // Roll on open, and again whenever the shape of the question changes. Landing
  // on a stale pick after switching pools would misrepresent the new filter.
  useEffect(() => {
    if (!open) return
    roll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, pool, platform, genre, vibe, maxMinutes, boost, gamePass, items.length])

  useEffect(() => {
    if (!open) return
    setRerolls(REROLL_BUDGET)
    setSnoozeMap(loadSnooze())
  }, [open])

  function switchMode(next) {
    setMode(next)
    setPool(next === 'buy' ? 'outnow' : 'never')
    setPlatform('any')
    setGenre('any')
    setVibe('any')
    setMaxMinutes(0)
    setRerolls(REROLL_BUDGET)
  }

  function handleReroll() {
    if (rerolls <= 0) return
    setRerolls((n) => n - 1)
    roll()
  }

  function handleSnooze() {
    const pick = result && result.pick
    if (pick) setSnoozeMap((m) => addSnooze(m, shuffleId(pick, mode)))
    roll()
  }

  if (!open) return null

  const pick = result && result.pick
  const shown = flicker || pick
  const gp = pick && gamePass ? gamePass.get(Number(pick.igdb_id)) : null
  const dayDelta = mode === 'buy' && pick ? releaseDayDelta(pick.released) : null

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

  return createPortal(
    <div className={`shuffle-page${closing ? ' closing' : ''}`}>
      {shown ? (
        <div className="shuffle-bg" aria-hidden="true">
          <Cover src={coverSrc(shown, mode)} title="" size="lg" />
        </div>
      ) : null}
      <div className="shuffle-veil" aria-hidden="true" />

      <div className="shuffle-in">
        <div className="shuffle-top">
          <h2>{mode === 'buy' ? 'What should I buy?' : 'What should I play?'}</h2>
          <button type="button" className="shuffle-x" onClick={requestClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
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

        <div className="shuffle-filters">
          {mode === 'play' ? (
            <>
              <div className="shuffle-chips">
                <button type="button" className={`sfchip${platform === 'any' ? ' on' : ''}`} onClick={() => setPlatform('any')}>All platforms</button>
                {['xbox', 'psn', 'steam'].map((env) => {
                  const p = platformMeta(env)
                  return (
                    <button key={env} type="button" className={`sfchip${platform === env ? ' on' : ''}`} onClick={() => setPlatform(env)}>
                      <span className="sfdot" style={{ background: p.color }} />
                      {p.label}
                    </button>
                  )
                })}
                <button type="button" className={`sfchip${maxMinutes ? ' on' : ''}`} onClick={() => setMaxMinutes(maxMinutes ? 0 : 900)}>Under 15h</button>
              </div>
              {vibes.length ? (
                <div className="shuffle-chips">
                  {vibes.map((v) => (
                    <button key={v.key} type="button" className={`sfchip${vibe === v.key ? ' on' : ''}`} onClick={() => setVibe(vibe === v.key ? 'any' : v.key)}>{v.label}</button>
                  ))}
                </div>
              ) : null}
              {genres.length ? (
                <div className="shuffle-chips">
                  {genres.map((g) => (
                    <button key={g} type="button" className={`sfchip${genre === g ? ' on' : ''}`} onClick={() => setGenre(genre === g ? 'any' : g)}>{g.replace(' (RPG)', '')}</button>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
          <div className="shuffle-chips">
            <button type="button" className={`sfchip gp${boost ? ' on' : ''}`} onClick={() => setBoost(!boost)}>
              {mode === 'buy' ? 'Flag if on Game Pass' : 'Favour Game Pass'}
            </button>
          </div>
        </div>

        <div className="shuffle-stage">
          {shown ? (
            <button
              type="button"
              className={`shuffle-cover${flicker ? ' rolling' : ''}`}
              onClick={() => pick && setSheet(pick)}
              aria-label={`Open ${titleOf(shown, mode)}`}
            >
              <Cover src={coverSrc(shown, mode)} title={titleOf(shown, mode)} size="lg" />
            </button>
          ) : (
            <div className="shuffle-empty">
              <p>Nothing matches that combination.</p>
              <p className="shuffle-empty-sub">Try widening the pool or clearing a filter.</p>
            </div>
          )}

          {pick && !flicker ? (
            <>
              <div className="shuffle-badges">
                {gp && !gp.leaving_soon ? <span className="shuffle-badge gp">On Game Pass</span> : null}
                {gp && gp.leaving_soon ? <span className="shuffle-badge leaving">Leaving Game Pass soon</span> : null}
                {mode === 'buy' && gp ? <span className="shuffle-badge owned">Own it free</span> : null}
              </div>
              <h3 className="shuffle-title">{titleOf(pick, mode)}</h3>
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
                {result.reason ? <> . Favoured because it is <b>{result.reason}</b></> : null}
                {result.usedSnoozed ? <> . Everything fresh was snoozed, so this one came back around</> : null}
              </p>
            </>
          ) : null}
        </div>

        <div className="shuffle-acts">
          <button type="button" className="shuffle-btn primary" onClick={() => pick && setSheet(pick)} disabled={!pick}>Open</button>
          <button type="button" className="shuffle-btn" onClick={handleReroll} disabled={rerolls <= 0 || !pick}>
            Reroll
            <span className="shuffle-count">{rerolls > 0 ? `${rerolls} left` : 'none left'}</span>
          </button>
          <button type="button" className="shuffle-btn ghost" onClick={handleSnooze} disabled={!pick}>
            {mode === 'buy' ? 'Not now' : 'Not tonight'}
          </button>
        </div>
      </div>

      {sheet ? (
        <GameSheet
          variant={mode === 'buy' ? 'wishlist' : 'owned'}
          game={sheet}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </div>,
    document.body
  )
}
