import { useCallback, useEffect, useState } from 'react'
import { bustTasteProfile, loadTasteProfile } from '../lib/tasteProfile.js'
import './tasteProfile.css'

const RANKING_EVENT = 'gd-ranking-change'
const WISHLIST_EVENT = 'gd-wishlist-change'

function countLabel(value, singular, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`
}

function reactionLabel(reaction) {
  if (reaction === 'loved') return 'Loved'
  if (reaction === 'liked') return 'Liked'
  if (reaction === 'mixed') return 'Mixed'
  if (reaction === 'not_for_me') return 'Not for me'
  return null
}

function duelLabel(duel) {
  if (!duel || !duel.decidedComparisons) return 'No duels yet'
  const record = `${duel.wins}-${duel.losses}`
  return duel.uniqueOpponentsDefeated
    ? `${record}, above ${countLabel(duel.uniqueOpponentsDefeated, 'opponent')}`
    : record
}

// The visible taste profile: weighted lanes with their supporting games,
// top Elo leaders with duel records, and the coverage behind it all. This is
// the same profile object the For You engine and Ask GameDeck use, so what
// Dave reads here is what the recommendations cite.
export default function TasteProfile() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const next = await loadTasteProfile({ force })
      setProfile(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your taste profile could not be loaded.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    loadTasteProfile()
      .then((next) => alive && setProfile(next))
      .catch((err) => alive && setError(err instanceof Error ? err.message : 'Your taste profile could not be loaded.'))
      .finally(() => alive && setLoading(false))
    const onTasteChange = () => {
      // Duels, reactions and wishlist changes land here first, so the
      // surface a duel just fed stays honest.
      bustTasteProfile()
      if (alive) load(true)
    }
    window.addEventListener(RANKING_EVENT, onTasteChange)
    window.addEventListener(WISHLIST_EVENT, onTasteChange)
    return () => {
      alive = false
      window.removeEventListener(RANKING_EVENT, onTasteChange)
      window.removeEventListener(WISHLIST_EVENT, onTasteChange)
    }
  }, [load])

  if (loading) {
    return (
      <div className="taste-profile" aria-label="Taste profile">
        <p className="taste-profile-empty">Reading your taste profile…</p>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="taste-profile" aria-label="Taste profile">
        <p className="taste-profile-empty">{error || 'Your taste profile could not be loaded.'}</p>
        <button type="button" className="taste-profile-retry" onClick={() => load(true)}>
          Try again
        </button>
      </div>
    )
  }

  const lanes = profile.lanes || []
  const sources = profile.sources || []
  const leaders = profile.leaders || []
  const reactions = profile.reactions || {}
  const rated = (reactions.loved || 0) + (reactions.liked || 0)
  const comparisons = profile.comparisons || {}
  const maxStrength = Math.max(1, ...lanes.map((lane) => lane.strength || 0))

  const supportingGames = (lane) =>
    sources
      .filter(
        (source) =>
          (source.laneKeys || []).includes(lane.key) &&
          source.masterId !== lane.exemplar?.masterId,
      )
      .slice(0, 4)

  return (
    <div className="taste-profile" aria-label="Taste profile">
      <p className="taste-profile-summary">
        {lanes.length ? `${countLabel(lanes.length, 'taste lane')} · ` : ''}
        {rated ? `${countLabel(rated, 'rated game')} · ` : ''}
        {comparisons.decidedComparisons
          ? `${countLabel(comparisons.decidedComparisons, 'duel')} · `
          : ''}
        drawn from your ratings, play history, and ranking duels.
        {profile.coverage && !profile.coverage.complete
          ? ' Some history is still loading, so treat the weaker lanes as early reads.'
          : ''}
      </p>

      {lanes.length ? (
        <section aria-label="Taste lanes">
          <h3 className="taste-profile-group-title">What you lean toward</h3>
          <p className="taste-profile-note">
            Bars are relative to your strongest lane, not a prediction percentage.
          </p>
          <div className="taste-profile-card">
            {lanes.map((lane, index) => {
              const exemplar = lane.exemplar || null
              const supporting = supportingGames(lane)
              const reaction = reactionLabel(exemplar?.reaction)
              return (
                <div key={lane.key} className={`taste-profile-lane${index === lanes.length - 1 ? ' last' : ''}`}>
                  <div className="taste-profile-lane-head">
                    <span className="taste-profile-lane-label">{lane.label}</span>
                    <span className="taste-profile-chip">{lane.evidenceLabel}</span>
                  </div>
                  <div
                    className="taste-profile-bar"
                    role="img"
                    aria-label={`${lane.label} strength ${Math.round(((lane.strength || 0) / maxStrength) * 100)} percent of your strongest lane`}
                  >
                    <span style={{ width: `${Math.max(4, ((lane.strength || 0) / maxStrength) * 100)}%` }} />
                  </div>
                  <p className="taste-profile-lane-evidence">
                    {lane.positiveSourceCount > 0
                      ? `Based on ${countLabel(lane.positiveSourceCount, 'positively rated game')}`
                      : `Supported by play history from ${countLabel(lane.supportingGameCount, 'game')}`}
                    {lane.uniqueMatchups > 0
                      ? ` and ${countLabel(lane.uniqueMatchups, 'unique duel matchup')}`
                      : ''}
                    {exemplar ? `, including ${exemplar.title}` : ''}.
                  </p>
                  {exemplar ? (
                    <p className="taste-profile-lane-detail">
                      {exemplar.title}
                      {reaction ? ` · ${reaction}` : ' · from play history'} · {duelLabel(exemplar.duel)}
                    </p>
                  ) : null}
                  {supporting.length ? (
                    <p className="taste-profile-lane-detail muted">
                      Also: {supporting.map((game) => game.title).join(', ')}
                    </p>
                  ) : null}
                </div>
              )
            })}
          </div>
        </section>
      ) : (
        <p className="taste-profile-empty">
          Not enough signal yet. Rate a few games in Rankings or run some
          Compare duels and your lanes will show up here.
        </p>
      )}

      {leaders.length ? (
        <section aria-label="Top ranked games">
          <h3 className="taste-profile-group-title">Top of your ranking</h3>
          <div className="taste-profile-card">
            {leaders.map((leader, index) => (
              <div
                key={leader.masterId}
                className={`taste-profile-leader${index === leaders.length - 1 ? ' last' : ''}`}
              >
                <span className="taste-profile-leader-rank">{index + 1}</span>
                <span className="taste-profile-leader-body">
                  <span className="taste-profile-leader-title">{leader.title}</span>
                  <span className="taste-profile-leader-meta">
                    Elo {Math.round(leader.score)}
                    {leader.reaction ? ` · ${reactionLabel(leader.reaction)}` : ''} ·{' '}
                    {duelLabel(leader.duel)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <button
        type="button"
        className="taste-profile-refresh"
        disabled={refreshing}
        onClick={() => load(true)}
      >
        {refreshing ? 'Refreshing…' : 'Refresh profile'}
      </button>
      <p className="taste-profile-note">
        For You reasons and Ask GameDeck cite this same profile, so a duel you
        run in Compare shows up in your next mix.
      </p>
    </div>
  )
}
