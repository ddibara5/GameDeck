import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import Cover from './Cover.jsx'
import Skeleton from './Skeleton.jsx'
import { formatRelativeDay, minutesToHhm, platformMeta } from '../lib/format.js'

const RECENT_LIMIT = 60

export default function ActivityTab() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const { data, error: err } = await supabase
        .from('v_recent_activity')
        .select('*')
        .order('event_date', { ascending: false })
        .limit(RECENT_LIMIT)

      if (cancelled) return

      if (err) {
        setError(err.message)
      } else {
        setEvents(data || [])
      }
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

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

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Activity</h1>
        <p className="page-subtitle">Recent play sessions and achievement unlocks.</p>
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
          <div>Your play history builds up daily — check back soon.</div>
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
