import CustomizeList from './CustomizeList.jsx'
import { CARD_BY_KEY, GROUP_LABEL, getCardsConfig, setCardsConfig, resetCardsConfig } from '../lib/insightsCards.js'

// Insights' card editor. Same component as Discover's, one catalog different.
// It passes the group label so the editor states the page's recent-play scope.
export default function CustomizeCards({ open, onClose }) {
  return (
    <CustomizeList
      open={open}
      onClose={onClose}
      title="Customize cards"
      note="Drag the handle to reorder. Toggle a card off to hide it from Insights."
      byKey={CARD_BY_KEY}
      groupLabel={GROUP_LABEL}
      getConfig={getCardsConfig}
      setConfig={setCardsConfig}
      resetConfig={resetCardsConfig}
    />
  )
}
