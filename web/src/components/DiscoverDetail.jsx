import GameSheet from './LazyGameSheet.jsx'

// Discover detail: an IGDB game (not owned). Thin wrapper over the shared
// GameSheet; the game object already carries its summary/screenshots/etc.
export default function DiscoverDetail({ game, inLibrary, onAsk, onMoreLikeThis, onNotInterested, onClose }) {
  return (
    <GameSheet
      variant="discover"
      game={game}
      inLibrary={inLibrary}
      onAsk={onAsk}
      onMoreLikeThis={onMoreLikeThis}
      onNotInterested={onNotInterested}
      onClose={onClose}
    />
  )
}
