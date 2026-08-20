import { useEffect, useState } from 'react'
import CustomizeList from './CustomizeList.jsx'
import { DEST_ICONS } from './destIcons.jsx'
import {
  DEST_BY_KEY,
  GROUP_LABEL,
  MIN_VISIBLE,
  BAR_COMFORTABLE,
  isTab,
  getNavConfig,
  setNavConfig,
  resetNavConfig,
} from '../lib/navConfig.js'

// The drawer's editor, opened from the button at the bottom of the drawer.
//
// This was 271 lines of its own drag maths, pointer handling and scroll lock,
// all of which CustomizeList already had. It is now a wrapper: one order drives
// the drawer and the bar, so reordering here does both, and the switch means one
// thing only, "put this on the bottom bar".
//
// Rows that can never sit in the bar (Wishlist, the shelves, Settings) carry a
// `fixed` label in the catalog and render that word instead of a switch.

// Labels live outside the order/enabled pair CustomizeList owns, so they are
// read and written around it rather than through it.
function readLabels() {
  return getNavConfig().labels
}

export default function CustomizeNav({ open, onClose }) {
  const [labels, setLabels] = useState(readLabels)

  useEffect(() => {
    if (open) setLabels(readLabels())
  }, [open])

  // CustomizeList hands back { order, enabled }; labels are merged back in so a
  // reorder cannot silently reset them.
  const setConfig = (c) => setNavConfig({ order: c.order, enabled: c.enabled, labels: readLabels() })

  const resetConfig = () => {
    const c = resetNavConfig()
    setLabels(c.labels)
    return c
  }

  const toggleLabels = () => {
    const next = !labels
    setLabels(next)
    const c = getNavConfig()
    setNavConfig({ order: c.order, enabled: c.enabled, labels: next })
  }

  // The floor is real: two tabs is the fewest a bar can carry and still be a bar.
  // There is no ceiling, because dropping a tab the user just switched on would
  // be worse than a tight bar; the note says what fits instead.
  const lockOff = (key, enabled) => {
    const on = Object.keys(enabled).filter((k) => isTab(k) && enabled[k]).length
    return on <= MIN_VISIBLE
  }

  return (
    <CustomizeList
      open={open}
      onClose={onClose}
      title="Customize drawer"
      note={`Drag the handle to reorder. The switch puts a destination on the bottom bar, where ${BAR_COMFORTABLE} fit comfortably. The leftmost one is where the app opens.`}
      byKey={DEST_BY_KEY}
      groupLabel={GROUP_LABEL}
      icons={DEST_ICONS}
      getConfig={getNavConfig}
      setConfig={setConfig}
      resetConfig={resetConfig}
      lockOff={lockOff}
      footer={
        <div className="cz-group">
          <div className="cz-row">
            <span className="cz-rl">
              <b>Show labels</b>
              <small>Text under each icon in the bar</small>
            </span>
            <button
              type="button"
              className={`cz-toggle${labels ? ' on' : ''}`}
              role="switch"
              aria-checked={labels}
              aria-label="Show tab labels"
              onClick={toggleLabels}
            >
              <i />
            </button>
          </div>
        </div>
      }
    />
  )
}
