import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import Skeleton from './Skeleton.jsx'
import { useStatusMap, effectiveStatus } from '../lib/userStatus.js'

function Bars({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <>
      {rows.map((r, i) => (
        <div className="bar-row" key={i}>
          <span className="bar-label">{r.label}</span>
          <span className="bar-track">
            <span
              className="bar-fill"
              style={{ width: `${(r.value / max) * 100}%`, background: r.color || 'var(--accent)' }}
            />
          </span>
          <span className="bar-value">{r.display}</span>
        </div>
      ))}
    </>
  )
}

function ChartCard({ title, children }) {
  return (
    <div className="chart-card">
      <h2 className="chart-title">{title}</h2>
      {children}
    </div>
  )
}

const h = (mins) => Math.round((mins || 0) / 60)

export default function InsightsTab() {
  const [games, setGames] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const statusMap = useStatusMap()

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [g, e] = await Promise.all([
        supabase
          .from('games')
          .select('title, environment, percent, playtime_minutes, earned_awards, last_played, length_minutes'),
        supabase.from('play_events').select('event_date, minutes_delta, achievements_delta'),
      ])
      if (cancelled) return
      setGames(g.data || [])
      setEvents(e.data || [])
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const stats = useMemo(() => {
    const totalMin = games.reduce((a, g) => a + (g.playtime_minutes || 0), 0)
    const played = games.filter((g) => g.last_played || (g.playtime_minutes || 0) > 0)
    const completed = games.filter((g) => (Number(g.percent) || 0) >= 100)
    const backlog = games.filter((g) => !(g.last_played || (g.playtime_minutes || 0) > 0))
    const achievements = games.reduce((a, g) => a + (g.earned_awards || 0), 0)

    const platMin = { xbox: 0, psn: 0, steam: 0 }
    for (const g of games) {
      const env = String(g.environment || '').toLowerCase()
      if (env in platMin) platMin[env] += g.playtime_minutes || 0
    }

    const buckets = { backlog: 0, under: 0, half: 0, near: 0, done: 0 }
    for (const g of games) {
      const pct = Number(g.percent) || 0
      const isPlayed = g.last_played || (g.playtime_minutes || 0) > 0
      if (!isPlayed) buckets.backlog++
      else if (pct >= 100) buckets.done++
      else if (pct >= 90) buckets.near++
      else if (pct >= 50) buckets.half++
      else buckets.under++
    }

    const top = [...games]
      .sort((a, b) => (b.playtime_minutes || 0) - (a.playtime_minutes || 0))
      .slice(0, 8)
      .map((g) => ({ label: g.title, value: g.playtime_minutes || 0, display: `${h(g.playtime_minutes)}h` }))

    // Monthly play from play_events deltas (last 6 months).
    const byMonth = {}
    for (const ev of events) {
      const key = String(ev.event_date || '').slice(0, 7)
      if (key) byMonth[key] = (byMonth[key] || 0) + (ev.minutes_delta || 0)
    }
    const now = new Date()
    const months = []
    for (let i = 5; i >= 0; i--) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
      months.push({
        label: dt.toLocaleDateString('en-US', { month: 'short' }),
        value: byMonth[key] || 0,
        display: `${h(byMonth[key])}h`,
      })
    }
    const monthTotal = months.reduce((a, m) => a + m.value, 0)

    return { totalMin, played, completed, backlog, achievements, platMin, buckets, top, months, monthTotal }
  }, [games, events])

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Insights</h1>
          <p className="page-subtitle">Your library at a glance.</p>
        </div>
        <Skeleton count={5} />
      </div>
    )
  }

  const kpis = [
    { label: 'Total hours', value: h(stats.totalMin).toLocaleString() },
    { label: 'Games played', value: stats.played.length },
    { label: 'Finished', value: games.filter((g) => effectiveStatus(g, statusMap) === 'finished').length },
    { label: 'Backlog', value: stats.backlog.length },
  ]

  const platformRows = [
    { label: 'Xbox', value: stats.platMin.xbox, display: `${h(stats.platMin.xbox)}h`, color: 'var(--xbox)' },
    { label: 'PlayStation', value: stats.platMin.psn, display: `${h(stats.platMin.psn)}h`, color: 'var(--psn)' },
    { label: 'Steam', value: stats.platMin.steam, display: `${h(stats.platMin.steam)}h`, color: 'var(--steam)' },
  ].filter((r) => r.value > 0)

  const bucketRows = [
    { label: 'Backlog', value: stats.buckets.backlog, display: String(stats.buckets.backlog) },
    { label: 'Under 50%', value: stats.buckets.under, display: String(stats.buckets.under) },
    { label: '50 - 89%', value: stats.buckets.half, display: String(stats.buckets.half) },
    { label: '90 - 99%', value: stats.buckets.near, display: String(stats.buckets.near) },
    { label: 'Complete', value: stats.buckets.done, display: String(stats.buckets.done) },
  ]

  const statusCounts = { backlog: 0, playing: 0, finished: 0, abandoned: 0 }
  for (const g of games) statusCounts[effectiveStatus(g, statusMap)]++
  const statusRows = [
    { label: 'Backlog', value: statusCounts.backlog, display: String(statusCounts.backlog) },
    { label: 'Playing', value: statusCounts.playing, display: String(statusCounts.playing) },
    { label: 'Finished', value: statusCounts.finished, display: String(statusCounts.finished) },
    { label: 'Abandoned', value: statusCounts.abandoned, display: String(statusCounts.abandoned) },
  ]

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Insights</h1>
        <p className="page-subtitle">Your library at a glance.</p>
      </div>

      <div className="stats-strip">
        {kpis.map((k) => (
          <div className="stat-cell" key={k.label}>
            <div className="stat-value">{k.value}</div>
            <div className="stat-label">{k.label}</div>
          </div>
        ))}
      </div>

      <ChartCard title="Hours by platform">
        {platformRows.length ? <Bars rows={platformRows} /> : <div className="chart-empty">No playtime yet.</div>}
      </ChartCard>

      <ChartCard title="By status">
        <Bars rows={statusRows} />
      </ChartCard>

      <ChartCard title="Achievement completion">
        <Bars rows={bucketRows} />
      </ChartCard>

      <ChartCard title="Most played">
        {stats.top.length ? <Bars rows={stats.top} /> : <div className="chart-empty">No playtime yet.</div>}
      </ChartCard>

      <ChartCard title="Play activity (last 6 months)">
        {stats.monthTotal > 0 ? (
          <Bars rows={stats.months} />
        ) : (
          <div className="chart-empty">
            Builds up as the daily sync detects new playtime. Check back after you have played a bit.
          </div>
        )}
      </ChartCard>
    </div>
  )
}
