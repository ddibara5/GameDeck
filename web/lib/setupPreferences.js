// First-run platform setup preferences, stored per account on this device.
//
// Port of the Expo pilot's src/lib/setup-preferences.ts (Sept 10 commit).
// The pilot used expo-secure-store with async calls and an account-change
// guard around the round trip. The PWA is localStorage-only and single
// session, so the API is synchronous and the key itself carries the account
// scope: gamedeck_setup_v1_<owner email>. The shape is unchanged:
// { platforms: string[], completed: boolean }.
import { OWNER_EMAIL } from './supabase.js'
import { PLATFORM_CHOICES } from './discoverPrefs.js'

const CHOICE_KEYS = PLATFORM_CHOICES.map((p) => p.key)

function storageKey() {
  return `gamedeck_setup_v1_${String(OWNER_EMAIL || 'owner').toLowerCase()}`
}

function cleanPlatforms(value) {
  return Array.isArray(value) ? value.filter((p) => CHOICE_KEYS.includes(p)) : []
}

export function loadSetupPreferences() {
  let stored = null
  try {
    stored = JSON.parse(localStorage.getItem(storageKey()) || 'null')
  } catch {
    stored = null
  }
  return {
    platforms: cleanPlatforms(stored && stored.platforms),
    completed: Boolean(stored && stored.completed === true),
  }
}

export function saveSetupPreferences(preferences) {
  const record = {
    platforms: cleanPlatforms(preferences && preferences.platforms),
    completed: Boolean(preferences && preferences.completed === true),
  }
  try {
    localStorage.setItem(storageKey(), JSON.stringify(record))
  } catch {
    throw new Error('Could not save your setup preferences on this device.')
  }
  return record
}
