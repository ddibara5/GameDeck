// Home section layout preferences: the standing order and visibility of the
// four Home sections (Statistics, Recent play, New releases, Upcoming).
//
// Port of the Expo pilot's Sept 11 commit (src/lib/home-layout-preferences.ts).
// The PWA is localStorage-only and single session, so the key is device-level
// rather than account-scoped: home layout is a standing UI preference, like
// the Discover prefs (`gamedeck_discover_prefs_v1`), not per-account identity
// state like the first-run setup (`gamedeck_setup_v1_<email>`).

const KEY = 'gamedeck_home_layout_v1'

export const homeSectionOptions = [
  { id: 'statistics', label: 'Statistics' },
  { id: 'recent-play', label: 'Recent play' },
  { id: 'new-releases', label: 'New releases' },
  { id: 'upcoming', label: 'Upcoming' },
]

const SECTION_IDS = homeSectionOptions.map(({ id }) => id)

export const defaultHomeLayout = {
  order: [...SECTION_IDS],
  hidden: [],
}

function isHomeSection(value) {
  return SECTION_IDS.includes(value)
}

// Validate and normalize a stored layout: unknown ids are dropped, the order
// is deduped with the defaults appended (so a layout saved before a new
// section exists still renders it), and hidden ids must also be known.
function normalize(value) {
  if (!value || typeof value !== 'object') {
    return { order: [...SECTION_IDS], hidden: [] }
  }
  const order = [...(Array.isArray(value.order) ? value.order : []), ...SECTION_IDS].filter(
    (id, index, all) => isHomeSection(id) && all.indexOf(id) === index,
  )
  const hidden = (Array.isArray(value.hidden) ? value.hidden : []).filter(
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
