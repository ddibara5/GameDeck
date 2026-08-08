import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import Cover from './Cover.jsx'
import Skeleton from './Skeleton.jsx'
import { formatRelativeDay, minutesToHhm, platformMeta } from '../lib/format.js'

const RECENT_LIMIT = 60

// After a manual refresh, disable the button for a few minutes so the 1-vCPU
// FlareSolverr box is never asked to run two syncs at once. Session-scoped so it
// survives tab navigation but resets when the app is closed.
const LOCK_KEY = 'gamedeck_sync_lock_v1'
const LOCK_MS = 6 * 60 * 1000
const POLL_MS = 15000
const POLL_TIMEOUT_MS = 8 * 60 * 1000

function loadLockUntil() {
  try {
    return Number(sessionStorage.getItem(LOCK_KEY)) || 0
  } catch {
    return 0
  }
}

function persistLockUntil(ts) {
  try {
    if (ts) sessionStorage.setItem(LOCK_KEY, String(ts))
    else sessionStorage.removeItem(LOCK_KEY)
  } catch {
    /* storage unavailable - lockout just won't persist across navigation */
  }
}

export default function ActivityTab() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncNote, setSyncNote] = useState('')
  const [lockUntil, setLockUntil] = useState(loadLockUntil())
  const pollRef = useRef(null)
  const mountedRef = useRef(true)

  async function loadEvents() {
    const { data, error: err } = await supabase
      .from('v_recent_activity')
      .select('*')
      .order('event_date', { ascending: false })
      .limit(RECENT_LIMIT)

    if (!mountedRef.current) return
    if (err) setError(err.message)
    else {
      setEvents(data || [])
      setError(null)
    }
  }

  useEffect(() => {
    mountedRef.current = true
    ;(async () => {
      setLoading(true)
      await loadEvents()
      if (mountedRef.current) setLoading(false)
    })()
    return () => {
      mountedRef.current = false
      if (pollRef.current) clearInterval(pollRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The real completion signal is a new sync_runs row with games_seen filled in
  // (only the sync's final "Log Sync Run" step writes that; lock rows leave it null).
  async function latestCompletedId() {
    const { data } = await supabase
      .from('sync_runs')
      .select('id')
      .not('games_seen', 'is', null)
      .order('id', { ascending: false })
      .limit(1)
    return data && data[0] ? Number(data[0].id) : 0
  }

  function startPolling(baselineId) {
    if (pollRef.current) clearInterval(pollRef.current)
    const startedAt = Date.now()
    pollRef.current = setInterval(async () => {
      if (!mountedRef.current) return
      const latest = await latestCompletedId()
      if (latest > baselineId) {
        clearInterval(pollRef.current)
        pollRef.current = null
        await loadEvents()
        if (mountedRef.current) {
          setSyncing(false)
          setSyncNote('Updated just now.')
        }
        return
      }
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        clearInterval(pollRef.current)
        pollRef.current = null
        if (mountedRef.current) {
          setSyncing(false)
          setSyncNote('Still running in the background, pull down to refresh in a bit.')
        }
      }
    }, POLL_MS)
  }

  async function triggerRefresh() {
    if (syncing || Date.now() < lockUntil) return
    setSyncing(true)
    setSyncNote('Refreshing your library, this takes a few minutes.')

    const baselineId = await latestCompletedId()

    let res
    try {
      res = await fetch('/api/sync', { method: 'POST' })
    } catch {
      setSyncing(false)
      setSyncNote('Could not reach the sync service. Please try again.')
      return
    }

    if (res.status === 202 || res.status === 409) {
      // Started, or one was already running: either way, watch for completion.
      const until = Date.now() + LOCK_MS
      setLockUntil(until)
      persistLockUntil(until)
      if (res.status === 409) setSyncNote('A sync is already running, watching for it to finish.')
      startPolling(baselineId)
      return
    }

    setSyncing(false)
    if (res.status === 503) setSyncNote('Refresh is not set up yet.')
    else setSyncNote('Could not start a sync. Please try again.')
  }

  const grouped = useMemo(() => {
    const groups = []
    const byDate = new Map()

    for (const event of events) {
      const label = formatRelativeDay(event.event_date)
      if (!byDate.has(label)) {
        const group = { label, items: [] }
        byDate.set(label, group)
        groups.push(group)
      }
      byDate.get(label).items.push(event)
    }

    return groups
  }, [events])

  const locked = Date.now() < lockUntil
  const buttonDisabled = syncing || locked

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h1 className="page-title">Activity</h1>
          <button
            type="button"
            className="chat-newchat-btn"
            onClick={triggerRefresh}
            disabled={buttonDisabled}
            aria-label="Refresh library from Exophase"
          >
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
            {syncing ? 'Syncing' : 'Refresh'}
          </button>
        </div>
        <p className="page-subtitle">Recent play sessions and achievement unlocks.</p>
        {syncNote ? <p className="page-subtitle" style={{ marginTop: 4 }}>{syncNote}</p> : null}
      </div>

      {loading ? (
        <Skeleton count={6} />
      ) : error ? (
        <div className="empty-state">
          <div className="empty-state-title">Couldn't load activity</div>
          <div>{error}</div>
        </div>
      ) : grouped.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">Nothing here yet</div>
          <div>Your play history builds up daily, check back soon.</div>
        </div>
      ) : (
        grouped.map((group) => (
          <section key={group.label}>
            <div className="activity-group-label">{group.label}</div>
            <div>
              {group.items.map((event, idx) => (
                <ActivityRow event={event} key={`${event.title}-${event.event_date}-${idx}`} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

function ActivityRow({ event }) {
  const { label, color } = platformMeta(event.environment)
  const parts = []
  if (event.minutes_delta > 0) parts.push(`+${minutesToHhm(event.minutes_delta)} played`)
  if (event.achievements_delta > 0) parts.push(`+${event.achievements_delta} achievements`)

  return (
    <div className="activity-item">
      <Cover src={event.cover_small} title={event.title} size="sm" />
      <div className="activity-body">
        <div className="activity-title">{event.title}</div>
        <div className="activity-detail">
          <span className="platform-dot" style={{ background: color }} />
          <span>{label}</span>
          {parts.length > 0 ? <span>· {parts.join(' · ')}</span> : null}
        </div>
      </div>
    </div>
  )
}
