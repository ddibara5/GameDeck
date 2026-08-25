import { useEffect, useMemo, useState } from 'react'
import Cover from './Cover.jsx'
import RankingReaction from './RankingReaction.jsx'
import { libraryCover } from '../lib/format.js'
import { useLibraryGames } from '../lib/useLibraryGames.js'
import { explicitStatus, useStatusMap } from '../lib/userStatus.js'
import {
  chooseComparisonPair,
  isRankingEligible,
  loadRankingState,
  recordComparison,
  tierForPosition,
} from '../lib/ranking.js'
import './rankings.css'

const SECTIONS = [
  { key: 'ranking', label: 'Ranking' },
  { key: 'compare', label: 'Compare' },
  { key: 'how', label: 'How it works' },
]

function RankGame({ game, rank, position, tier }) {
  return (
    <li className="rank-row">
      <div className={`rank-place tier-${tier.toLowerCase()}`}><b>{position}</b><span>{tier}</span></div>
      <Cover src={libraryCover(game)} title={game.title} />
      <div className="rank-row-copy">
        <strong>{game.title}</strong>
        <span>{rank.reaction.replaceAll('_', ' ')} · {rank.comparison_count} comparisons</span>
      </div>
      <div className="rank-score">{Math.round(rank.score)}</div>
    </li>
  )
}

function CompareCard({ game, onPick, disabled }) {
  return (
    <button type="button" className="rank-duel-card" disabled={disabled} onClick={onPick}>
      <Cover src={libraryCover(game)} title={game.title} size="lg" />
      <strong>{game.title}</strong>
      <span>This one</span>
    </button>
  )
}

export default function RankingsTab() {
  const [section, setSection] = useState('ranking')
  const { games, loading: gamesLoading } = useLibraryGames()
  const statuses = useStatusMap()
  const [state, setState] = useState({ ranks: [], comparisons: [] })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = async () => {
    setError('')
    try {
      setState(await loadRankingState())
    } catch (err) {
      setError(err.message || 'Could not load your ranking.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const gameById = useMemo(() => new Map(games.map((game) => [String(game.master_id), game])), [games])
  const eligible = useMemo(
    () => games.filter((game) => isRankingEligible(game, explicitStatus(game, statuses))),
    [games, statuses],
  )
  const explicitRanks = useMemo(
    () => state.ranks.filter((rank) => rank.reaction && gameById.has(String(rank.master_id))),
    [state.ranks, gameById],
  )
  const rankedIds = useMemo(() => new Set(explicitRanks.map((rank) => String(rank.master_id))), [explicitRanks])
  const unseeded = eligible.filter((game) => !rankedIds.has(String(game.master_id)))
  const pair = useMemo(() => chooseComparisonPair(explicitRanks, state.comparisons), [explicitRanks, state.comparisons])

  const compare = async (result) => {
    if (!pair || busy) return
    setBusy(true)
    setError('')
    try {
      await recordComparison(pair[0].master_id, pair[1].master_id, result)
      await refresh()
    } catch (err) {
      setError(err.message || 'Could not save that comparison.')
    } finally {
      setBusy(false)
    }
  }

  if (loading || gamesLoading) return <div className="rank-page"><p className="rank-empty">Building your ranking…</p></div>

  const leftGame = pair ? gameById.get(String(pair[0].master_id)) : null
  const rightGame = pair ? gameById.get(String(pair[1].master_id)) : null

  return (
    <section className="rank-page" aria-labelledby="rank-title">
      <header className="rank-head">
        <p className="page-subtitle">Your taste, ordered by your choices</p>
        <h2 id="rank-title">My Ranking</h2>
        <div className="rank-tabs" role="tablist" aria-label="Ranking sections">
          {SECTIONS.map((item) => (
            <button key={item.key} type="button" role="tab" aria-selected={section === item.key} onClick={() => setSection(item.key)}>{item.label}</button>
          ))}
        </div>
      </header>

      {error ? <p className="rank-error" role="alert">{error}</p> : null}

      {section === 'ranking' ? (
        <>
          {explicitRanks.length ? (
            <ol className="rank-list">
              {explicitRanks.map((rank, index) => (
                <RankGame key={rank.master_id} game={gameById.get(String(rank.master_id))} rank={rank} position={index + 1} tier={tierForPosition(index, explicitRanks.length)} />
              ))}
            </ol>
          ) : <p className="rank-empty">React to two games below to start your ranking.</p>}
          {unseeded.length ? (
            <section className="rank-seed">
              <div className="rank-section-title"><h3>Add a game</h3><span>{unseeded.length} eligible</span></div>
              <div className="rank-seed-card">
                <Cover src={libraryCover(unseeded[0])} title={unseeded[0].title} />
                <div><strong>{unseeded[0].title}</strong><RankingReaction masterId={unseeded[0].master_id} compact onSaved={refresh} /></div>
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {section === 'compare' ? (
        <div className="rank-compare">
          {leftGame && rightGame ? (
            <>
              <p>Which game belongs higher in your ranking?</p>
              <div className="rank-duel">
                <CompareCard game={leftGame} disabled={busy} onPick={() => compare('left')} />
                <span className="rank-vs">or</span>
                <CompareCard game={rightGame} disabled={busy} onPick={() => compare('right')} />
              </div>
              <button type="button" className="rank-skip" disabled={busy} onClick={() => compare('skip')}>Too different</button>
              <small>Skipped pairs stay out of rotation for 90 days.</small>
            </>
          ) : (
            <p className="rank-empty">Add reactions to at least two eligible games, or come back after a skipped pair leaves rotation.</p>
          )}
        </div>
      ) : null}

      {section === 'how' ? (
        <div className="rank-how">
          <article><b>1</b><h3>React</h3><p>Loved, liked, mixed, or not for me gives each game a sensible starting point.</p></article>
          <article><b>2</b><h3>Compare</h3><p>Pick between close neighbors. Early choices move more; settled games move less.</p></article>
          <article><b>3</b><h3>Order</h3><p>S, A, B, and C tiers are percentiles of only the games you explicitly ranked.</p></article>
          <p className="rank-note">My Ranking is your explicit opinion. Discover still uses a separate recommendation score for what you may want next.</p>
        </div>
      ) : null}
    </section>
  )
}
