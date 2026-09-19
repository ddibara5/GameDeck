import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  RANK_REACTIONS,
  RANK_REACTION_LABELS,
  loadGameRank,
  setRankReaction,
} from '../lib/ranking.js'
import { useMountTransition } from '../lib/useMountTransition.js'
import { lockScroll } from '../lib/scrollLock.js'
import { useDialogA11y } from '../lib/useDialogA11y.js'
import './gameRating.css'

// Port of the Expo pilot's GameRating (Sept 10 commit, "Improve recommendations
// and streamline GameDeck navigation and filters").
//
// A "Rate / edit game" action that lazily reads the saved rank reaction only
// when the editor opens (game details stay fast and an existing rating is never
// overwritten by a guessed default), then opens a sheet to pick a reaction and
// save it with a read-back confirmation.
//
// Pilot note: game-rating.tsx imports `loadRankReaction` from
// `@/lib/ranking-actions`, but that export does not exist in the pilot (the
// import is dangling). The read path here is implemented on the PWA's existing
// `loadGameRank`, which returns the cached `game_ranks` row (reaction included)
// and re-fetches after `setRankReaction` invalidates it.
function labelOf(reaction) {
  return RANK_REACTION_LABELS[reaction] || String(reaction || '').replaceAll('_', ' ')
}

function RatingSheet({ open, masterId, title, onClose }) {
  const { mounted, closing } = useMountTransition(open)
  const dialogRef = useDialogA11y({ active: mounted, closeOnEscape: false })
  const [reaction, setReaction] = useState(null)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [notice, setNotice] = useState('')
  const mutation = useRef(false)

  // Fetch the current reaction only when the editor opens.
  useEffect(() => {
    if (!open) return
    let alive = true
    setReaction(null)
    setReady(false)
    setBusy(true)
    setNotice('')
    mutation.current = true
    loadGameRank(masterId)
      .then((row) => {
        if (!alive) return
        setReaction(row?.reaction || null)
        setReady(true)
      })
      .catch(() => {
        if (alive) setNotice('Your rating couldn\u2019t be checked. Try again before editing.')
      })
      .finally(() => {
        mutation.current = false
        if (alive) setBusy(false)
      })
    return () => {
      alive = false
    }
  }, [open, masterId])

  // Lock background scroll while the sheet is up.
  useEffect(() => {
    if (!mounted) return undefined
    return lockScroll()
  }, [mounted])

  // Escape closes unless a save is in flight.
  useEffect(() => {
    if (!mounted) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mounted, busy, onClose])

  if (!mounted) return null

  async function save() {
    if (!reaction || !ready || busy || mutation.current) return
    mutation.current = true
    setBusy(true)
    setNotice('')
    try {
      await setRankReaction(masterId, reaction)
      const current = await loadGameRank(masterId)
      if (current?.reaction !== reaction) throw new Error('Rating not confirmed')
      onClose(`Your rating: ${labelOf(reaction)}. Saved.`)
    } catch {
      setReady(false)
      setNotice('Couldn\u2019t confirm your rating. Check the saved rating before trying again.')
    } finally {
      mutation.current = false
      setBusy(false)
    }
  }

  function retry() {
    if (mutation.current) return
    mutation.current = true
    setBusy(true)
    setNotice('')
    loadGameRank(masterId)
      .then((row) => {
        setReaction(row?.reaction || null)
        setReady(true)
      })
      .catch(() => {
        setNotice('Your rating couldn\u2019t be checked. Try again before editing.')
      })
      .finally(() => {
        mutation.current = false
        setBusy(false)
      })
  }

  return createPortal(
    <div
      className={`gr-backdrop${closing ? ' closing' : ''}`}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div ref={dialogRef} className="gr-sheet" role="dialog" aria-modal="true" aria-label="Your rating">
        <div className="gr-handle" aria-hidden="true" />
        <div className="gr-head">
          <h2>Your rating</h2>
          <button type="button" className="gr-done" disabled={busy} onClick={() => onClose()}>
            Done
          </button>
        </div>
        <div className="gr-body">
          <p className="gr-title">{title}</p>
          <p className="gr-lede">
            How did you like it? Your rating shapes Rankings and future recommendations.
          </p>
          {busy ? <p className="gr-loading" aria-live="polite">Checking\u2026</p> : null}
          <div className="gr-options" role="group" aria-label={`Your rating for ${title}`}>
            {RANK_REACTIONS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={reaction === value}
                className={`gr-option${reaction === value ? ' active' : ''}`}
                disabled={busy || !ready}
                onClick={() => setReaction(value)}
              >
                <span aria-hidden="true">{reaction === value ? '\u2713 ' : ''}</span>
                {labelOf(value)}
              </button>
            ))}
          </div>
          {notice ? <p className="gr-error" role="alert">{notice}</p> : null}
          {!ready && !busy ? (
            <button type="button" className="gr-primary" onClick={retry}>
              Check saved rating
            </button>
          ) : (
            <button
              type="button"
              className="gr-primary"
              disabled={!reaction || !ready || busy}
              onClick={save}
            >
              {busy ? 'Saving\u2026' : 'Save rating'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// Inline "Rate / edit game" action. Mounts the rating sheet on demand; the
// saved-rating notice survives under the button after a successful save.
export default function GameRating({ masterId, title }) {
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState('')

  function handleClose(savedNotice) {
    setOpen(false)
    if (savedNotice) setNotice(savedNotice)
  }

  return (
    <>
      <button
        type="button"
        className="gr-action"
        onClick={() => {
          setNotice('')
          setOpen(true)
        }}
      >
        Rate / edit game
      </button>
      {!open && notice ? (
        <p className="gr-status" role="status" aria-live="polite">{notice}</p>
      ) : null}
      {open ? (
        <RatingSheet
          open={open}
          masterId={masterId}
          title={title}
          onClose={handleClose}
        />
      ) : null}
    </>
  )
}
