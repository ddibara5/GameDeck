import { useEffect, useMemo, useState } from 'react'
import Cover from './Cover.jsx'
import GameDetail from './GameDetail.jsx'
import RankGameSheet from './RankGameSheet.jsx'
import { libraryCover } from '../lib/format.js'
import { useLibraryGames } from '../lib/useLibraryGames.js'
import { explicitStatus, useStatusMap } from '../lib/userStatus.js'
import {
  RANK_REACTION_LABELS,
  RANK_SKIP_CUTOFF_MS,
  chooseAnchoredRankingPair,
  chooseRankingPair,
  getRankingStateCache,
  isRankingEligible,
  loadRankingState,
  recordComparison,
  tierForPosition,
} from '../lib/ranking.js'
import { publishLaneDuelReceipt, shouldReturnFromLaneDuel } from '../lib/laneDuel.js'
import { formatLaneLabel } from '../lib/forYouEngine.js'
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

function RankedRow({ game, rank, position, total, onEdit, onOpen }) {
  const comparisons = Number(rank.comparison_count) || 0
  const tier = tierForPosition(position - 1, total)

  return (
    <li className="rank-item">
      <div className="rank-row">
        <button
          type="button"
          className="rank-row-open"
          onClick={() => onOpen(game)}
          aria-label={'Open ' + game.title + ', ranked ' + position}
        >
          <span className="rank-place" aria-hidden="true">{position}</span>
          <Cover src={libraryCover(game)} title={game.title} />
          <span className="rank-row-copy">
            <strong>{game.title}</strong>
            <span className="rank-row-meta">
              <span className="rank-summary">
                {reactionDisplay(rank.reaction)} · {formatScore(rank.score)} score · {comparisons} {comparisons === 1 ? 'comparison' : 'comparisons'}
              </span>
            </span>
          </span>
        </button>

        <button
          type="button"
          className="rank-edit"
          onClick={() => onEdit(game, rank)}
          aria-label={'Edit ranking for ' + game.title + ', tier ' + tier}
        >
          <span className={'rank-tier tier-' + tier.toLowerCase()}>{tier}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </button>
      </div>
    </li>
  )
}

function CompareCard({ game, score, onPick, disabled }) {
  return (
    <button
      type="button"
      className="rank-duel-card"
      onClick={onPick}
      disabled={disabled}
      aria-label={'Rank ' + game.title + ' higher'}
    >
      <Cover src={libraryCover(game)} title={game.title} size="lg" />
      <strong>{game.title}</strong>
      <span className="rank-duel-score">{formatScore(score)} score</span>
      <span className="rank-duel-pick" aria-hidden="true">Rank higher</span>
    </button>
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

  if (loading || gamesLoading) return <div className="rank-page"><p className="rank-state" aria-live="polite">Building your ranking…</p></div>

  const leftGame = pair ? gameById.get(String(pair.left.master_id)) : null
  const rightGame = pair ? gameById.get(String(pair.right.master_id)) : null
  const anchorGame = laneFocus && laneAnchorId != null ? gameById.get(String(laneAnchorId)) : null
  const totalComparisons = (state.comparisons || []).length

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
              className="rank-search-input"
              value={rankQuery}
              placeholder="Search your library to rank"
              aria-label="Search your library to rank"
              aria-expanded={searchOpen}
              aria-controls={searchOpen ? 'rank-search-results' : undefined}
              aria-autocomplete="list"
              autoComplete="off"
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setSearchOpen(false)
                  event.currentTarget.blur()
                }
              }}
              onChange={(event) => {
                setRankQuery(event.target.value)
                setSearchOpen(true)
              }}
            />
            {searchOpen ? (
              <div id="rank-search-results" className="rank-search-results" role="listbox" aria-label="Library games">
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
                        setRankTarget({ game, rank: null })
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
      {notice ? <p className="rank-notice" role="status">{notice}</p> : null}

      {section === 'ranking' ? (
        <>
          <p className="rank-count">
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
                  total={ranked.length}
                  onEdit={(targetGame, targetRank) => setRankTarget({ game: targetGame, rank: targetRank })}
                  onOpen={setSelectedGame}
                />
              ))}
            </ol>
          ) : <p className="rank-state rank-state--empty">Search above to rank a game and start your list.</p>}
        </>
      ) : null}

      {section === 'compare' ? (
        <div className="rank-compare">
          {laneFocus ? (
            <div className="rank-lane-intro">
              <div>
                <strong>Tuning your {laneLabel || formatLaneLabel(laneFocus) || laneFocus} taste</strong>
                {anchorGame ? <span>Anchored on {anchorGame.title}</span> : null}
              </div>
              <button type="button" className="rank-lane-reset" onClick={() => setLaneFocus(null)}>
                Standard compare
              </button>
            </div>
          ) : null}

          <p className="rank-compare-meta">
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
              <div className="rank-compare-copy">
                <strong>Which game belongs higher?</strong>
                <span>Tap the game you would rank above the other.</span>
              </div>
              <div className="rank-duel" key={String(pair.left.master_id) + '-' + String(pair.right.master_id) + '-' + sessionDuels}>
                <CompareCard game={leftGame} score={pair.left.score} disabled={busy} onPick={() => compare('left')} />
                <CompareCard game={rightGame} score={pair.right.score} disabled={busy} onPick={() => compare('right')} />
              </div>
              <button type="button" className="rank-skip" disabled={busy} onClick={() => compare('skip')}>Too different</button>
              <p className="rank-skip-note">Skipped pairs stay out of rotation for 90 days.</p>
            </>
          ) : (
            <p className="rank-state rank-state--empty">No comparison is ready. Rank at least two eligible games, or try again after a skipped pair expires.</p>
          )}
        </div>
      ) : null}

      <RankGameSheet
        open={Boolean(rankTarget)}
        game={rankTarget?.game || null}
        ranks={ranked.map((item) => item.rank)}
        gameById={gameById}
        existingRank={rankTarget?.rank || null}
        onClose={() => setRankTarget(null)}
        onSaved={() => refresh(true)}
      />
      {selectedGame ? <GameDetail game={selectedGame} onClose={() => setSelectedGame(null)} /> : null}
    </section>
  )
}
