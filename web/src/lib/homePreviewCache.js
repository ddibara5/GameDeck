import { localDayKey } from './recommendationRotation.js'

export const FOR_YOU_FILTERS_KEY = 'gamedeck-for-you-filters-v1'
let preview = null

export function homePreviewKey() {
  try {
    return `${localDayKey()}|${localStorage.getItem(FOR_YOU_FILTERS_KEY) || ''}`
  } catch {
    return null
  }
}

// Only seeds the first render; Home still refreshes on every visit. A new day
// or changed filters must not flash the previous recommendation deck.
export function getHomePreview() {
  return preview?.key === homePreviewKey() && Date.now() - preview.at < 300000
    ? preview.snapshot : null
}

export function rememberHomePreview(snapshot, key) {
  if (key && key === homePreviewKey()) preview = { snapshot, key, at: Date.now() }
}
