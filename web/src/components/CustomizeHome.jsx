import CustomizeList from './CustomizeList.jsx'
import { CARD_BY_KEY, getHomeCards, setHomeCards, resetHomeCards } from '../lib/homeCards.js'

// Home's card editor. Third caller of the same component, after Discover's rows
// and Insights' cards. No groupLabel: seven cards in one list do not need
// headings, and the tile-versus-full distinction is visible on the page itself.
export default function CustomizeHome({ open, onClose }) {
  return (
    <CustomizeList
      open={open}
      onClose={onClose}
      title="Customize cards"
      note="Drag the handle to reorder. Toggle a card off to hide it from Home."
      byKey={CARD_BY_KEY}
      getConfig={getHomeCards}
      setConfig={setHomeCards}
      resetConfig={resetHomeCards}
    />
  )
}
