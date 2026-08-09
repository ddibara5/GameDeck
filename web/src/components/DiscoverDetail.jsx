import { useEffect, useRef, useState } from 'react'
import Cover from './Cover.jsx'

// Detail sheet for a Discover (IGDB) game. Reuses the Library modal-sheet shell
// so the swipe-to-close behaviour and styling match. Adds two actions:
//   - "Ask AI about this"  -> hands a seed prompt back up to Discover's Ask tab
//   - "More like this"     -> re-queries Browse by this game's primary genre
export default function DiscoverDetail({ game, inLibrary, onAsk, onMoreLikeThis, onClose }) {
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
    if (shouldClose) onClose()
    else setDragY(0)
  }

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  if (!game) return null

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose()
  }

  const meta = []
  if (game.year) meta.push(String(game.year))
  if (game.rating) meta.push(`★ ${game.rating}`)
  if (game.ratingCount) meta.push(`${game.ratingCount} ratings`)

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div
        className="modal-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={game.name}
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: drag.current.active ? 'none' : 'transform 0.25s ease',
        }}
      >
        <div
          className="sheet-drag-zone"
          onTouchStart={onDragStart}
          onTouchMove={onDragMove}
          onTouchEnd={onDragEnd}
        >
          <div className="modal-handle" />
          <Cover src={game.cover} title={game.name} size="lg" />
        </div>

        <div className="detail-title">{game.name}</div>
        {meta.length ? <div className="discover-detail-meta">{meta.join('  ·  ')}</div> : null}
        {inLibrary ? <span className="in-library-badge sheet">In your library</span> : null}

        <div className="discover-actions">
          <button type="button" className="discover-action primary" onClick={() => onAsk(game)}>
            Ask AI about this
          </button>
          <button type="button" className="discover-action" onClick={() => onMoreLikeThis(game)}>
            More like this
          </button>
        </div>

        {game.genres && game.genres.length ? (
          <div className="chip-wrap">
            {game.genres.map((g) => (
              <span className="meta-chip" key={g}>
                {g}
              </span>
            ))}
          </div>
        ) : null}

        {game.summary ? <p className="discover-summary">{game.summary}</p> : null}

        {game.screenshots && game.screenshots.length ? (
          <div className="shot-strip">
            {game.screenshots.map((s, i) => (
              <img className="shot" src={s} alt={`${game.name} screenshot ${i + 1}`} key={i} loading="lazy" />
            ))}
          </div>
        ) : null}

        {game.platforms && game.platforms.length ? (
          <div className="detail-row">
            <span className="detail-label">Platforms</span>
            <span className="detail-value">{game.platforms.join(', ')}</span>
          </div>
        ) : null}
        {game.companies && game.companies.length ? (
          <div className="detail-row">
            <span className="detail-label">Studio</span>
            <span className="detail-value">
              {game.companies
                .filter((c) => c.developer)
                .map((c) => c.name)
                .slice(0, 2)
                .join(', ') || game.companies[0].name}
            </span>
          </div>
        ) : null}

        {game.url ? (
          <a className="detail-link" href={game.url} target="_blank" rel="noreferrer noopener">
            View on IGDB
          </a>
        ) : null}
      </div>
    </div>
  )
}
