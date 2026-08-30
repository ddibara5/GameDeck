import { useEffect, useMemo, useState } from 'react'
import Cover from './Cover.jsx'
import GameDetail from './GameDetail.jsx'
import RankGameSheet from './RankGameSheet.jsx'
import { libraryCover } from '../lib/format.js'
import { useLibraryGames } from '../lib/useLibraryGames.js'
import { explicitStatus, useStatusMap } from '../lib/userStatus.js'
import {
  chooseComparisonPair,
  getRankingStateCache,
  isRankingEligible,
  loadRankingState,
  recordComparison,
  tierForPosition,
} from '../lib/ranking.js'
import './rankings.css'

const SECTIONS = [
  { key: 'ranking', label: 'Ranking' },
  { key: 'compare', label: 'Compare' },
]

function RankGame({ game, rank, position, tier, onSelect }) {
  const score = Math.round(rank.score)
  const comparisonLabel = `${rank.comparison_count} ${rank.comparison_count === 1 ? 'comparison' : 'comparisons'}`

  return (
    <li className="rank-item">
      <button
        type="button"
        className="rank-row"
        onClick={() => onSelect(game)}
        aria-label={`Open ${game.title}, ranked ${position}, ${tier} tier, score ${score}`}
      >
        <div className={`rank-place tier-${tier.toLowerCase()}`} aria-hidden="true">{position}</div>
        <Cover src={libraryCover(game)} title={game.title} />
        <div className="rank-row-copy">
          <strong>{game.title}</strong>
          <div className="rank-row-meta">
            <span className={`rank-tier tier-${tier.toLowerCase()}`}>{tier} tier</span>
            <span className="rank-summary">{rank.reaction.replaceAll('_', ' ')} · {comparisonLabel}</span>
          </div>
        </div>
        <div className="rank-score" aria-hidden="true">{score}</div>
      </button>
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
  const cachedState = getRankingStateCache()
  const [section, setSection] = useState('ranking')
  const { games, loading: gamesLoading } = useLibraryGames()
  const statuses = useStatusMap()
  const [state, setState] = useState(() => cachedState || { ranks: [], comparisons: [] })
  const [loading, setLoading] = useState(() => !cachedState)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [rankQuery, setRankQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [rankTarget, setRankTarget] = useState(null)
  const [selectedGame, setSelectedGame] = useState(null)

  const refresh = async (force = false) => {
    setError('')
    try {
      setState(await loadRankingState(force, setState))
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
  const eligibleIds = useMemo(() => new Set(eligible.map((game) => String(game.master_id))), [eligible])
  const rankMetaById = useMemo(
    () => new Map(explicitRanks.map((rank, index) => [String(rank.master_id), {
      rank,
      position: index + 1,
      tier: tierForPosition(index, explicitRanks.length),
    }])),
    [explicitRanks],
  )
  const searchResults = useMemo(() => {
    if (!searchOpen) return []
    const query = rankQuery.trim().toLowerCase()
    const candidates = query
      ? games.filter((game) => String(game.title || '').toLowerCase().includes(query))
      : eligible.filter((game) => !rankedIds.has(String(game.master_id)))
    return candidates
      .sort((a, b) => {
        const aTitle = String(a.title || '').toLowerCase()
        const bTitle = String(b.title || '').toLowerCase()
        return Number(!aTitle.startsWith(query)) - Number(!bTitle.startsWith(query)) || aTitle.localeCompare(bTitle)
      })
      .slice(0, 8)
  }, [searchOpen, rankQuery, games, eligible, rankedIds])
  const pair = useMemo(() => chooseComparisonPair(explicitRanks, state.comparisons), [explicitRanks, state.comparisons])

  const compare = async (result) => {
    if (!pair || busy) return
    setBusy(true)
    setError('')
    try {
      await recordComparison(pair[0].master_id, pair[1].master_id, result)
      await refresh(true)
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
    <section className="rank-page" aria-label="Rankings">
      <header className="rank-head">
        <div className="seg rank-tabs" role="tablist" aria-label="Ranking sections">
          {SECTIONS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={section === item.key}
              className={`seg-btn${section === item.key ? ' active' : ''}`}
              onClick={() => {
                setSection(item.key)
                setSearchOpen(false)
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        {section === 'ranking' ? (
          <div className="rank-search-wrap">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>
            <input
              type="search"
              value={rankQuery}
              placeholder="Search your library to rank"
              aria-label="Search your library to rank"
              onFocus={() => setSearchOpen(true)}
              onChange={(event) => {
                setRankQuery(event.target.value)
                setSearchOpen(true)
              }}
            />
            {searchOpen ? (
              <div className="rank-search-results" role="listbox" aria-label="Library games">
                {searchResults.length ? searchResults.map((game) => {
                  const meta = rankMetaById.get(String(game.master_id))
                  const canRank = eligibleIds.has(String(game.master_id)) && !meta
                  return (
                    <button
                      key={game.master_id}
                      type="button"
                      role="option"
                      aria-selected="false"
                      disabled={!canRank}
                      onClick={() => {
                        setRankTarget(game)
                        setSearchOpen(false)
                      }}
                    >
                      <Cover src={libraryCover(game)} title={game.title} />
                      <span><strong>{game.title}</strong><small>{meta ? `Already ranked · ${Math.round(meta.rank.score)} · Tier ${meta.tier}` : canRank ? 'Ready to rank' : 'Not eligible yet'}</small></span>
                    </button>
                  )
                }) : (
                  <p>{rankQuery.trim() ? 'No matching library games.' : 'No eligible unranked games.'}</p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </header>

      {error ? <p className="rank-error" role="alert">{error}</p> : null}

      {section === 'ranking' ? (
        <>
          {explicitRanks.length ? (
            <ol className="rank-list">
              {explicitRanks.map((rank, index) => (
                <RankGame key={rank.master_id} game={gameById.get(String(rank.master_id))} rank={rank} position={index + 1} tier={tierForPosition(index, explicitRanks.length)} onSelect={setSelectedGame} />
              ))}
            </ol>
          ) : <p className="rank-empty">Search above to rank a game and start your list.</p>}
          {explicitRanks.length >= 2 ? (
            <button type="button" className="rank-precision-card" onClick={() => setSection('compare')}>
              <span><strong>Want more precision?</strong><small>Compare close neighbors when you feel like it.</small></span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
            </button>
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

      <RankGameSheet
        open={Boolean(rankTarget)}
        game={rankTarget}
        ranks={explicitRanks}
        gameById={gameById}
        onClose={() => setRankTarget(null)}
        onSaved={() => refresh(true)}
      />
      {selectedGame ? <GameDetail game={selectedGame} onClose={() => setSelectedGame(null)} /> : null}
    </section>
  )
}
