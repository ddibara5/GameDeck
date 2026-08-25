import { useState } from 'react'
import { REACTIONS, setRankReaction } from '../lib/ranking.js'
import './rankings.css'

export default function RankingReaction({ masterId, compact = false, onSaved }) {
  const [saving, setSaving] = useState(null)
  const [error, setError] = useState('')

  const choose = async (reaction) => {
    if (saving) return
    setSaving(reaction)
    setError('')
    try {
      await setRankReaction(masterId, reaction)
      if (onSaved) onSaved(reaction)
    } catch (err) {
      setError(err.message || 'Could not save that reaction.')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className={`rank-reaction${compact ? ' compact' : ''}`}>
      <div className="rank-reaction-label">Your reaction</div>
      <div className="rank-reaction-options" role="group" aria-label="Your reaction to this game">
        {REACTIONS.map((item) => (
          <button key={item.key} type="button" disabled={Boolean(saving)} onClick={() => choose(item.key)}>
            {saving === item.key ? 'Saving…' : item.label}
          </button>
        ))}
      </div>
      {error ? <p className="rank-error" role="alert">{error}</p> : null}
    </div>
  )
}
