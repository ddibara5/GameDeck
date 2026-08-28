// The wishlist release model: how a saved game's release date is normalized,
// ordered, and bucketed into date sections.
//
// Lifted out of WishlistTab when the Discover "Your wishlist" page needed the same
// month sections. The alternative was a second copy of sectionOf/windowEnd living
// in the Discover chunk, and the two would have drifted the first time a precision
// rule changed - which is exactly how the Library ended up with two column lists.

import { startOfDay, daysBetween } from './playWeek.js'

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

// Release dates are calendar dates, not launch-time instants. Keep the stored
// UTC day intact when turning one into the user's local calendar day; otherwise
// UTC midnight makes a title appear released the prior evening west of UTC.
export function releaseCalendarDay(rel) {
  const ts = windowEnd(rel)
  if (!Number.isFinite(ts)) return null
  const utc = new Date(ts)
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate())
}

// Positive is upcoming, zero is today, negative is already out. `now` is an
// argument so every consumer and test can make the same calendar-day decision.
export function releaseDaysFromToday(rel, now = new Date()) {
  const day = releaseCalendarDay(rel)
  return day ? daysBetween(day, startOfDay(now)) : null
}

export function isOut(rel, now = new Date()) {
  const days = releaseDaysFromToday(rel, now)
  return days != null && days <= 0
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

// The mirror of groupByRelease, for the Out now page: released rows, newest
// first, in four bands rather than one section per month.
//
// Twelve months of sections is right when you are looking FORWARD, because the
// months ahead are few and each one is a plan. Looking back they are not: today
// this list spans 2020 to yesterday, and month sections would give it twelve
// headings, seven of them holding one row. The bands collapse the tail without
// collapsing the part you actually came for.
export function groupByReleased(items) {
  const now = new Date()
  const Y = now.getUTCFullYear()
  const M = now.getUTCMonth()
  const band = (rel) => {
    const d = new Date(effTs(rel))
    const y = d.getUTCFullYear()
    if (y === Y && d.getUTCMonth() === M) return { order: 0, id: 'thismonth', label: 'This month', amber: true }
    if (y === Y) return { order: 1, id: `y${Y}`, label: `Earlier in ${Y}`, amber: false }
    if (y === Y - 1) return { order: 2, id: `y${Y - 1}`, label: String(Y - 1), amber: false }
    return { order: 3, id: 'older', label: `${Y - 2} and older`, amber: false }
  }
  const groups = new Map()
  for (const r of items) {
    const b = band(relOf(r))
    if (!groups.has(b.id)) groups.set(b.id, { ...b, rows: [] })
    groups.get(b.id).rows.push(r)
  }
  const secs = [...groups.values()].sort((a, b) => a.order - b.order)
  // Newest first everywhere here, which is the opposite of the upcoming page and
  // the whole reason this is a separate builder rather than a reverse() of it.
  for (const g of secs) g.rows.sort((a, b) => effTs(relOf(b)) - effTs(relOf(a)) || byTitle(a, b))
  return secs
}

// The chip for a released row, on the Out now page.
//
// Two jobs, and they change hands at 30 days. Up close, recency is the whole
// point: "8 days ago" is why the row is near the top. Past a month it stops
// being: "7 months ago" is no more useful than "Feb '26" and is twice as wide,
// and the width is not free, because .wl-rt truncates and a wider chip eats the
// title beside it. That handover is the same one the upcoming chip already
// makes, countdown near and date far, so the two pages read alike.
//
// It exists at all because the wishlist's own chip says "Out now" for anything
// released, which on a page where every row is released would repeat the section
// heading on every line. Same fault the Leaving Game Pass rows had.
export function outChipOf(rel) {
  // CALENDAR days, using the same helper the Recently released card uses, not a
  // division of elapsed milliseconds. The card and the page its chevron opens
  // cannot be allowed to disagree about whether a game came out 8 days ago or 9,
  // and they would: a game released this morning is 0.8 of a day old, which
  // rounds to "1 day ago" and floors to "Today" depending on the hour the page
  // is opened. A release date is a day, so the arithmetic is in days.
  const utc = new Date(effTs(rel))
  const day = new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate())
  const days = Math.max(0, daysBetween(startOfDay(new Date()), day))
  if (days === 0) return { cls: 'soon', txt: 'Today' }
  if (days === 1) return { cls: 'soon', txt: '1 day ago' }
  if (days < 30) return { cls: 'soon', txt: `${days} days ago` }
  const sameYear = utc.getUTCFullYear() === new Date().getUTCFullYear()
  return sameYear
    ? { cls: 'near', txt: fmtDayShort(effTs(rel)) }
    : { cls: 'far', txt: fmtMonthShort(effTs(rel)) }
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
  // A released row used to badge "Owned", which is exactly backwards. The
  // wishlist reconciles anything that turns up in the synced library OUT of
  // itself on every open, so a released row that is still here is precisely the
  // one thing it cannot be. It carries its date instead: the day if it landed
  // this year, the year if it did not.
  if (isOut(rel)) {
    const d = new Date(effTs(rel))
    return d.getUTCFullYear() === new Date().getUTCFullYear() ? fmtDayShort(effTs(rel)) : String(d.getUTCFullYear())
  }
  const days = Math.round((effTs(rel) - Date.now()) / DAY)
  if (rel.k === 'day') return days <= 30 ? `${Math.max(days, 0)}d` : fmtDayShort(rel.ts)
  if (rel.k === 'month') return fmtMonthShort(rel.ts)
  if (rel.k === 'quarter') {
    const d = new Date(rel.ts)
    return `Q${Math.floor(d.getUTCMonth() / 3) + 1} '${String(d.getUTCFullYear()).slice(2)}`
  }
  return String(new Date(rel.ts).getUTCFullYear())
}
