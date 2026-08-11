import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchNews, groupByWeek, hostOf } from '../lib/news.js'
import Skeleton from './Skeleton.jsx'
import './news.css'

export default function NewsTab() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    ;(async () => {
      setLoading(true)
      const data = await fetchNews()
      if (!mountedRef.current) return
      setRows(data)
      setLoading(false)
    })()
    return () => {
      mountedRef.current = false
    }
  }, [])

  const groups = useMemo(() => groupByWeek(rows), [rows])

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">News</h1>
        <p className="page-subtitle">This week in gaming, curated.</p>
      </div>

      {loading ? (
        <div style={{ padding: '0 16px' }}>
          <Skeleton count={4} />
        </div>
      ) : groups.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No news yet</div>
          <div>Your weekly gaming digest lands here every Sunday. Check back soon.</div>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.weekOf}>
            <div className="news-week-label">{weekLabel(group.weekOf)}</div>
            <div className="news-list">
              {group.items.map((item) => (
                <NewsCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

function NewsCard({ item }) {
  const [imgFailed, setImgFailed] = useState(false)
  const lead = item.sources[0] || null
  const fav = lead ? faviconFor(lead.url) : ''
  const when = relTime(item.publishedAt)
  const sourceLabel =
    item.sources.length <= 1
      ? (lead ? lead.name : '')
      : `${item.sources.length} sources`

  return (
    <article className="news-card">
      {item.image && !imgFailed ? (
        <img
          className="news-card-img"
          src={item.image}
          alt=""
          loading="lazy"
          onError={() => setImgFailed(true)}
        />
      ) : null}
      <div className="news-card-body">
        <div className="news-meta">
          {fav ? <img className="news-meta-fav" src={fav} alt="" width="16" height="16" /> : null}
          {sourceLabel ? <span className="news-meta-source">{sourceLabel}</span> : null}
          {when ? <span className="news-meta-time">{when}</span> : null}
        </div>
        <h2 className="news-card-title">{item.title}</h2>
        <p className="news-card-summary">{item.summary}</p>
        <div className="news-sources">
          {item.sources.map((s, i) => (
            <span key={s.url + i}>
              {i > 0 ? <span className="news-source-sep" aria-hidden="true">|</span> : null}
              <a
                className="news-source-link"
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {item.sources.length === 1 ? 'Read article →' : `${s.name} →`}
              </a>
            </span>
          ))}
        </div>
      </div>
    </article>
  )
}

// --- helpers ---------------------------------------------------------------

function faviconFor(url) {
  const host = hostOf(url)
  return host ? `https://www.google.com/s2/favicons?domain=${host}&sz=32` : ''
}

function relTime(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (!then || isNaN(then)) return ''
  const diffH = Math.round((Date.now() - then) / 3600000)
  if (diffH < 1) return 'just now'
  if (diffH < 24) return `${diffH}h ago`
  const d = Math.round(diffH / 24)
  return d === 1 ? '1 day ago' : `${d} days ago`
}

// week_of is 'YYYY-MM-DD' (Monday). Label relative to the current week.
function weekLabel(weekOf) {
  const monday = (dt) => {
    const x = new Date(dt)
    const day = (x.getDay() + 6) % 7
    x.setDate(x.getDate() - day)
    x.setHours(0, 0, 0, 0)
    return x
  }
  const d = new Date(`${weekOf}T00:00:00`)
  if (isNaN(d.getTime())) return 'Recent'
  const diffWeeks = Math.round((monday(new Date()) - monday(d)) / (7 * 86400000))
  if (diffWeeks <= 0) return 'This week'
  if (diffWeeks === 1) return 'Last week'
  return `Week of ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}
