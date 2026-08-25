import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDelayedClose } from '../lib/useDelayedClose.js'
import { useSheetDrag } from '../lib/useSheetDrag.js'
import { lockScroll } from '../lib/scrollLock.js'
import {
  dedupeSources,
  cardArtChain,
  coverSrc,
  outletCount,
  OUTLET_CHIP_MIN,
  markRead,
  relTime,
  faviconFor,
} from '../lib/news.js'
import { remoteImg } from '../lib/format.js'
import { addToWishlist } from '../lib/wishlist.js'
import './news.css'

/**
 * The whole story, opened from a row.
 *
 * The row deliberately carries almost nothing - headline, outlet, time, and the
 * one-line reason it is in For you - because a screen that holds one story is
 * not a feed. Everything the row drops is here: the article art, the full
 * summary the digest already wrote, the matched game and every source.
 *
 * On the same sheet plumbing as GameSheet (portal, delayed close, swipe-down),
 * because a second bottom sheet that behaves even slightly differently is worse
 * than no second bottom sheet.
 *
 * Not tinted from its art, unlike the game sheet. That tint is a canvas read,
 * a canvas read needs the pixels same-origin, and /api/tint is deliberately not
 * an open proxy - it takes an IGDB image id and builds the url itself. Article
 * images come from a dozen press hosts, so tinting would mean either opening
 * that route to arbitrary urls or tinting only the minority of stories whose
 * art happens to be an IGDB cover. Neither is worth it, so the sheet keeps the
 * plain surface.
 */
// The band is full sheet width at 196px tall; 800 covers it at 2x on the widest
// phone. The blurred fill behind a cover is scaled 140% and blurred 24px, so it
// has no detail left to resolve and is fetched small on purpose.
const BAND_W = 800
const FILL_W = 200

export default function NewsSheet({ item, rel, onClose, onOpenGame }) {
  const { closing, requestClose } = useDelayedClose(onClose)
  const { dragY, dragging, handlers: dragHandlers } = useSheetDrag(requestClose)
  const [artStep, setArtStep] = useState(0)
  useEffect(() => lockScroll(), [])

  const sources = dedupeSources(item.sources)
  const chain = cardArtChain(item, rel.row?.cover_igdb)
  const art = chain[artStep] || null
  const lead = sources[0] || null
  const fav = lead ? faviconFor(lead.url) : ''
  const when = relTime(item.publishedAt)
  const outlets = outletCount(item.sources)

  const onBackdrop = (e) => {
    if (e.target === e.currentTarget) requestClose()
  }

  return createPortal(
    <div className={`modal-backdrop${closing ? ' closing' : ''}`} onClick={onBackdrop}>
      <div
        className="modal-sheet news-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
        style={{
          transform: closing ? 'translateY(110%)' : dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? 'none' : 'transform var(--d-base) var(--ease-out)',
        }}
      >
        {/* The ART IS PART OF THE DRAG ZONE, exactly as the cover is on the game
            sheet. A sheet you can only dismiss by the 40px grabber reads as
            broken on a phone; the band is 196px of surface that does nothing
            else, so it is the natural place to pull from. Safe to include
            because it holds no controls and nothing scrollable - the zone's
            move handler calls preventDefault, which would eat the sheet's own
            scroll if it covered the body. */}
        <div className="sheet-drag-zone" {...dragHandlers}>
          <div className="modal-handle" />

          {/* A band the text sits BELOW, not a wash it sits on. The game sheet
              spent three commits learning that a layer behind a headline turns
              into an argument about how opaque the veil has to be, and a press
              photo with a face in it wins that argument every time. */}
          {art ? (
            <div className={`ns-band${art.kind === 'cover' ? ' cover' : ''}`}>
              {art.kind === 'cover' ? (
                <img className="ns-band-fill" src={remoteImg(art.src, FILL_W)} alt="" aria-hidden="true" decoding="async" />
              ) : null}
              <img
                key={art.src}
                className="ns-band-img"
                src={remoteImg(art.src, BAND_W)}
                alt=""
                decoding="async"
                onError={() => setArtStep((s) => s + 1)}
              />
            </div>
          ) : null}
        </div>

        <div className="ns-body">
          <div className="news-meta">
            {fav ? <img className="news-meta-fav" src={fav} alt="" width="16" height="16" /> : null}
            {lead ? <span className="news-meta-source">{lead.name}</span> : null}
            {when ? <span className="news-meta-time">{when}</span> : null}
            {outlets >= OUTLET_CHIP_MIN ? <span className="news-heat">{outlets} outlets</span> : null}
          </div>

          <h2 className="ns-title">{item.title}</h2>

          {rel.why ? (
            <div className="news-why">
              <span className="news-why-dot" />
              <span>
                {rel.why}
                {rel.qty ? <span className="news-why-qty"> &middot; {rel.qty}</span> : null}
              </span>
            </div>
          ) : null}

          <p className="ns-sum">{item.summary}</p>

          {item.gameName || rel.row ? (
            <GameRow item={item} rel={rel} onOpen={() => onOpenGame(item, rel)} />
          ) : null}

          {/* Every source, not the two the row used to show. This is the
              place that has room for them. */}
          <div className="news-sources">
            {sources.map((s, i) => (
              <span key={s.url + i}>
                {i > 0 ? <span className="news-source-sep" aria-hidden="true">|</span> : null}
                <a
                  className="news-source-link"
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => markRead(item.primaryUrl)}
                >
                  {sources.length === 1 ? 'Read article →' : `${s.name} →`}
                </a>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function GameRow({ item, rel, onOpen }) {
  const [imgFailed, setImgFailed] = useState(false)
  const owned = rel.status === 'library' || rel.status === 'wishlist'
  // Three sources, narrowest first: the story's own cover, then the matched
  // library row's IGDB id, then whatever art the platform sync stored. Only the
  // first two are IGDB image ids; cover_small is a full platform url and must
  // NOT go through coverSrc, which would mistake its filename for an image id.
  const coverUrl =
    coverSrc(item.gameCover, 't_cover_small') ||
    coverSrc(rel.row?.cover_igdb, 't_cover_small') ||
    rel.row?.cover_small ||
    null
  const initial = (rel.row?.title || item.gameName || '?').trim().charAt(0).toUpperCase()

  // The whole cover-plus-name block is the open target, not just a trailing
  // button, and it works for any matched game rather than only owned ones - a
  // Game Pass match previously had no way to open at all. Opening needs an IGDB
  // id (or a library row); without either the block stays plain text rather
  // than a button that does nothing.
  const canOpen = Boolean(rel.row || item.gameIgdbId)
  const Hit = canOpen ? 'button' : 'span'
  const hitProps = canOpen ? { type: 'button', onClick: onOpen } : {}

  return (
    <div className="news-game">
      <Hit className={`news-game-hit${canOpen ? '' : ' flat'}`} {...hitProps}>
        <span className="news-game-thumb">
          {coverUrl && !imgFailed ? (
            <img src={coverUrl} alt="" loading="lazy" decoding="async" onError={() => setImgFailed(true)} />
          ) : (
            <span aria-hidden="true">{initial}</span>
          )}
        </span>
        <span className="news-game-meta">
          <span className="news-game-name">{rel.row?.title || item.gameName}</span>
          {rel.status ? <StatusPill status={rel.status} /> : null}
        </span>
      </Hit>
      {!owned ? (
        <button
          type="button"
          className="news-game-btn primary"
          onClick={() =>
            addToWishlist({ id: item.gameIgdbId, name: item.gameName, cover: item.gameCover })
          }
        >
          + Wishlist
        </button>
      ) : null}
    </div>
  )
}

function StatusPill({ status }) {
  if (status === 'gamepass') {
    return (
      <span className="news-status gp">
        <span className="news-status-dot" /> On Game Pass
      </span>
    )
  }
  if (status === 'library') {
    return (
      <span className="news-status lib">
        <span className="news-status-dot" /> In your library
      </span>
    )
  }
  if (status === 'wishlist') {
    return (
      <span className="news-status wish">
        <svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11" aria-hidden="true">
          <path d="M12 21s-7.5-4.6-9.7-9C1 9.3 2.4 6.5 5.2 6.1c1.8-.3 3.4.6 4.3 2 .9-1.4 2.5-2.3 4.3-2 2.8.4 4.2 3.2 2.9 5.9C19.5 16.4 12 21 12 21z" />
        </svg>
        Wishlisted
      </span>
    )
  }
  return null
}
