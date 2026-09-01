// Local-first persistence: a tiny IndexedDB key/value cache plus the
// stale-while-revalidate helper the data loaders are built on.
//
// Why this exists: every data source in the app used to be in-memory only, so a
// cold start had nothing to render until the network answered. Persisting the
// last known-good payload lets the UI paint from disk in a few milliseconds and
// refresh quietly afterwards, which is the main thing that separates a native
// app's "instant" feel from a web app's "loading" feel.
//
// Everything degrades to a no-op when IndexedDB is unavailable (private
// browsing, blocked storage, older Safari): callers simply get a cache miss and
// fall back to the network fetch they would have made anyway. No error from
// this module ever escapes to a caller.

const DB_NAME = 'gamedeck'
const STORE = 'cache'
const DB_VERSION = 1

// Baked into every key. Bump it to invalidate all persisted payloads at once,
// e.g. after changing the shape of something we cache.
//
// v2, 22 Aug: 1c1b809 added backdropId/backdropKind/artworks to the normalized
// game record, and did not bump this. `swr` returns a hit WITHOUT revalidating
// for the whole of maxAge, and discover:game:<id> has a 7-day maxAge, so every
// game a device had opened in the previous week kept being served a record with
// no backdropId - and a sheet with no backdropId paints a colour and no key art
// at all. Which is exactly what shipped to Dave's phone and nothing else.
//
// This is the ONLY safe fix, because the stale records are on devices, not on a
// server: no deploy can reach into them, and nothing in the payload says which
// version wrote it. Changing the key is what makes them unreachable.
//
// The cost is one cold fetch per source on the next open. The alternative -
// deleting just the discover:game:* keys - is more code guarding a narrower
// case, and would need writing again for the next shape change.
const SCHEMA = 'v2'

let _dbPromise = null
// One network refresh per logical cache key. Several tab components can mount in
// the same tick (Home + drawer, or Home followed quickly by Insights) and each
// can legitimately ask SWR for the same payload. IndexedDB reads are async, so a
// caller-local `inflight` flag cannot stop both of them reaching the fetcher.
// Keeping the refresh here makes deduplication a property of the cache itself.
const _revalidations = new Map()

function openDb() {
  if (_dbPromise) return _dbPromise
  _dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    let req
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      resolve(null)
      return
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })
  return _dbPromise
}

function store(mode) {
  return openDb()
    .then((db) => {
      if (!db) return null
      try {
        return db.transaction(STORE, mode).objectStore(STORE)
      } catch {
        return null
      }
    })
    .catch(() => null)
}

// Resolves { value, ts } on a hit, or null on a miss / unavailable storage.
export function idbGet(key) {
  return store('readonly')
    .then(
      (os) =>
        new Promise((resolve) => {
          if (!os) {
            resolve(null)
            return
          }
          let req
          try {
            req = os.get(`${SCHEMA}:${key}`)
          } catch {
            resolve(null)
            return
          }
          req.onsuccess = () => {
            const rec = req.result
            resolve(rec && rec.value !== undefined ? { value: rec.value, ts: rec.ts || 0 } : null)
          }
          req.onerror = () => resolve(null)
        })
    )
    .catch(() => null)
}

// Read a group of keys through one IndexedDB transaction. Opening a transaction
// per game made wishlist metadata cache hits surprisingly expensive on mobile:
// a 60-game wishlist meant 60 transactions before the network decision could be
// made. The returned Map uses the caller's unprefixed keys and the same
// `{ value, ts }` record shape as idbGet().
export function idbGetMany(keys) {
  const list = [...new Set((keys || []).filter(Boolean))]
  if (!list.length) return Promise.resolve(new Map())
  return openDb()
    .then((db) => new Promise((resolve) => {
      if (!db) {
        resolve(new Map())
        return
      }
      let tx
      try {
        tx = db.transaction(STORE, 'readonly')
      } catch {
        resolve(new Map())
        return
      }
      const os = tx.objectStore(STORE)
      const out = new Map()
      tx.onabort = () => resolve(out)
      tx.onerror = () => resolve(out)
      let remaining = list.length
      const finish = () => {
        remaining -= 1
        if (remaining === 0) resolve(out)
      }
      for (const key of list) {
        let req
        try {
          req = os.get(`${SCHEMA}:${key}`)
        } catch {
          finish()
          continue
        }
        req.onsuccess = () => {
          const rec = req.result
          if (rec && rec.value !== undefined) out.set(key, { value: rec.value, ts: rec.ts || 0 })
          finish()
        }
        req.onerror = finish
      }
    }))
    .catch(() => new Map())
}

// Fire-and-forget write. Values must be structured-cloneable (plain objects,
// arrays, Map/Set, Date); anything else is skipped rather than thrown.
export function idbSet(key, value) {
  return store('readwrite')
    .then((os) => {
      if (!os) return undefined
      try {
        os.put({ key: `${SCHEMA}:${key}`, value, ts: Date.now() })
      } catch {
        /* not cloneable - not worth failing a render over */
      }
      return undefined
    })
    .catch(() => undefined)
}

// Write a group of cache records in one transaction. Like idbSet(), cache
// failures never escape to rendering code.
export function idbSetMany(entries) {
  const list = (entries || []).filter((entry) => Array.isArray(entry) && entry[0])
  if (!list.length) return Promise.resolve(undefined)
  return openDb()
    .then((db) => new Promise((resolve) => {
      if (!db) {
        resolve(undefined)
        return
      }
      let tx
      try {
        tx = db.transaction(STORE, 'readwrite')
      } catch {
        resolve(undefined)
        return
      }
      const os = tx.objectStore(STORE)
      const ts = Date.now()
      for (const [key, value] of list) {
        try {
          os.put({ key: `${SCHEMA}:${key}`, value, ts })
        } catch {
          /* not cloneable - skip this record */
        }
      }
      tx.oncomplete = () => resolve(undefined)
      tx.onerror = () => resolve(undefined)
      tx.onabort = () => resolve(undefined)
    }))
    .catch(() => undefined)
}

export function idbDel(key) {
  return store('readwrite')
    .then((os) => {
      if (!os) return undefined
      try {
        os.delete(`${SCHEMA}:${key}`)
      } catch {
        /* ignore */
      }
      return undefined
    })
    .catch(() => undefined)
}

/**
 * Stale-while-revalidate around a network fetcher.
 *
 *   cache hit, fresher than maxAge -> resolve from disk, no network at all
 *   cache hit, older than maxAge   -> resolve from disk NOW, refresh in the
 *                                     background, hand the result to onFresh
 *   cache miss                     -> await the network, then persist
 *
 * Resolves `{ value, stale }`. `stale: true` means the value came off disk and
 * an `onFresh` call may still follow; `stale: false` means it came from the
 * network and `onFresh` will NOT fire, so callers never double-apply.
 *
 * Rejects only when there was no cached value AND the fetcher failed. A failed
 * background refresh is swallowed on purpose: the user keeps seeing good data.
 */
export async function swr(key, fetcher, { maxAge = 0, onFresh } = {}) {
  const hit = await idbGet(key)

  const revalidate = () => {
    if (_revalidations.has(key)) return _revalidations.get(key)
    const request = Promise.resolve()
      .then(fetcher)
      .then((fresh) => {
        if (fresh !== undefined && fresh !== null) idbSet(key, fresh)
        return fresh
      })
      .finally(() => {
        if (_revalidations.get(key) === request) _revalidations.delete(key)
      })
    _revalidations.set(key, request)
    return request
  }

  if (hit) {
    // maxAge <= 0 means "always revalidate", said outright rather than left to
    // arithmetic. `Date.now() - hit.ts > 0` looks equivalent and is not: under a
    // pinned clock the two are equal and the refresh never fires. repro/home.mjs
    // pins time to 19 Aug, which is exactly how this was found - the Game Pass
    // card kept serving the previous catalog with no request ever going out.
    if (maxAge <= 0 || Date.now() - hit.ts > maxAge) {
      revalidate()
        .then((fresh) => {
          if (onFresh && fresh !== undefined && fresh !== null) onFresh(fresh)
        })
        .catch(() => {})
    }
    return { value: hit.value, stale: true }
  }

  const fresh = await revalidate()
  return { value: fresh, stale: false }
}
