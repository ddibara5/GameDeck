import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Cover from './Cover.jsx'
import { libraryCover } from '../lib/format.js'
import {
  REACTIONS,
  closestRankNeighbor,
  estimateRankPlacement,
  recordComparison,
  seedForReaction,
  setRankReaction,
} from '../lib/ranking.js'
import { useMountTransition } from '../lib/useMountTransition.js'
import { lockScroll } from '../lib/scrollLock.js'
import './rankings.css'

export default function RankGameSheet({ open, game, ranks, gameById, onClose, onSaved }) {
  const { mounted, closing } = useMountTransition(open)
  const [displayGame, setDisplayGame] = useState(game)
  const [reaction, setReaction] = useState(null)
  const [phase, setPhase] = useState('reaction')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !game) return
    setDisplayGame(game)
    setReaction(null)
    setPhase('reaction')
    setBusy(false)
    setError('')
  }, [open, game])

  useEffect(() => {
    if (!mounted) return undefined
    return lockScroll()
  }, [mounted])

  useEffect(() => {
    if (!mounted) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mounted, busy, onClose])

  const score = reaction ? seedForReaction(reaction) : null
  const placement = useMemo(
    () => (score == null ? null : estimateRankPlacement(ranks, score, displayGame?.master_id)),
    [ranks, score, displayGame?.master_id],
  )
  const neighborRank = useMemo(
    () => (score == null ? null : closestRankNeighbor(ranks, score, displayGame?.master_id)),
    [ranks, score, displayGame?.master_id],
  )
  const neighborGame = neighborRank ? gameById.get(String(neighborRank.master_id)) : null

  if (!mounted || !displayGame) return null

  async function saveReaction() {
    if (!reaction || busy) return
    setBusy(true)
    setError('')
    try {
      await setRankReaction(displayGame.master_id, reaction)
      if (onSaved) await onSaved()
      if (neighborGame) setPhase('compare')
      else onClose()
    } catch (err) {
      setError(err.message || 'Could not save that ranking.')
    } finally {
      setBusy(false)
    }
  }

  async function refine(result) {
    if (!neighborGame || busy) return
    setBusy(true)
    setError('')
    try {
      await recordComparison(displayGame.master_id, neighborGame.master_id, result)
      if (onSaved) await onSaved()
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save that comparison.')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div
      className={`modal-backdrop${closing ? ' closing' : ''}`}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div className="modal-sheet rank-game-sheet" role="dialog" aria-modal="true" aria-label={`Rank ${displayGame.title}`}>
        <div className="modal-handle" />
        <Cover src={libraryCover(displayGame)} title={displayGame.title} size="lg" className="rank-sheet-cover" />

        {phase === 'reaction' ? (
          <>
            <h2>Rank {displayGame.title}</h2>
            <p className="rank-sheet-intro">Choose your reaction to give it a starting score.</p>

            <section className="rank-sheet-card">
              <h3>Your reaction</h3>
              <p>This uses the scoring system you already know.</p>
              <div className="rank-sheet-reactions" role="group" aria-label={`Your reaction to ${displayGame.title}`}>
                {REACTIONS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    aria-pressed={reaction === item.key}
                    className={reaction === item.key ? 'active' : ''}
                    disabled={busy}
                    onClick={() => setReaction(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="rank-sheet-preview" aria-live="polite">
                <span>Starting score <strong>{score == null ? '—' : score}</strong></span>
                <span>Estimated tier <strong>{placement?.tier || '—'}</strong></span>
              </div>

              <button type="button" className="rank-sheet-save" disabled={!reaction || busy} onClick={saveReaction}>
                {busy ? 'Saving…' : 'Save to My Ranking'}
              </button>
              <small>Optional: fine-tune its position with one close comparison next.</small>
            </section>
          </>
        ) : (
          <section className="rank-sheet-compare">
            <h2>Want more precision?</h2>
            <p>Which game belongs higher? This one comparison is optional.</p>
            <div className="rank-sheet-duel">
              <button type="button" disabled={busy} onClick={() => refine('left')}>
                <Cover src={libraryCover(displayGame)} title={displayGame.title} />
                <strong>{displayGame.title}</strong>
              </button>
              <span>or</span>
              <button type="button" disabled={busy} onClick={() => refine('right')}>
                <Cover src={libraryCover(neighborGame)} title={neighborGame.title} />
                <strong>{neighborGame.title}</strong>
              </button>
            </div>
            <button type="button" className="rank-sheet-later" disabled={busy} onClick={onClose}>Maybe later</button>
          </section>
        )}

        {error ? <p className="rank-error" role="alert">{error}</p> : null}
      </div>
    </div>,
    document.body,
  )
}
