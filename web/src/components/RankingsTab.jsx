import { useEffect, useMemo, useState } from 'react'
import Cover from './Cover.jsx'
import GameDetail from './GameDetail.jsx'
import RankGameSheet from './RankGameSheet.jsx'
import { libraryCover } from '../lib/format.js'
import { useLibraryGames } from '../lib/useLibraryGames.js'
import { explicitStatus, useStatusMap } from '../lib/userStatus.js'
import {
  RANK_REACTIONS,
  RANK_REACTION_LABELS,
  RANK_SKIP_CUTOFF_MS,
  chooseAnchoredRankingPair,
  chooseRankingPair,
  getRankingStateCache,
  isRankingEligible,
  loadRankingState,
  recordComparison,
  setRankReaction,
} from '../lib/ranking.js'
import { publishLaneDuelReceipt, shouldReturnFromLaneDuel } from '../lib/laneDuel.js'
import { buildDuelReceipt, loadTasteProfile } from '../lib/tasteProfile.js'
import './rankings.css'

const SECTIONS = [
  { key: 'ranking', label: 'Ranking' },
  { key: 'compare', label: 'Compare' },
]

function formatScore(score) {
  const value = Number(score)
  return Number.isFinite(value) ? Math.round(value).toLocaleString() : '—'
}

function reactionDisplay(reaction) {
  return RANK_REACTION_LABELS[reaction] || String(reaction || '').replaceAll('_', ' ') || 'Unrated'
}

function RankedRow({ game, rank, position, saving, onSaveReaction, onOpen }) {
  const comparisons = Number(rank.comparison_count) || 0
  return (
    <li className="rank-item">
      <div className="rank-row" style={{ cursor: 'default' }}>
        <div className="rank-place" aria-hidden="true">{position}</div>
        <button
          type="button"
          onClick={() => onOpen(game)}
          aria-label={`Open ${game.title}`}
          style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
        >
          <Cover src={libraryCover(game)} title={game.title} />
        </button>
        <div className="rank-row-copy">
          <button
            type="button"
            onClick={() => onOpen(game)}
            aria-label={`Open ${game.title}, ranked ${position}`}
            style={{ background: 'none', border: 0, padding: 0, color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}
          >
            <strong>{game.title}</strong>
          </button>
          <div className="rank-row-meta">
            <span className="rank-summary">
              {formatScore(rank.score)} · {reactionDisplay(rank.reaction)} · {comparisons} {comparisons === 1 ? 'comparison' : 'comparisons'}
            </span>
          </div>
          <label style={{ display: 'block', marginTop: 6 }}>
            <span style={{ display: 'block', marginBottom: 4, color: 'var(--muted)', fontSize: 'var(--t-cap)' }}>Your reaction</span>
            <select
              value={rank.reaction || ''}
              disabled={saving}
              onChange={(event) => onSaveReaction(rank.master_id, event.target.value)}
              aria-label={`Reaction for ${game.title}`}
              style={{
                width: '100%',
                minHeight: 44,
                boxSizing: 'border-box',
                padding: '0 12px',
                border: '1px solid var(--line-soft)',
                borderRadius: 'var(--r-sm)',
                background: 'var(--surface-2)',
                color: 'var(--text)',
                font: 'inherit',
                opacity: saving ? 0.6 : 1,
              }}
            >
              <option value="" disabled>Choose a reaction…</option>
              {RANK_REACTIONS.map((key) => (
                <option key={key} value={key}>{RANK_REACTION_LABELS[key]}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </li>
  )
}

function CompareCard({ game, score, onPick, disabled }) {
  return (
    <div className="rank-duel-card" style={{ cursor: 'default' }}>
      <Cover src={libraryCover(game)} title={game.title} size="lg" />
      <strong>{game.title}</strong>
      <span>{formatScore(score)} score</span>
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        aria-label={`Rank ${game.title} higher`}
        style={{
          width: '100%',
          minHeight: 44,
          border: 0,
          borderRadius: 999,
          background: 'var(--accent)',
          color: 'var(--bg)',
          font: 'inherit',
          fontWeight: 700,
          cursor: 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        This one
      </button>
    </div>
  )
}

export default function RankingsTab({ launch = null, onReturnToForYou = null }) {
  const cachedState = getRankingStateCache()
  const [laneFocus, setLaneFocus] = useState(() => launch?.laneKey || null)
  const [laneLabel] = useState(() => launch?.laneLabel || null)
  const [section, setSection] = useState(() => (launch?.laneKey ? 'compare' : 'ranking'))
  const { games, loading: gamesLoading } = useLibraryGames()
  const statuses = useStatusMap()
  const [state, setState] = useState(() => cachedState || { ranks: [], comparisons: [] })
  const [loading, setLoading] = useState(() => !cachedState)
  const [busy, setBusy] = useState(false)
  const [savingReaction, setSavingReaction] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [rankQuery, setRankQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [rankTarget, setRankTarget] = useState(null)
  const [selectedGame, setSelectedGame] = useState(null)
  const [sessionDuels, setSessionDuels] = useState(0)
  const [skipCutoff, setSkipCutoff] = useState(() => Date.now() - RANK_SKIP_CUTOFF_MS)
  const [receipt, setReceipt] = useState(null)

  const refresh = async (force = false) => {
    setError('')
    try {
      setState(await loadRankingState(force))
      setSkipCutoff(Date.now() - RANK_SKIP_CUTOFF_MS)
    } catch (err) {
      setError(err.message || 'Could not load your ranking.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const gameById = useMemo(() => new Map(games.map((game) => [String(game.master_id), game])), [games])
  // Ranked games in score-descending order, joined to local library metadata.
  const ranked = useMemo(() => {
    const items = []
    for (const rank of state.ranks || []) {
      const game = gameById.get(String(rank.master_id))
      if (game) items.push({ rank, game })
    }
    return items
  }, [state.ranks, gameById])
  const eligible = useMemo(
    () => games.filter((game) => isRankingEligible(game, explicitStatus(game, statuses))),
    [games, statuses],
  )
  const rankedIds = useMemo(() => new Set(ranked.map(({ rank }) => String(rank.master_id))), [ranked])
  const eligibleIds = useMemo(() => new Set(eligible.map((game) => String(game.master_id))), [eligible])
  // Slice 4: lane-anchored duel. laneSet is the launch's lane members;
  // laneItems are ranked, eligible (owned) games that belong to the lane.
  const laneSet = useMemo(
    () => new Set((launch?.laneMemberIds || []).map(Number)),
    [launch],
  )
  const laneItems = useMemo(
    () =>
      ranked.filter(
        ({ rank }) =>
          eligibleIds.has(String(rank.master_id)) && laneSet.has(Number(rank.master_id)),
      ),
    [ranked, eligibleIds, laneSet],
  )
  const laneAnchorId = launch?.anchorId ? Number(launch.anchorId) : null
  const laneAnchorPresent =
    laneAnchorId == null || laneItems.some(({ rank }) => Number(rank.master_id) === laneAnchorId)
  // Too few lane games (or a missing anchor) degrades to standard compare.
  useEffect(() => {
    if (loading || gamesLoading) return
    if (laneFocus && (laneItems.length < 2 || !laneAnchorPresent)) {
      setNotice('Not enough ranked games in this lane for a duel yet.')
      setLaneFocus(null)
    }
  }, [laneFocus, laneItems, laneAnchorPresent, loading, gamesLoading])
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
  const pair = useMemo(() => {
    if (!laneFocus) {
      return chooseRankingPair(ranked.map((item) => item.rank), state.comparisons, skipCutoff)
    }
    const laneRanks = laneItems.map((item) => item.rank)
    if (laneAnchorId != null) {
      return chooseAnchoredRankingPair(laneRanks, state.comparisons, skipCutoff, laneAnchorId)
    }
    return chooseRankingPair(laneRanks, state.comparisons, skipCutoff)
  }, [laneFocus, ranked, laneItems, laneAnchorId, state.comparisons, skipCutoff])

  const compare = async (result) => {
    if (!pair || busy) return
    setBusy(true)
    setError('')
    setNotice('')
    setReceipt(null)
    const leftId = pair.left.master_id
    const rightId = pair.right.master_id
    const titleOf = (id) => gameById.get(String(id))?.title || 'That game'
    try {
      await recordComparison(leftId, rightId, result)
      setSessionDuels((count) => count + 1)
      const nextState = await loadRankingState(true)
      setState(nextState)
      setSkipCutoff(Date.now() - RANK_SKIP_CUTOFF_MS)
      if (result === 'skip') {
        setNotice('Skipped. That pair stays out of rotation for 90 days.')
      } else {
        // Slice 4: a decided lane duel publishes an in-memory receipt and
        // returns to For You; the slice-3 transient receipt is skipped since
        // we navigate away. Skips keep the 90-day notice and do not return.
        if (shouldReturnFromLaneDuel(launch, laneFocus, result)) {
          const winnerId = result === 'left' ? leftId : rightId
          const loserId = result === 'left' ? rightId : leftId
          await publishLaneDuelReceipt({
            recommendationId: launch.recommendationId,
            laneKey: launch.laneKey,
            laneLabel,
            winnerId,
            winnerTitle: titleOf(winnerId),
            loserId,
            loserTitle: titleOf(loserId),
          })
          onReturnToForYou?.()
          return
        }
        // The duel flywheel: this result is already in the taste profile
        // (recordComparison busted its cache), so the receipt can cite the
        // lanes the winner now feeds.
        try {
          const profile = await loadTasteProfile({ force: true })
          const winnerId = result === 'left' ? leftId : rightId
          const loserId = result === 'left' ? rightId : leftId
          setReceipt(
            buildDuelReceipt({
              winnerId,
              loserId,
              winnerTitle: titleOf(winnerId),
              loserTitle: titleOf(loserId),
              result,
              ranks: nextState.ranks,
              profile,
            }),
          )
        } catch {
          setNotice('Ranking updated.')
        }
      }
    } catch (err) {
      setError(err.message || 'Could not save that comparison.')
    } finally {
      setBusy(false)
    }
  }

  const saveReaction = async (masterId, reaction) => {
    if (!reaction || busy || savingReaction) return
    setSavingReaction(masterId)
    setError('')
    setNotice('')
    try {
      await setRankReaction(masterId, reaction)
      await refresh(true)
      setNotice('Ranking updated.')
    } catch (err) {
      setError(err.message || 'Could not save that reaction.')
    } finally {
      setSavingReaction(null)
    }
  }

  if (loading || gamesLoading) return <div className="rank-page"><p className="rank-empty">Building your ranking…</p></div>

  const leftGame = pair ? gameById.get(String(pair.left.master_id)) : null
  const rightGame = pair ? gameById.get(String(pair.right.master_id)) : null
  const anchorGame = laneFocus && laneAnchorId != null ? gameById.get(String(laneAnchorId)) : null
  const totalComparisons = (state.comparisons || []).length

  return (
    <section
      className="rank-page"
      aria-label="Rankings"
      style={{ maxWidth: 430, paddingBottom: 'calc(var(--space-5) + env(safe-area-inset-bottom))' }}
    >
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
                // Leaving lane mode for the ranking list clears the lane
                // focus; a fresh "Tune this taste" launch re-arms it.
                if (item.key === 'ranking') setLaneFocus(null)
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
                  const isRanked = rankedIds.has(String(game.master_id))
                  const canRank = eligibleIds.has(String(game.master_id)) && !isRanked
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
                      <span><strong>{game.title}</strong><small>{isRanked ? 'Already ranked' : canRank ? 'Ready to rank' : 'Not eligible yet'}</small></span>
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
      {notice ? <p style={{ color: 'var(--muted)', fontSize: 'var(--t-foot)' }}>{notice}</p> : null}

      {section === 'ranking' ? (
        <>
          <p style={{ color: 'var(--muted)', fontSize: 'var(--t-cap)', margin: '0 0 var(--space-2)' }}>
            {ranked.length} {ranked.length === 1 ? 'game' : 'games'} ranked
          </p>
          {ranked.length ? (
            <ol className="rank-list">
              {ranked.map(({ rank, game }, index) => (
                <RankedRow
                  key={rank.master_id}
                  game={game}
                  rank={rank}
                  position={index + 1}
                  saving={savingReaction === rank.master_id}
                  onSaveReaction={saveReaction}
                  onOpen={setSelectedGame}
                />
              ))}
            </ol>
          ) : <p className="rank-empty">Search above to rank a game and start your list.</p>}
        </>
      ) : null}

      {section === 'compare' ? (
        <div className="rank-compare">
          {laneFocus ? (
            <div className="rank-lane-intro" style={{ margin: '0 0 var(--space-3)' }}>
              <p style={{ fontWeight: 700, margin: '0 0 4px' }}>
                Tuning your {laneLabel || laneFocus} taste
              </p>
              {anchorGame ? (
                <p style={{ color: 'var(--muted)', fontSize: 'var(--t-foot)', margin: '0 0 var(--space-2)' }}>
                  Anchored on {anchorGame.title}
                </p>
              ) : null}
              <button
                type="button"
                className="rank-skip"
                onClick={() => setLaneFocus(null)}
              >
                Back to standard Compare
              </button>
            </div>
          ) : null}
          <p style={{ color: 'var(--muted)', fontSize: 'var(--t-cap)', margin: '0 0 var(--space-3)' }}>
            {sessionDuels} {sessionDuels === 1 ? 'duel' : 'duels'} this session · {totalComparisons} total comparisons
          </p>
          {receipt ? (
            <div className="rank-receipt" aria-live="polite">
              <strong>{receipt.headline}</strong>
              <span>{receipt.detail}</span>
              {receipt.laneLabels.length ? (
                <span>This feeds your {receipt.laneLabels.join(' and ')} taste.</span>
              ) : null}
            </div>
          ) : null}
          {leftGame && rightGame && pair ? (
            <>
              <p>Which game belongs higher in your ranking?</p>
              <div className="rank-duel">
                <CompareCard game={leftGame} score={pair.left.score} disabled={busy} onPick={() => compare('left')} />
                <span className="rank-vs">or</span>
                <CompareCard game={rightGame} score={pair.right.score} disabled={busy} onPick={() => compare('right')} />
              </div>
              <button type="button" className="rank-skip" disabled={busy} onClick={() => compare('skip')}>Too different</button>
              <small>Skipped pairs stay out of rotation for 90 days.</small>
            </>
          ) : (
            <p className="rank-empty">Rank at least two games, or come back after a skipped pair leaves rotation.</p>
          )}
        </div>
      ) : null}

      <RankGameSheet
        open={Boolean(rankTarget)}
        game={rankTarget}
        ranks={ranked.map((item) => item.rank)}
        gameById={gameById}
        onClose={() => setRankTarget(null)}
        onSaved={() => refresh(true)}
      />
      {selectedGame ? <GameDetail game={selectedGame} onClose={() => setSelectedGame(null)} /> : null}
    </section>
  )
}
