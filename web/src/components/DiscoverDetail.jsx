import GameSheet from './GameSheet.jsx'

// Discover detail: an IGDB game (not owned). Thin wrapper over the shared
// GameSheet; the game object already carries its summary/screenshots/etc.
export default function DiscoverDetail({ game, inLibrary, onAsk, onMoreLikeThis, onClose }) {
  return (
    <GameSheet
      variant="discover"
      game={game}
      inLibrary={inLibrary}
      onAsk={onAsk}
      onMoreLikeThis={onMoreLikeThis}
      onClose={onClose}
    />
  )
}
