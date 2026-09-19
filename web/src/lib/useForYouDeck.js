// For You deck state machine, ported from the pilot's Sept 10 commit
// (src/hooks/use-for-you-deck.ts) to React web.
//
// Owns the snapshot lifecycle: load on filter change / focus / day boundary,
// refresh, and "new mix" batches; hide with undo, wishlist, show-less/more
// taste preferences, and visible-row exposure recording. PWA adaptations:
//   - expo-router focus + AppState become a filterKey effect, a midnight
//     timer and a visibilitychange listener.
//   - Hide/restore delegate to recommendationDismissals.js (Supabase-backed);
//     wishlist delegates to wishlist.js's addToWishlist.
//   - Exposure rows are recorded locally (engine fatigue) and each generated
//     deck is also tracked through recommendationLearning.js so the
//     server-side learning sees the same opportunity.

import { useCallback, useEffect, useRef, useState } from 'react'
import { forYouFilterKey, loadForYouSnapshot } from './forYou.js'
import { localDay } from './forYouEngine.js'
import { dailyRecommendationBatch } from './recommendationRotation.js'
import {
  dismissRecommendation,
  restoreRecommendation,
} from './recommendationDismissals.js'
import { addToWishlist } from './wishlist.js'
import { trackRecommendationFeed } from './recommendationLearning.js'
import {
  getForYouAccount,
  recordForYouExposure,
  setForYouTastePreference,
} from './forYouStorage.js'

const WISHLIST_EVENT = 'gd-wishlist-change'
const RANKING_EVENT = 'gd-ranking-change'
// The pilot counts a row as viewed after 60% visibility for 1.2s while the
// screen is focused and the app is active.
const EXPOSURE_VISIBLE_RATIO = 0.6
const EXPOSURE_VISIBLE_MS = 1200

export function useForYouDeck(filters) {
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [batching, setBatching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [undo, setUndo] = useState(null)
  const ticket = useRef(0)
  const mutation = useRef(false)
  const mounted = useRef(true)
  const current = useRef({ snapshot: null })
  const filterKey = filters ? forYouFilterKey(filters) : null
  const filterRef = useRef(filters)
  const accountRef = useRef(null)

  useEffect(() => {
    current.current = { snapshot }
  }, [snapshot])
  useEffect(() => {
    filterRef.current = filters
  }, [filters])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const load = useCallback(
    async (kind = 'focus') => {
      const selectedFilters = filterRef.current
      if (!selectedFilters || mutation.current) return
      const request = ++ticket.current
      setLoading(true)
      setRefreshing(kind === 'refresh')
      setBatching(kind === 'batch')
      setError(null)
      try {
        const previousSnapshot = current.current.snapshot
        const account = accountRef.current || (await getForYouAccount())
        accountRef.current = account
        const preserve =
          kind !== 'batch' &&
          previousSnapshot &&
          previousSnapshot.key === forYouFilterKey(selectedFilters) &&
          previousSnapshot.day === localDay()
            ? previousSnapshot.deck.map((pick) => pick.game.id)
            : undefined
        const next = await loadForYouSnapshot(selectedFilters, {
          newBatch: kind === 'batch',
          preserve,
        })
        if (ticket.current !== request) return
        const previous = current.current
        const sameDeck =
          kind !== 'batch' &&
          previous.snapshot?.key === next.key &&
          previous.snapshot?.profileKey === next.profileKey &&
          previous.snapshot?.day === next.day
        setSnapshot(next)
        setNotice(next.notice)
        if (kind === 'batch' || !sameDeck) setUndo(null)
        // One learning opportunity per generated deck, mirroring
        // DiscoverForYou's feed tracking.
        if (!sameDeck && next.deck.length) {
          trackRecommendationFeed(next.deck.map((pick) => pick.game), {
            batchId: dailyRecommendationBatch(Date.now(), next.batch),
            surface: 'for_you',
          }).catch(() => {})
        }
      } catch (failure) {
        if (ticket.current !== request) return
        setError(
          failure instanceof Error
            ? failure.message
            : 'Your picks could not be loaded. Please try again.',
        )
      } finally {
        if (ticket.current === request) {
          setLoading(false)
          setRefreshing(false)
          setBatching(false)
        }
      }
    },
    [],
  )
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  }, [load])

  // Reload when the filter selection changes.
  useEffect(() => {
    if (!filterKey) return
    const task = setTimeout(() => void loadRef.current('focus'), 0)
    return () => {
      clearTimeout(task)
      ticket.current += 1
      setRefreshing(false)
    }
  }, [filterKey])

  // Reload at the local day boundary, and reconcile wishlist/ranking changes
  // made elsewhere (detail sheet, Rankings tab).
  useEffect(() => {
    let timer
    const schedule = () => {
      const tomorrow = new Date()
      tomorrow.setHours(24, 0, 1, 0)
      timer = setTimeout(() => {
        if (document.visibilityState === 'visible') void loadRef.current('focus')
        schedule()
      }, Math.max(1000, tomorrow.getTime() - Date.now()))
    }
    schedule()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadRef.current('focus')
    }
    const onTasteChange = () => void loadRef.current('focus')
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(WISHLIST_EVENT, onTasteChange)
    window.addEventListener(RANKING_EVENT, onTasteChange)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(WISHLIST_EVENT, onTasteChange)
      window.removeEventListener(RANKING_EVENT, onTasteChange)
    }
  }, [])

  const visible =
    snapshot?.key === filterKey && snapshot.day === localDay() ? snapshot : null

  // Visible-row exposure recording. A row counts as viewed only after it is at
  // least 60% visible for 1.2s while the document is visible; exposure writes
  // are deduplicated per game/day. Returns a callback ref for the row element.
  const exposureObserver = useRef(null)
  const exposureSeen = useRef(new Set())
  const trackExposureRef = useCallback(
    (id) => (element) => {
      if (!element || !id) return
      if (!exposureObserver.current && typeof IntersectionObserver !== 'undefined') {
        exposureObserver.current = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const gameId = Number(entry.target.getAttribute('data-exposure-id')) || 0
              if (!gameId) continue
              if (entry.isIntersecting && entry.intersectionRatio >= EXPOSURE_VISIBLE_RATIO) {
                if (!entry.target._exposureTimer) {
                  entry.target._exposureTimer = setTimeout(() => {
                    entry.target._exposureTimer = null
                    const view = current.current.snapshot
                    const account = accountRef.current
                    const day = localDay()
                    const dedupe = `${account}:${day}:${gameId}`
                    if (
                      !view ||
                      !account ||
                      document.visibilityState !== 'visible' ||
                      view.day !== day ||
                      !filterRef.current ||
                      view.key !== forYouFilterKey(filterRef.current) ||
                      exposureSeen.current.has(dedupe)
                    ) {
                      return
                    }
                    exposureSeen.current.add(dedupe)
                    recordForYouExposure(account, gameId, day).catch(() => {
                      exposureSeen.current.delete(dedupe)
                    })
                  }, EXPOSURE_VISIBLE_MS)
                }
              } else if (entry.target._exposureTimer) {
                clearTimeout(entry.target._exposureTimer)
                entry.target._exposureTimer = null
              }
            }
          },
          { threshold: [0, EXPOSURE_VISIBLE_RATIO, 1] },
        )
      }
      const observer = exposureObserver.current
      if (!observer) return
      element.setAttribute('data-exposure-id', String(id))
      observer.observe(element)
    },
    [],
  )
  useEffect(
    () => () => {
      exposureObserver.current?.disconnect()
      exposureObserver.current = null
    },
    [],
  )

  const write = async (work, success) => {
    if (mutation.current) return
    mutation.current = true
    ticket.current += 1
    setSaving(true)
    setError(null)
    setNotice(null)
    setRefreshing(false)
    const account = accountRef.current || (await getForYouAccount())
    try {
      await work()
      if (mounted.current) success()
    } catch (failure) {
      if (mounted.current) {
        setNotice(
          failure instanceof Error
            ? failure.message
            : 'Your choice could not be saved. Try again.',
        )
      }
    } finally {
      mutation.current = false
      if (mounted.current) setSaving(false)
    }
    return account
  }

  const remove = (id) => {
    const view = current.current.snapshot
    if (!view) return
    setSnapshot({ ...view, deck: view.deck.filter((r) => r.game.id !== id) })
  }

  const hide = (pick) => {
    if (!pick) return Promise.resolve()
    const view = current.current.snapshot
    const position = view?.deck.findIndex((item) => item.game.id === pick.game.id) ?? -1
    if (position < 0) return Promise.resolve()
    return write(
      async () => {
        const ok = await dismissRecommendation(pick.game)
        if (!ok) throw new Error('Could not hide this pick. Try again.')
      },
      () => {
        remove(pick.game.id)
        setUndo({ pick, index: position })
        setNotice(`${pick.game.title} hidden.`)
      },
    )
  }

  const restore = (id) =>
    write(
      async () => {
        const ok = await restoreRecommendation(id)
        if (!ok) throw new Error('Could not restore this pick. Try again.')
      },
      () => {
        const view = current.current.snapshot
        if (view) {
          const deck = [...view.deck]
          if (undo?.pick.game.id === id && !deck.some((p) => p.game.id === id)) {
            deck.splice(Math.min(undo.index, deck.length), 0, undo.pick)
          }
          setSnapshot({ ...view, deck })
        }
        setUndo(null)
        setNotice('Game restored. It can appear in your recommendations again.')
      },
    )

  const wishlist = (pick) => {
    if (
      !pick ||
      !current.current.snapshot?.deck.some((item) => item.game.id === pick.game.id)
    ) {
      return Promise.resolve()
    }
    // The catalog row already carries cover/year/release fields, so no detail
    // read is needed before the write (the pilot fetched one explicitly).
    return write(
      () => addToWishlist(pick.game),
      () => {
        remove(pick.game.id)
        setUndo(null)
        setNotice(`${pick.game.title} added to Wishlist.`)
      },
    )
  }

  const preferTaste = (key, label, direction) =>
    write(
      async () => {
        const account = accountRef.current || (await getForYouAccount())
        accountRef.current = account
        await setForYouTastePreference(account, key, label, direction)
      },
      () => {
        setSnapshot((view) =>
          view
            ? {
              ...view,
              state: {
                less: [
                  ...(direction === 'less' ? [{ key, label, at: Date.now() }] : []),
                  ...view.state.less.filter((p) => p.key !== key),
                ].slice(0, 40),
                more: [
                  ...(direction === 'more' ? [{ key, label, at: Date.now() }] : []),
                  ...view.state.more.filter((p) => p.key !== key),
                ].slice(0, 40),
              },
            }
            : view,
        )
        setNotice(
          direction === 'more'
            ? `You'll see more ${label.toLowerCase()} picks in your next mix.`
            : direction === 'less'
              ? `You'll see fewer ${label.toLowerCase()} picks in your next mix.`
              : `${label} preference restored.`,
        )
      },
    )

  return {
    snapshot: visible,
    loading,
    refreshing,
    batching,
    saving,
    error,
    notice,
    undo,
    load,
    trackExposureRef,
    hide,
    restore,
    wishlist,
    preferTaste,
    clearNotice: () => {
      setNotice(null)
      setUndo(null)
    },
  }
}
