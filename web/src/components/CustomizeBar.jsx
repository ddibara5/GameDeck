import CustomizeList from './CustomizeList.jsx'
import TabBar from './TabBar.jsx'
import { DEST_ICONS } from './destIcons.jsx'
import {
  BAR_BY_KEY,
  MIN_VISIBLE,
  useNavConfig,
  getNavConfig,
  setNavConfig,
  resetNavConfig,
} from '../lib/navConfig.js'

// The bottom bar's editor. Order and membership only; it cannot touch the drawer.
//
// The preview is the real TabBar rendered against the working order, not a
// picture of one, so it cannot drift from what ships. It is here and not in the
// drawer editor because the bar is a SPATIAL thing: five icons across 390px is
// the actual constraint, and reading a vertical list to predict a horizontal
// strip is work the screen can do for you.
//
// These three are module level on purpose. CustomizeList re-syncs from storage
// whenever `getConfig`'s identity changes, so an inline arrow here would re-read
// the saved layout on every parent render.
const getBarConfig = () => {
  const c = getNavConfig()
  // Only the bar's fields are handed over. The drawer's order is not read, not
  // written, and cannot be disturbed by anything this editor does.
  return { order: c.bar, enabled: c.enabled }
}
const setBarConfig = (c) => setNavConfig({ bar: c.order, enabled: c.enabled })
const resetBarConfig = () => {
  const c = resetNavConfig()
  return { order: c.bar, enabled: c.enabled }
}

// Two is the fewest a bar can carry and still be a bar. There is no hard ceiling:
// Ranking is an optional sixth shortcut, and the preview makes the density
// tradeoff visible before the user keeps it.
const lockOff = (key, enabled) => Object.values(enabled).filter(Boolean).length <= MIN_VISIBLE

export default function CustomizeBar({ open, onClose }) {
  const nav = useNavConfig()

  const renderHeader = (order, enabled) => {
    const tabs = order.filter((k) => enabled[k])
    return (
      <div className="cz-prev">
        {/* The preview keeps rendering while the bar is switched off: this is
            where you arrange it for when it comes back. Only the label changes,
            because "on the bar now" would be a claim about the screen. */}
        <div className="cz-prev-l">{nav.barShown ? 'On the bar now' : 'The bar, currently hidden'}</div>
        <div className="cz-prev-bar">
          <TabBar tabs={tabs} active={tabs[0]} onChange={() => {}} showLabels={nav.labels} />
        </div>
      </div>
    )
  }

  return (
    <CustomizeList
      open={open}
      onClose={onClose}
      title="Bottom bar"
      note="Drag the handle to reorder. The first one is where the app opens."
      byKey={BAR_BY_KEY}
      icons={DEST_ICONS}
      getConfig={getBarConfig}
      setConfig={setBarConfig}
      resetConfig={resetBarConfig}
      lockOff={lockOff}
      renderHeader={renderHeader}
      footer={
        // Labels are a property of the bar, so the switch lives in the bar's
        // editor rather than on a settings page one level up.
        <div className="cz-group">
          <div className="cz-row">
            <span className="cz-rl">
              <b>Show labels</b>
              <small>Text under each icon</small>
            </span>
            <button
              type="button"
              className={`cz-toggle${nav.labels ? ' on' : ''}`}
              role="switch"
              aria-checked={nav.labels}
              aria-label="Show tab labels"
              onClick={() => setNavConfig({ labels: !nav.labels })}
            >
              <i />
            </button>
          </div>
        </div>
      }
    />
  )
}
