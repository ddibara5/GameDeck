import CustomizeList from './CustomizeList.jsx'
import { ROW_BY_KEY, getRowsConfig, setRowsConfig, resetRowsConfig } from '../lib/discoverRows.js'

// Discover's row editor. All of the behaviour lives in CustomizeList, which
// Insights uses too; this file is only the catalog and the copy.
export default function CustomizeRows({ open, onClose }) {
  return (
    <CustomizeList
      open={open}
      onClose={onClose}
      title="Customize rows"
      note="Drag the handle to reorder. Toggle a row off to hide it from Discover."
      byKey={ROW_BY_KEY}
      getConfig={getRowsConfig}
      setConfig={setRowsConfig}
      resetConfig={resetRowsConfig}
    />
  )
}
