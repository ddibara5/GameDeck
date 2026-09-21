// Home section layout preferences: the standing order and visibility of the
// Home sections (Jump back in, For You, New releases, Top story, Upcoming,
// Recent play).
//
// The key moved to _v2 with the Home redesign (2026-09-19): the redesign
// replaced the old four sections (Statistics, Recent play, New releases,
// Upcoming) with the redesigned sections, so a stored v1 order no longer describes the
// page. v2 starts every profile on the approved mockup order; the customize
// sheet (show/hide, reorder, local persistence) works exactly as before from
// there.

const KEY = 'gamedeck_home_layout_v2'

export const homeSectionOptions = [
  { id: 'jump-back-in', label: 'Jump back in' },
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

// Validate and normalize a stored layout: unknown ids are dropped, the order
// is deduped with the defaults appended (so a layout saved before a new
// section exists still renders it), and hidden ids must also be known.
function normalize(value) {
  if (!value || typeof value !== 'object') {
    return { order: [...SECTION_IDS], hidden: [] }
  }
  const storedOrder = (Array.isArray(value.order) ? value.order : []).filter(
    (id, index, all) => isHomeSection(id) && all.indexOf(id) === index,
  )

  // "For You" became its own Home section after the v2 layout shipped. Keep
  // existing customized layouts intact, but migrate old v2 orders by placing
  // the new section directly after Jump back in. Once the user moves it, that
  // explicit position is preserved on later loads.
  if (!storedOrder.includes('for-you')) {
    const jumpIndex = storedOrder.indexOf('jump-back-in')
    if (jumpIndex >= 0) storedOrder.splice(jumpIndex + 1, 0, 'for-you')
  }

  const order = [...storedOrder, ...SECTION_IDS].filter(
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
