import { toggleWishlist } from '../lib/wishlist.js'

// Small overlay heart for posters/cards. Rendered as a sibling of the card
// button (never nested inside it) and stops propagation so a tap saves the
// game without opening its detail sheet.
export default function WishHeart({ game, active, className = '' }) {
  return (
    <button
      type="button"
      className={`wish-heart${active ? ' on' : ''} ${className}`.trim()}
      aria-label={active ? 'Remove from wishlist' : 'Add to wishlist'}
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        toggleWishlist(game)
      }}
    >
      <svg viewBox="0 0 24 24" width="15" height="15" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 21s-7-4.5-9.5-8.5A5 5 0 0 1 12 6a5 5 0 0 1 9.5 6.5C19 16.5 12 21 12 21z" />
      </svg>
    </button>
  )
}
