import { useEffect, useRef, useState } from 'react'
import Cover from './Cover.jsx'
import { useDelayedClose } from '../lib/useDelayedClose.js'
import { platformMeta, formatDate, minutesToHhm, igdbCover } from '../lib/format.js'
import { STATUSES, STATUS_LABELS, effectiveStatus, setStatus } from '../lib/userStatus.js'

export default function GameDetail({ game, onClose }) {
  const { closing, requestClose } = useDelayedClose(onClose)
  const [status, setStatusState] = useState('backlog')

  // Swipe-down-to-close, only from the cover/handle zone so the details below still scroll.
  const drag = useRef({ startY: 0, active: false })
  const [dragY, setDragY] = useState(0)
  function onDragStart(e) {
    drag.current = { startY: e.touches[0].clientY, active: true }
  }
  function onDragMove(e) {
    if (!drag.current.active) return
    const dy = e.touches[0].clientY - drag.current.startY
    if (dy > 0) {
      setDragY(dy)
      if (e.cancelable) e.preventDefault()
    } else {
      setDragY(0)
    }
  }
  function onDragEnd() {
    const shouldClose = dragY > 110
    drag.current.active = false
    if (shouldClose) requestClose()
    else setDragY(0)
  }

  // Lock background scroll while the sheet is open so touch scrolling stays inside the sheet.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Reflect the current (override or derived) status whenever the game changes.
  useEffect(() => {
    if (game) setStatusState(effectiveStatus(game))
  }, [game])

  if (!game) return null

  const { label, color } = platformMeta(game.environment)
  const percent = Math.round(Number(game.percent) || 0)
  const playtime = game.playtime_label || minutesToHhm(game.playtime_minutes)
  // Genre / release / length come straight from the database (filled by the IGDB
  // sync). No AI call is made when a card is opened -- Claude only runs in Discover.
  const len = Number(game.length_minutes) || 0
  const storyPct =
    len > 0 ? Math.max(0, Math.min(100, Math.round(((game.playtime_minutes || 0) / len) * 100))) : null

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) requestClose()
  }

  return (
    <div className={`modal-backdrop${closing ? ' closing' : ''}`} onClick={handleBackdropClick}>
      <div
        className="modal-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={game.title}
        style={{
          transform: closing ? 'translateY(110%)' : dragY ? `translateY(${dragY}px)` : undefined,
          transition: drag.current.active ? 'none' : 'transform 0.2s ease',
        }}
      >
        <div
          className="sheet-drag-zone"
          onTouchStart={onDragStart}
          onTouchMove={onDragMove}
          onTouchEnd={onDragEnd}
        >
          <div className="modal-handle" />
          <Cover
            src={
              game.cover_igdb
                ? igdbCover(game.cover_igdb, 't_720p')
                : game.cover_tile || game.cover_standard || game.cover_small
            }
            title={game.title}
            size="lg"
          />
        </div>

        <div className="detail-title">{game.title}</div>
        <div className="platform-row">
          <span className="platform-dot" style={{ background: color }} />
          <span>{label}</span>
        </div>

        <div className="status-picker" role="group" aria-label="Your status for this game">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={`status-btn${status === s ? ' active' : ''}`}
              onClick={() => {
                setStatus(game.master_id, s)
                setStatusState(s)
              }}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        {storyPct != null ? (
          <div className="detail-percent">
            {storyPct}%<span className="detail-percent-label">of story</span>
          </div>
        ) : (
          <div className="detail-percent">
            {percent}%<span className="detail-percent-label">achievements</span>
          </div>
        )}

        {storyPct != null ? (
          <div className="detail-row">
            <span className="detail-label">Story progress</span>
            <span className="detail-value">
              {storyPct}% · {minutesToHhm(game.playtime_minutes)} of ~{Math.round(len / 60)}h
            </span>
          </div>
        ) : null}
        <div className="detail-row">
          <span className="detail-label">Achievements</span>
          <span className="detail-value">
            {game.earned_awards ?? 0} / {game.total_awards ?? 0}
          </span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Playtime</span>
          <span className="detail-value">{playtime}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Last played</span>
          <span className="detail-value">{formatDate(game.last_played)}</span>
        </div>
        {game.genre ? (
          <div className="detail-row">
            <span className="detail-label">Genre</span>
            <span className="detail-value">{game.genre}</span>
          </div>
        ) : null}
        {game.release_year ? (
          <div className="detail-row">
            <span className="detail-label">Released</span>
            <span className="detail-value">{game.release_year}</span>
          </div>
        ) : null}
        {len > 0 ? (
          <div className="detail-row">
            <span className="detail-label">Story length</span>
            <span className="detail-value">~{Math.round(len / 60)}h</span>
          </div>
        ) : null}

        {game.achievements_url ? (
          <a
            className="detail-link"
            href={game.achievements_url}
            target="_blank"
            rel="noreferrer noopener"
          >
            View achievements
          </a>
        ) : null}
      </div>
    </div>
  )
}
