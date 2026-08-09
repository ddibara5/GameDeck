// Shared trigger for the Exophase sync (the same n8n webhook the drawer's
// "Refresh library" uses). A short client-side lock in sessionStorage stops
// accidental double-triggers across the drawer button and pull-to-refresh; the
// n8n workflow also guards server-side and answers 409 when one is running.

const SYNC_LOCK_KEY = 'gamedeck_sync_lock_v1'
const LOCK_MS = 6 * 60 * 1000

export function syncLockUntil() {
  try {
    return Number(sessionStorage.getItem(SYNC_LOCK_KEY)) || 0
  } catch {
    return 0
  }
}

export function isSyncLocked() {
  return Date.now() < syncLockUntil()
}

function setLock() {
  try {
    sessionStorage.setItem(SYNC_LOCK_KEY, String(Date.now() + LOCK_MS))
  } catch {
    /* storage unavailable (private mode) - the n8n 409 guard still protects us */
  }
}

// Fire the sync. Resolves to { ok, status, message }; never throws.
export async function triggerSync() {
  let res
  try {
    res = await fetch('/api/sync', { method: 'POST' })
  } catch {
    return { ok: false, status: 'unreachable', message: 'Could not reach the sync service.' }
  }
  if (res.status === 202) {
    setLock()
    return { ok: true, status: 'started', message: 'Sync started, updates land in a few minutes.' }
  }
  if (res.status === 409) {
    setLock()
    return { ok: true, status: 'already-running', message: 'A sync is already running.' }
  }
  if (res.status === 503) {
    return { ok: false, status: 'not-configured', message: 'Refresh is not set up yet.' }
  }
  return { ok: false, status: 'error', message: 'Could not start a sync. Please try again.' }
}
