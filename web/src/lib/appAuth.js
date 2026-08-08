// Minimal shared-secret for the /api/chat endpoint, stored on-device.
// NOT shipped in the JS bundle: the user enters it once and it lives in
// localStorage. It gates the one endpoint that spends money (the recommender);
// every other tab reads Supabase directly under read-only RLS and needs no secret.

const KEY = 'gamedeck_app_key_v1'

export function getAppKey() {
  try {
    return localStorage.getItem(KEY) || null
  } catch {
    return null
  }
}

export function setAppKey(value) {
  try {
    if (value) localStorage.setItem(KEY, value)
    else localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable */
  }
}

// Prompt once for the access key, store it, return it (or null if cancelled).
export function promptForKey() {
  let entered = null
  try {
    entered = window.prompt('Enter your GameDeck access key to use Discover:')
  } catch {
    entered = null
  }
  entered = entered && entered.trim()
  if (entered) {
    setAppKey(entered)
    return entered
  }
  return null
}
