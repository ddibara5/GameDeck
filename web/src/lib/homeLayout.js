// Home section layout preferences: the standing order and visibility of Home.
// Insights and Rankings are independent summary cards so each can be shown,
// hidden, and reordered from the Home customizer.
//
// Keep the v2 key so existing preferences migrate in place. Older v2 layouts
// used one "jump-back-in" section; normalize expands that legacy id into the
// two new summary cards at the same position.

const KEY = 'gamedeck_home_layout_v2'
const LEGACY_JUMP_ID = 'jump-back-in'

export const homeSectionOptions = [
  { id: 'insights-summary', label: 'Insights' },
  { id: 'rankings-summary', label: 'Rankings' },
  { id: 'for-you', label: 'For You' },
  { id: 'new-releases', label: 'New releases' },
  { id: 'top-story', label: 'Top story' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'continue-playing', label: 'Recent play' },
]

const SECTION_IDS = homeSectionOptions.map(({ id }) => id)

export const defaultHomeLayout = {
  order: [...SECTION_IDS],
  hidden: [],
}

function isHomeSection(value) {
  return SECTION_IDS.includes(value)
}

function expandLegacyIds(values) {
  const expanded = []
  for (const id of Array.isArray(values) ? values : []) {
    if (id === LEGACY_JUMP_ID) {
      expanded.push('insights-summary', 'rankings-summary')
    } else {
      expanded.push(id)
    }
  }
  return expanded
}

// Validate and normalize a stored layout: unknown ids are dropped, the order
// is deduped with the defaults appended, and legacy Jump back in preferences
// are translated to the two new cards.
function normalize(value) {
  if (!value || typeof value !== 'object') {
    return { order: [...SECTION_IDS], hidden: [] }
  }

  const storedOrder = expandLegacyIds(value.order).filter(
    (id, index, all) => isHomeSection(id) && all.indexOf(id) === index,
  )

  // For You was added after the first v2 layouts shipped. Preserve that older
  // migration too, placing it directly after the two entry summary cards.
  if (!storedOrder.includes('for-you')) {
    const rankingsIndex = storedOrder.indexOf('rankings-summary')
    const insightsIndex = storedOrder.indexOf('insights-summary')
    const insertAfter = rankingsIndex >= 0 ? rankingsIndex : insightsIndex
    if (insertAfter >= 0) storedOrder.splice(insertAfter + 1, 0, 'for-you')
  }

  const order = [...storedOrder, ...SECTION_IDS].filter(
    (id, index, all) => isHomeSection(id) && all.indexOf(id) === index,
  )
  const hidden = expandLegacyIds(value.hidden).filter(
    (id, index, all) => isHomeSection(id) && all.indexOf(id) === index,
  )
  return { order, hidden }
}

export function loadHomeLayout() {
  let stored = null
  try {
    stored = JSON.parse(localStorage.getItem(KEY) || 'null')
  } catch {
    stored = null
  }
  return normalize(stored)
}

export function saveHomeLayout(layout) {
  try {
    localStorage.setItem(KEY, JSON.stringify(normalize(layout)))
  } catch {
    /* storage unavailable */
  }
}

export function resetHomeLayout() {
  saveHomeLayout(defaultHomeLayout)
}

export { KEY as HOME_LAYOUT_KEY }
