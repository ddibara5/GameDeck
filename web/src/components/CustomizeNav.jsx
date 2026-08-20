import { useMemo } from 'react'
import CustomizeList from './CustomizeList.jsx'
import { DEST_ICONS } from './destIcons.jsx'
import {
  DEST_CATALOG,
  DEST_BY_KEY,
  GROUP_LABEL,
  isBarTab,
  useNavConfig,
  getNavConfig,
  setNavConfig,
  resetNavConfig,
} from '../lib/navConfig.js'

// The drawer's editor: group order and row order, and nothing else.
//
// It used to own bar membership too, which is what made the two surfaces one
// order and meant you could not move a tab left on the bar without also moving
// it in the drawer. Bar membership now lives in CustomizeBar, and every row here
// renders a word instead of a switch, because two controls for one fact is how
// the bar and the drawer end up describing different worlds.
//
// Group headings are printed as the list is walked, so a row dragged elsewhere
// takes its heading with it. The drawer renders by the same rule, so the editor
// and the thing it edits can never disagree about what the order is.
const getDrawerConfig = () => {
  const c = getNavConfig()
  // `enabled` is passed through untouched: it belongs to the bar, and this
  // editor has no control that can change it.
  return { order: c.order, enabled: c.enabled }
}
const setDrawerConfig = (c) => setNavConfig({ order: c.order })
const resetDrawerConfig = () => {
  const c = resetNavConfig()
  return { order: c.order, enabled: c.enabled }
}

export default function CustomizeNav({ open, onClose }) {
  const nav = useNavConfig()

  // The right-hand word is a READOUT, so it has to be computed from live state
  // rather than baked into the catalog: "on bar" is true only while the bar
  // editor says it is.
  const byKey = useMemo(() => {
    const out = {}
    for (const d of DEST_CATALOG) {
      let fixed = d.fixed || ''
      if (isBarTab(d.key)) fixed = nav.enabled[d.key] ? 'on bar' : 'off bar'
      out[d.key] = { ...DEST_BY_KEY[d.key], fixed }
    }
    return out
  }, [nav.enabled])

  return (
    <CustomizeList
      open={open}
      onClose={onClose}
      title="Drawer"
      note="Drag the handle to reorder groups and rows. This does not touch the bottom bar."
      byKey={byKey}
      groupLabel={GROUP_LABEL}
      icons={DEST_ICONS}
      getConfig={getDrawerConfig}
      setConfig={setDrawerConfig}
      resetConfig={resetDrawerConfig}
    />
  )
}
