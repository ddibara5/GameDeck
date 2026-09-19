// Account-scoped For You preferences, ported from the pilot's Sept 10
// commit (src/lib/for-you-storage.ts). The pilot used expo-sqlite; the PWA
// convention for small synchronous preferences is localStorage (same as
// forYou.js and recommendationDeck.js).
//
// What lives here: taste preferences (show less / show more), local exposure
// records (feeding the engine's fatigue term), daily slate fingerprints
// (lane keys + profile key so repeat launches can reconcile the same deck),
// and the filter selection. Two things deliberately do NOT live here:
//   - Hidden games: the PWA's recommendationDismissals.js already keeps those
//     in Supabase with an optimistic cache (equivalent behavior, cross-device).
//   - Deck ids / resume position: recommendationDeck.js sessions and
//     forYou.js's daily deck index already persist those.
// Feedback must not silently disappear when the saved record is corrupt, so a
// corrupt or oversized record throws and the caller falls back to empty state.

import { supabase } from './supabase.js'

const DAY_MS = 24 * 60 * 60 * 1000
const STORAGE_PREFIX = 'for-you-v2:'
const MAX_PREFS = 40
const MAX_EXPOSURES = 500
const MAX_SLATES = 8

export const emptyForYouState = () => ({
  less: [],
  more: [],
  exposures: [],
  slates: [],
  filters: null,
})

const keyFor = (account) => `${STORAGE_PREFIX}${account || 'anonymous'}`

function storageOrNull() {
  return typeof localStorage === 'undefined' ? null : localStorage
}

export async function getForYouAccount() {
  try {
    const { data } = await supabase.auth.getSession()
    return data?.session?.user?.id || 'anonymous'
  } catch {
    return 'anonymous'
  }
}

function finite(value, fallback = 0) {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : fallback
}

function positiveId(value) {
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  return typeof parsed === 'number' && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function parse(raw) {
  if (!raw) return emptyForYouState()
  // Feedback must not silently disappear when the saved record is corrupt.
  if (raw.length > 1_000_000) {
    throw new Error('For You preferences could not be read.')
  }
  const data = record(JSON.parse(raw))
  if (
    ![data.less, data.exposures, data.slates].every(Array.isArray) ||
    (data.more !== undefined && !Array.isArray(data.more))
  ) {
    throw new Error('For You preferences could not be read.')
  }
  const list = (value) => (Array.isArray(value) ? value.map(record) : [])
  const prefs = (rows, excluding = []) =>
    list(rows)
      .flatMap((row) =>
        typeof row.key === 'string' &&
        typeof row.label === 'string' &&
        !excluding.some((preference) => preference.key === row.key)
          ? [{ key: row.key, label: row.label.slice(0, 120), at: finite(row.at) }]
          : [],
      )
      .slice(0, MAX_PREFS)
  const less = prefs(data.less)
  // Existing v2 records have no `more` field; retain all earlier feedback.
  const more = prefs(data.more, less)
  const exposures = list(data.exposures)
    .flatMap((row) => {
      const id = positiveId(row.id)
      return id &&
        typeof row.day === 'string' &&
        Date.now() - finite(row.at) < 90 * DAY_MS
        ? [
          {
            id,
            day: row.day,
            at: finite(row.at),
            count: Math.max(1, Math.min(30, finite(row.count, 1))),
          },
        ]
        : []
    })
    .slice(0, MAX_EXPOSURES)
  const slates = list(data.slates)
    .flatMap((row) => {
      if (
        typeof row.key !== 'string' ||
        typeof row.day !== 'string' ||
        typeof row.profile !== 'string'
      ) {
        return []
      }
      return [
        {
          key: row.key,
          day: row.day,
          profile: row.profile,
          laneKeys: Array.isArray(row.laneKeys)
            ? [
              ...new Set(
                row.laneKeys.filter(
                  (key) => typeof key === 'string' && key.length <= 40,
                ),
              ),
            ].slice(0, 9)
            : null,
          batch: Math.max(0, Math.floor(finite(row.batch))),
          at: finite(row.at),
        },
      ]
    })
    .filter((row) => Date.now() - row.at < 2 * DAY_MS)
    .slice(0, MAX_SLATES)
  return {
    less,
    more,
    exposures,
    slates,
    filters: data.filters ?? null,
  }
}

export function readForYouState(account) {
  const source = storageOrNull()
  if (!source) return emptyForYouState()
  return parse(source.getItem(keyFor(account)))
}

export async function updateForYouState(account, update) {
  const source = storageOrNull()
  if (!source) return
  // Refuse to write one account's feedback under another account's key when
  // the session changed mid-flight.
  const current = await getForYouAccount()
  if (current !== account) throw new Error('Account changed. Please try again.')
  source.setItem(keyFor(account), JSON.stringify(update(parse(source.getItem(keyFor(account))))))
}

export async function saveForYouSlate(account, slate) {
  await updateForYouState(account, (state) => ({
    ...state,
    slates: [
      slate,
      ...state.slates.filter((s) => s.key !== slate.key || s.day !== slate.day),
    ].slice(0, MAX_SLATES),
  }))
}

export async function recordForYouExposure(account, id, day) {
  const gameId = positiveId(id)
  if (!gameId || typeof day !== 'string') return
  await updateForYouState(account, (state) => {
    const previous = state.exposures.find((e) => e.id === gameId)
    if (previous?.day === day) return state
    return {
      ...state,
      exposures: [
        {
          id: gameId,
          day,
          at: Date.now(),
          count: Math.min(30, (previous?.count ?? 0) + 1),
        },
        ...state.exposures.filter((e) => e.id !== gameId),
      ].slice(0, MAX_EXPOSURES),
    }
  })
}

// Mutually exclusive Less / Default / More per taste key. Default removes the
// key from both lists.
export async function setForYouTastePreference(account, key, label, direction) {
  if (typeof key !== 'string' || !key) return
  await updateForYouState(account, (state) => ({
    ...state,
    less: [
      ...(direction === 'less' ? [{ key, label: String(label || key).slice(0, 120), at: Date.now() }] : []),
      ...state.less.filter((p) => p.key !== key),
    ].slice(0, MAX_PREFS),
    more: [
      ...(direction === 'more' ? [{ key, label: String(label || key).slice(0, 120), at: Date.now() }] : []),
      ...state.more.filter((p) => p.key !== key),
    ].slice(0, MAX_PREFS),
  }))
}
