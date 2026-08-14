// The wishlist release model: how a saved game's release date is normalized,
// ordered, and bucketed into date sections.
//
// Lifted out of WishlistTab when the Discover "Your wishlist" page needed the same
// month sections. The alternative was a second copy of sectionOf/windowEnd living
// in the Discover chunk, and the two would have drifted the first time a precision
// rule changed - which is exactly how the Library ended up with two column lists.

export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const DAY = 86400000

// Rows reach this from two places with different field names for the same thing:
// the `wishlist` table calls it `date_precision` and carries `release_label`, while
// the Discover cards built in DiscoverBrowse call it `precision`. Both spellings are
// accepted rather than renaming either source, because the stored column and the
// IGDB-shaped card are both legitimately named for where they came from.
//
// Normalizes to { k: 'day'|'month'|'quarter'|'year'|'tba', ts, label }.
export function relOf(r) {
  const prec = r.date_precision || r.precision
  const ts = r.released != null ? r.released * 1000 : null
  const label = r.release_label || (r.release && r.release.human) || null
  if (prec === 'tba') return { k: 'tba', ts: null, label: label || 'TBA' }
  if (ts != null) return { k: prec || 'day', ts, label }
  if (r.year) return { k: 'year', ts: Date.UTC(r.year, 5, 1), label: String(r.year) }
  return { k: 'tba', ts: null, label: 'TBA' }
}

// End of the known release window: the last day the game could land given its
// precision. Coarser dates (quarter, year) resolve to the END of their period so
// they sort AFTER the concrete dates they overlap, never before them.
export function windowEnd(rel) {
  if (rel.ts == null) return Infinity
  const d = new Date(rel.ts)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  if (rel.k === 'year') return Date.UTC(y, 11, 31)
  if (rel.k === 'quarter') return Date.UTC(y, Math.floor(m / 3) * 3 + 3, 0)
  if (rel.k === 'month') return Date.UTC(y, m + 1, 0)
  return rel.ts
}

// Instant used for sorting + countdown: the end of the window, so a vaguer date
// never jumps ahead of the specific ones inside the same period.
export function effTs(rel) {
  return windowEnd(rel)
}

export function isOut(rel) {
  return rel.k !== 'tba' && rel.ts != null && windowEnd(rel) < Date.now()
}

export function byTitle(a, b) {
  return String(a.title || a.name || '').localeCompare(String(b.title || b.name || ''))
}

// Which dated section a row belongs to, and its sort order.
export function sectionOf(rel) {
  if (rel.k === 'tba') return { order: 8e15, id: 'tba', label: 'To be announced', amber: false }
  if (isOut(rel)) return { order: 9e15, id: 'out', label: 'Out now', amber: false }
  const d = new Date(rel.ts)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const now = new Date()
  if (rel.k === 'day' || rel.k === 'month') {
    const thisMonth = y === now.getUTCFullYear() && m === now.getUTCMonth()
    return { order: Date.UTC(y, m, 1), id: `m${y}-${m}`, label: thisMonth ? 'This month' : `${MON[m]} ${y}`, amber: thisMonth }
  }
  if (rel.k === 'quarter') {
    const q = Math.floor(m / 3) + 1
    return { order: Date.UTC(y, q * 3, 0), id: `q${y}-${q}`, label: `Q${q} ${y}`, amber: false }
  }
  return { order: Date.UTC(y, 11, 31), id: `y${y}`, label: `${y}`, amber: false }
}

// Group rows into date sections, soonest first, with the released ones last.
// Inside a section, upcoming games run soonest-first and the "Out now" bucket runs
// most-recent-first: the thing that just landed is the point of that section.
export function groupByRelease(items) {
  const groups = new Map()
  for (const r of items) {
    const s = sectionOf(relOf(r))
    if (!groups.has(s.id)) groups.set(s.id, { ...s, rows: [] })
    groups.get(s.id).rows.push(r)
  }
  const secs = [...groups.values()].sort((a, b) => a.order - b.order)
  for (const g of secs) {
    const past = g.id === 'out'
    g.rows.sort((a, b) => {
      const ta = effTs(relOf(a))
      const tb = effTs(relOf(b))
      return past ? tb - ta || byTitle(a, b) : ta - tb || byTitle(a, b)
    })
  }
  return secs
}

export function fmtDayShort(ts) {
  const d = new Date(ts)
  return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`
}

export function fmtMonthShort(ts) {
  const d = new Date(ts)
  return `${MON[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`
}

// Compact badge: the shortest honest rendering of a release window.
export function shortOf(rel) {
  if (rel.k === 'tba') return 'TBA'
  if (isOut(rel)) return 'Owned'
  const days = Math.round((effTs(rel) - Date.now()) / DAY)
  if (rel.k === 'day') return days <= 30 ? `${Math.max(days, 0)}d` : fmtDayShort(rel.ts)
  if (rel.k === 'month') return fmtMonthShort(rel.ts)
  if (rel.k === 'quarter') {
    const d = new Date(rel.ts)
    return `Q${Math.floor(d.getUTCMonth() / 3) + 1} '${String(d.getUTCFullYear()).slice(2)}`
  }
  return String(new Date(rel.ts).getUTCFullYear())
}
