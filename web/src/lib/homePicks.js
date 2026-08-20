// The backlog, and the three games Home suggests from it.
//
// The backlog itself is DERIVED, not stored: it is `effectiveStatus === 'backlog'`,
// the same rule the drawer's shelf and ListView already use, so the count on Home
// can never disagree with the list it opens. Adding a fifth stored status would
// have meant hand-maintaining a 160-row list forever, and "backlog" is the
// absence of a decision rather than a decision.
//
// The SHORTLIST is gated, and that is the whole trick. Run it ungated against
// this library and the top of the list comes back FIFA 14, FIFA 14 again (two
// Xbox SKUs, one game), Aegis Wing, UNO, Farming Simulator 17: a decade of Games
// with Gold churn, not a backlog. Gate on rating and release year and the same
// query returns Hades II, Resident Evil 2, Final Fantasy VII Remake, Outer Wilds.
// Those are games that were started and put down, which is the actual thing.
import { effectiveStatus, includeInLists } from './userStatus.js'

const SKIP_KEY = 'gamedeck_home_skips_v1'
const SKIP_DAYS = 30

// Both gates are deliberately blunt. Anything cleverer needs data this library
// does not have, and a pick you cannot explain in four words is a pick you will
// not trust.
export const MIN_RATING = 78
export const MIN_YEAR = 2019
// IGDB story lengths are unreliable at the short end (Forza Horizon 5 comes back
// as 60 minutes), so a length under this is shown as nothing rather than as a
// number that is wrong.
const MIN_PLAUSIBLE_LENGTH = 90

const num = (v) => Number(v) || 0

export function backlogGames(games, statusMap) {
  return (games || []).filter((g) => includeInLists(g, statusMap) && effectiveStatus(g, statusMap) === 'backlog')
}

/* ------------------------------------------------------------------ skips */

// "Not now" is local and expires. It deliberately does NOT write a status: an x
// on a suggestion means "not tonight", and turning that into `abandoned` would
// put a permanent decision behind a one-tap control. Marking a game abandoned
// for real lives in the game sheet, where it says so.
export function getSkips() {
  let raw = null
  try {
    raw = JSON.parse(localStorage.getItem(SKIP_KEY) || '{}')
  } catch {
    raw = null
  }
  const out = {}
  const floor = Date.now() - SKIP_DAYS * 86400000
  for (const [id, ts] of Object.entries(raw || {})) {
    if (Number(ts) > floor) out[id] = Number(ts)
  }
  return out
}

export function skipGame(masterId) {
  const map = getSkips()
  map[String(masterId)] = Date.now()
  try {
    localStorage.setItem(SKIP_KEY, JSON.stringify(map))
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event('gd-home-skip'))
}

export function clearSkips() {
  try {
    localStorage.removeItem(SKIP_KEY)
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event('gd-home-skip'))
}

/* ----------------------------------------------------------------- picks */

// One row per game, not per SKU. FIFA 14 exists twice with two different
// xbox_title_ids and one igdb_id, which is legitimate (the 360 and the One
// release) and would otherwise let one game take two of the three slots.
function dedupeByIgdb(rows) {
  const seen = new Map()
  const out = []
  for (const g of rows) {
    if (g.igdb_id == null) {
      out.push(g)
      continue
    }
    const prev = seen.get(g.igdb_id)
    if (!prev) {
      seen.set(g.igdb_id, g)
      out.push(g)
    } else if (num(g.playtime_minutes) > num(prev.playtime_minutes)) {
      out[out.indexOf(prev)] = g
      seen.set(g.igdb_id, g)
    }
  }
  return out
}

// Two tiers, so the card never empties out just because the gates are strict.
// The tier is returned rather than inferred, because the card prints what it did:
// claiming "rated 78 or better" over a list that had to fall back would be a lie
// in the one place the design exists to be honest.
export function pickUpNext(games, statusMap, count = 3) {
  const skips = getSkips()
  const pool = dedupeByIgdb(backlogGames(games, statusMap).filter((g) => !skips[String(g.master_id)]))

  const rated = pool
    .filter((g) => num(g.igdb_rating) >= MIN_RATING && num(g.release_year) >= MIN_YEAR)
    .sort((a, b) => num(b.igdb_rating) - num(a.igdb_rating) || num(b.playtime_minutes) - num(a.playtime_minutes))
  if (rated.length) return { picks: rated.slice(0, count), tier: 'rated', pool: pool.length }

  // Nothing survived the gates: fall back to whatever you have actually touched,
  // most recent first.
  const touched = pool
    .filter((g) => num(g.playtime_minutes) > 0)
    .sort((a, b) => (Date.parse(b.last_played) || 0) - (Date.parse(a.last_played) || 0))
  if (touched.length) return { picks: touched.slice(0, count), tier: 'touched', pool: pool.length }

  return { picks: pool.slice(0, count), tier: 'any', pool: pool.length }
}

export const TIER_SUB = {
  rated: `Started and put down, rated ${MIN_RATING} or better`,
  touched: 'Games you started and have not been back to',
  any: 'Waiting in your library',
}

// The chip is the reason this game is being suggested, in as few words as it
// takes. The meta line is the evidence behind it.
export function pickReason(game) {
  const mins = num(game.playtime_minutes)
  if (mins <= 0) return 'Never opened'
  return `${game.playtime_label || `${Math.round(mins)}m`} in`
}

export function pickMeta(game) {
  const parts = []
  const rating = num(game.igdb_rating)
  if (rating > 0) parts.push(`★ ${rating}`)
  const len = num(game.length_minutes)
  if (len >= MIN_PLAUSIBLE_LENGTH) parts.push(`~${Math.round(len / 60)}h`)
  return parts.join(' · ')
}
