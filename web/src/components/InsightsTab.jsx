import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import Skeleton from './Skeleton.jsx'
import { platformMeta } from '../lib/format.js'
import './insights.css'

/* ------------------------------------------------------------------ helpers */

const h = (mins) => Math.round((mins || 0) / 60)
const n = (v) => (Number(v) || 0).toLocaleString()
const num = (v) => Number(v) || 0

// Linear-interpolated quantile over an ascending-sorted array.
function quantile(sorted, p) {
  if (!sorted.length) return 0
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

const SHORT_GENRE = {
  'Role-playing (RPG)': 'RPG',
  'Hack and slash/Beat ’em up': 'Hack & slash',
  "Hack and slash/Beat 'em up": 'Hack & slash',
  'Real Time Strategy (RTS)': 'RTS',
  'Point-and-click': 'Point & click',
  'Card & Board Game': 'Card/Board',
}
const shortGenre = (g) => SHORT_GENRE[g] || g

/* ------------------------------------------------------------- chart shells */

function ChartCard({ title, sub, note, children }) {
  return (
    <div className="chart-card">
      <h2 className="chart-title">{title}</h2>
      {sub ? <div className="ins-sub">{sub}</div> : null}
      {children}
      {note ? <div className="ins-take">{note}</div> : null}
    </div>
  )
}

function Bars({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <>
      {rows.map((r, i) => (
        <div className="bar-row" key={i}>
          <span className="bar-label">{r.label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(r.value / max) * 100}%`, background: r.color || 'var(--accent)' }} />
          </span>
          <span className="bar-value">{r.display}</span>
        </div>
      ))}
    </>
  )
}

/* ------------------------------------------------------------------ boxplot */

function Boxplot({ d }) {
  const W = 340
  const PAD = 16
  const inner = W - 2 * PAD
  const x = (v) => PAD + (Math.max(0, Math.min(100, v)) / 100) * inner
  const ticks = [0, 25, 50, 75, 100]
  return (
    <svg className="ins-chart" viewBox="0 0 340 108" role="img" aria-label="Completion distribution boxplot">
      {/* axis */}
      <line x1={PAD} y1="80" x2={W - PAD} y2="80" stroke="var(--line)" strokeWidth="1" />
      {ticks.map((t) => (
        <text key={t} x={x(t)} y="94" fontSize="8.5" fill="var(--muted)" textAnchor="middle">{t}{t === 100 ? '%' : ''}</text>
      ))}
      {/* whiskers */}
      <line x1={x(d.min)} y1="44" x2={x(d.min)} y2="58" stroke="var(--muted)" strokeWidth="1.4" />
      <line x1={x(d.min)} y1="51" x2={x(d.p25)} y2="51" stroke="var(--muted)" strokeWidth="1.4" />
      <line x1={x(d.p75)} y1="51" x2={x(d.p90)} y2="51" stroke="var(--muted)" strokeWidth="1.4" />
      <line x1={x(d.p90)} y1="44" x2={x(d.p90)} y2="58" stroke="var(--muted)" strokeWidth="1.4" />
      {/* box */}
      <rect x={x(d.p25)} y="38" width={Math.max(1, x(d.p75) - x(d.p25))} height="26" rx="3" fill="var(--walnut)" stroke="var(--walnut-light)" strokeWidth="1" />
      {/* median */}
      <line x1={x(d.med)} y1="36" x2={x(d.med)} y2="66" stroke="var(--accent)" strokeWidth="2.4" />
      <text x={x(d.med)} y="32" fontSize="8.5" fill="var(--accent)" textAnchor="middle" fontWeight="700">med {Math.round(d.med)}%</text>
      {/* P90 dual-spec marker */}
      <line x1={x(d.p90)} y1="28" x2={x(d.p90)} y2="70" stroke="var(--amber)" strokeWidth="1" strokeDasharray="3 2" />
      <text x={x(d.p90)} y="24" fontSize="8" fill="var(--amber)" textAnchor="middle">P90 {Math.round(d.p90)}%</text>
      {/* max outlier */}
      {d.max > d.p90 ? (
        <>
          <circle cx={x(d.max)} cy="51" r="2.6" fill="var(--accent)" />
          <text x={x(d.max)} y="42" fontSize="8" fill="var(--muted)" textAnchor="middle">{Math.round(d.max)}%</text>
        </>
      ) : null}
    </svg>
  )
}

/* ------------------------------------------------------------------ scatter */

function Scatter({ pts }) {
  const left = 34, right = 330, top = 16, bottom = 168
  const iw = right - left, ih = bottom - top
  const hrsVals = pts.map((p) => Math.max(1, p.hrs))
  const lmin = Math.log10(Math.max(10, Math.min(...hrsVals)))
  const lmax = Math.log10(Math.max(...hrsVals))
  const span = lmax - lmin || 1
  const ymax = Math.max(5, Math.ceil((Math.max(...pts.map((p) => p.pct)) * 1.15) / 5) * 5)
  const X = (hrs) => left + ((Math.log10(Math.max(10, hrs)) - lmin) / span) * iw
  const Y = (pct) => top + ((ymax - pct) / ymax) * ih
  const R = (g) => Math.max(5, Math.min(14, 4 + Math.sqrt(g)))
  const midHrs = Math.round(Math.pow(10, (lmin + lmax) / 2))
  return (
    <svg className="ins-chart" viewBox="0 0 340 205" role="img" aria-label="Genre depth versus completion scatter">
      {/* axes */}
      <line x1={left} y1={bottom} x2={right} y2={bottom} stroke="var(--line)" />
      <line x1={left} y1={top} x2={left} y2={bottom} stroke="var(--line)" />
      <g fontSize="8" fill="var(--muted)">
        <text x={left} y={bottom + 14} textAnchor="middle">{Math.round(Math.min(...hrsVals))}h</text>
        <text x={(left + right) / 2} y={bottom + 14} textAnchor="middle">{midHrs}h</text>
        <text x={right} y={bottom + 14} textAnchor="end">{Math.max(...hrsVals).toLocaleString()}h</text>
        <text x={left - 6} y={top + 4} textAnchor="end">{ymax}%</text>
        <text x={left - 6} y={bottom} textAnchor="end">0%</text>
      </g>
      {pts.map((p, i) => {
        const cx = X(p.hrs), cy = Y(p.pct), r = R(p.games)
        const hot = i === 0
        // Alternate labels above/below the marker so the dense clusters don't collide.
        const ly = i % 2 === 0 ? cy - r - 3 : cy + r + 9
        return (
          <g key={p.label}>
            <circle cx={cx} cy={cy} r={r} fill={hot ? 'var(--accent)' : 'var(--walnut-light)'} opacity="0.5" stroke={hot ? 'var(--accent)' : 'var(--walnut-light)'} strokeWidth="1" />
            <text x={cx} y={ly} fontSize="8.5" fill="var(--muted)" textAnchor="middle">{p.label}</text>
          </g>
        )
      })}
    </svg>
  )
}

/* -------------------------------------------------------------------- donut */

function Donut({ segs, centerTop, centerLabel }) {
  const r = 46, C = 2 * Math.PI * r
  let cum = 0
  return (
    <svg className="ins-donut" viewBox="0 0 120 120" role="img" aria-label="Hours by platform">
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="16" />
      {segs.map((seg) => {
        const dash = seg.share * C
        const el = (
          <circle
            key={seg.label}
            cx="60" cy="60" r={r} fill="none" stroke={seg.color} strokeWidth="16"
            strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-cum}
            transform="rotate(-90 60 60)"
          />
        )
        cum += dash
        return el
      })}
      <text x="60" y="57" fontSize="19" fontWeight="700" fill="var(--text)" textAnchor="middle">{centerTop}</text>
      <text x="60" y="73" fontSize="9" fill="var(--muted)" textAnchor="middle">{centerLabel}</text>
    </svg>
  )
}

/* ---------------------------------------------------------------- histogram */

function Histogram({ bars, peakYear, recentFrom }) {
  const W = 340, PAD = 8, top = 12, bottom = 80
  const inner = W - 2 * PAD
  const step = inner / bars.length
  const bw = Math.max(3, step * 0.66)
  const max = Math.max(1, ...bars.map((b) => b.c))
  const peakIdx = bars.findIndex((b) => b.y === peakYear)
  const peakX = PAD + (peakIdx < 0 ? 0 : peakIdx) * step + step / 2
  return (
    <svg className="ins-chart" viewBox="0 0 340 98" role="img" aria-label="Library by release year">
      {bars.map((b, i) => {
        const bh = (b.c / max) * (bottom - top)
        const bx = PAD + i * step + (step - bw) / 2
        const color = b.y === peakYear ? 'var(--accent)' : b.y >= recentFrom ? 'var(--amber)' : 'var(--walnut-light)'
        return <rect key={b.y} x={bx} y={bottom - bh} width={bw} height={bh} rx="1.5" fill={color} />
      })}
      <line x1={PAD} y1={bottom} x2={W - PAD} y2={bottom} stroke="var(--line)" />
      <g fontSize="8" fill="var(--muted)">
        <text x={PAD} y="94" textAnchor="start">{bars[0]?.y}</text>
        <text x={peakX} y="8" textAnchor="middle" fill="var(--accent)">{peakYear}</text>
        <text x={W - PAD} y="94" textAnchor="end">{bars[bars.length - 1]?.y}</text>
      </g>
    </svg>
  )
}

/* -------------------------------------------------------------------- main */

const GAME_COLUMNS =
  'title, environment, genre, percent, playtime_minutes, earned_awards, last_played, release_year'

export default function InsightsTab() {
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data } = await supabase.from('games').select(GAME_COLUMNS)
      if (cancelled) return
      setGames(data || [])
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const stats = useMemo(() => {
    const total = games.length
    const totalMin = games.reduce((a, g) => a + num(g.playtime_minutes), 0)
    const achievements = games.reduce((a, g) => a + num(g.earned_awards), 0)
    const isPlayed = (g) => g.last_played || num(g.playtime_minutes) > 0

    const played = games.filter(isPlayed).length
    const progressed = games.filter((g) => num(g.percent) > 0).length
    const past50 = games.filter((g) => num(g.percent) >= 50).length
    const backlog = total - played

    // completion distribution (achievement %) over games with any progress
    const pcts = games.map((g) => num(g.percent)).filter((v) => v > 0).sort((a, b) => a - b)
    const box = {
      n: pcts.length,
      min: pcts[0] || 0,
      p25: quantile(pcts, 0.25),
      med: quantile(pcts, 0.5),
      p75: quantile(pcts, 0.75),
      p90: quantile(pcts, 0.9),
      max: pcts[pcts.length - 1] || 0,
    }

    // platforms
    // Was a third private copy of the platform labels, which is how "Steam" here
    // outlived "PC" everywhere else. One definition, in format.js.
    const P = {
      xbox: platformMeta('xbox'),
      psn: platformMeta('psn'),
      steam: platformMeta('steam'),
    }
    const plat = {}
    for (const g of games) {
      const e = String(g.environment || '').toLowerCase()
      if (!(e in P)) continue
      plat[e] = plat[e] || { key: e, ...P[e], min: 0, games: 0, aw: 0 }
      plat[e].min += num(g.playtime_minutes)
      plat[e].games += 1
      plat[e].aw += num(g.earned_awards)
    }
    const platforms = Object.values(plat).sort((a, b) => b.min - a.min)
    const platTotalMin = platforms.reduce((a, p) => a + p.min, 0) || 1
    const donutSegs = platforms.map((p) => ({ label: p.label, color: p.color, share: p.min / platTotalMin }))

    // genres (for scatter)
    const gg = {}
    for (const g of games) {
      const key = (g.genre && String(g.genre).trim()) || ''
      if (!key || key === '(none)') continue
      gg[key] = gg[key] || { genre: key, min: 0, games: 0, pcts: [] }
      gg[key].min += num(g.playtime_minutes)
      gg[key].games += 1
      if (num(g.percent) > 0) gg[key].pcts.push(num(g.percent))
    }
    const genresAll = Object.values(gg)
      .map((v) => ({
        label: shortGenre(v.genre),
        hrs: h(v.min),
        games: v.games,
        pct: v.pcts.length ? Math.round(v.pcts.reduce((a, b) => a + b, 0) / v.pcts.length) : 0,
      }))
      .filter((v) => v.hrs > 0)
      .sort((a, b) => b.hrs - a.hrs)
    const scatter = genresAll.slice(0, 8)
    const topGenre = genresAll[0]

    // top played games
    const byPlay = [...games].sort((a, b) => num(b.playtime_minutes) - num(a.playtime_minutes))
    const topPlayed = byPlay.slice(0, 6).map((g) => ({ label: g.title, value: num(g.playtime_minutes), display: `${h(g.playtime_minutes)}h` }))

    // records
    const mostPlayed = byPlay[0]
    const deepest = [...games].filter((g) => num(g.playtime_minutes) > 0).sort((a, b) => num(b.percent) - num(a.percent))[0]
    const mostAch = [...games].sort((a, b) => num(b.earned_awards) - num(a.earned_awards))[0]

    // release-year histogram
    const yc = {}
    for (const g of games) {
      const y = num(g.release_year)
      if (y > 1990 && y < 2035) yc[y] = (yc[y] || 0) + 1
    }
    const years = Object.entries(yc).map(([y, c]) => ({ y: +y, c })).sort((a, b) => a.y - b.y)
    const peakYear = years.reduce((best, cur) => (cur.c > best.c ? cur : best), years[0] || { y: 0, c: 0 }).y

    return {
      total, totalMin, achievements, played, progressed, past50, backlog, box,
      platforms, donutSegs, scatter, topGenre, topPlayed, mostPlayed, deepest, mostAch, years, peakYear,
    }
  }, [games])

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Insights</h1>
          <p className="page-subtitle">A read on how you actually play.</p>
        </div>
        <Skeleton count={5} />
      </div>
    )
  }

  const s = stats
  const pct = (v) => `${Math.round((v / Math.max(1, s.total)) * 100)}%`
  const eff = (p) => (p.min > 0 ? Math.round((p.aw / (p.min / 60)) * 100) : 0)

  const kpis = [
    { label: 'Hours', value: n(h(s.totalMin)) },
    { label: 'Achievements', value: n(s.achievements) },
    { label: 'Median %', value: `${Math.round(s.box.med)}%` },
    { label: 'Backlog', value: n(s.backlog) },
  ]

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Insights</h1>
        <p className="page-subtitle">A read on how you actually play.</p>
      </div>

      <div className="stats-strip">
        {kpis.map((k) => (
          <div className="stat-cell" key={k.label}>
            <div className="stat-value">{k.value}</div>
            <div className="stat-label">{k.label}</div>
          </div>
        ))}
      </div>

      <ChartCard
        title="Completion distribution"
        sub={`Achievement % across ${n(s.box.n)} games you've touched`}
        note={s.box.n > 0 ? `Half your games sit under ${Math.round(s.box.med)}% complete, you're a starter, and that's a real style.` : null}
      >
        {s.box.n > 0 ? <Boxplot d={s.box} /> : <div className="chart-empty">No completion data yet.</div>}
      </ChartCard>

      <ChartCard
        title="Starter → Finisher"
        sub="Where games drop off across your library"
        note={`You try almost everything (${pct(s.played)} played) but commit to few (${pct(s.past50)} past halfway).`}
      >
        <div className="ins-funnel">
          {[
            { label: 'Owned', value: s.total, w: 100, hot: false },
            { label: 'Played', value: s.played, w: (s.played / Math.max(1, s.total)) * 100, hot: false },
            { label: 'Progressed', value: s.progressed, w: (s.progressed / Math.max(1, s.total)) * 100, hot: false },
            { label: 'Past 50%', value: s.past50, w: (s.past50 / Math.max(1, s.total)) * 100, hot: true },
          ].map((f) => (
            <div className="ins-frow" key={f.label}>
              <span className="ins-flabel">{f.label} <b>{n(f.value)}</b></span>
              <span className="ins-ftrack"><span className={`ins-ffill${f.hot ? ' hot' : ''}`} style={{ width: `${f.w}%` }} /></span>
              <span className="ins-fpct">{Math.round(f.w)}%</span>
            </div>
          ))}
        </div>
      </ChartCard>

      <ChartCard
        title="Depth vs completion, by genre"
        sub="x: hours invested · y: avg completion · size: # games"
        note={s.scatter.length ? `${s.scatter[0].label} is your biggest investment; the low-completion cluster is where you bounce.` : null}
      >
        {s.scatter.length ? <Scatter pts={s.scatter} /> : <div className="chart-empty">No genre data yet.</div>}
      </ChartCard>

      <ChartCard title="Most played">
        {s.topPlayed.length ? <Bars rows={s.topPlayed} /> : <div className="chart-empty">No playtime yet.</div>}
      </ChartCard>

      <ChartCard title="Hours by platform">
        {s.platforms.length ? (
          <div className="ins-donut-wrap">
            <Donut segs={s.donutSegs} centerTop={`${Math.round(s.donutSegs[0].share * 100)}%`} centerLabel={s.platforms[0].label} />
            <div className="ins-legend">
              {s.platforms.map((p) => (
                <div className="row" key={p.key}>
                  <span className="dot" style={{ background: p.color }} />
                  <span>{p.label}: <b>{n(h(p.min))} h</b> · {eff(p)}/100h ach</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="chart-empty">No playtime yet.</div>
        )}
      </ChartCard>

      <ChartCard
        title="Library vintage"
        sub="When the games you own were released"
        note="A 2013-2020 core with a fresh recent wave, your Game Pass adds show up on the right."
      >
        {s.years.length ? <Histogram bars={s.years} peakYear={s.peakYear} recentFrom={2024} /> : <div className="chart-empty">No release-year data yet.</div>}
      </ChartCard>

      <ChartCard title="Hall of fame">
        <div className="ins-records">
          <div className="ins-rec"><div className="l">Most played</div><div className="v">{s.mostPlayed?.title || '-'}</div><div className="m">{h(s.mostPlayed?.playtime_minutes)} h</div></div>
          <div className="ins-rec"><div className="l">Most complete</div><div className="v">{s.deepest?.title || '-'}</div><div className="m">{Math.round(num(s.deepest?.percent))}% · {h(s.deepest?.playtime_minutes)} h</div></div>
          <div className="ins-rec"><div className="l">Most achievements</div><div className="v">{s.mostAch?.title || '-'}</div><div className="m">{n(num(s.mostAch?.earned_awards))} unlocked</div></div>
          <div className="ins-rec"><div className="l">Biggest genre</div><div className="v">{s.topGenre?.label || '-'}</div><div className="m">{n(s.topGenre?.hrs)} h</div></div>
        </div>
      </ChartCard>
    </div>
  )
}
