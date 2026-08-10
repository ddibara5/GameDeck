import GameSheet from './GameSheet.jsx'

// Library / list detail: an owned game. Thin wrapper over the shared GameSheet so
// Library, Discover, and Wishlist all render the same sheet.
export default function GameDetail({ game, onClose }) {
  return <GameSheet variant="owned" game={game} onClose={onClose} />
}
