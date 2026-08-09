import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { getAppKey, setAppKey, promptForKey } from '../lib/appAuth.js'
import { getTheme, setTheme } from '../lib/theme.js'

const REPO = 'ddibara5/GameDeck'
const SOURCE_URL = 'https://github.com/ddibara5/GameDeck'
const EXOPHASE_PROFILE_URL = 'https://www.exophase.com/user/Davizzle93/'

const CHATS_KEY = 'gamedeck_chats_v1'
const ACTIVE_CHAT_KEY = 'gamedeck_active_chat_v1'
const SYNC_LOCK_KEY = 'gamedeck_sync_lock_v1'
const LOCK_MS = 6 * 60 * 1000

const THEME_OPTIONS = [
  { key: 'dark', label: 'Dark' },
  { key: 'light', label: 'Light' },
  { key: 'system', label: 'System' },
]

function relTime(ts) {
  if (!ts) return null
  const diff = Date.now() - new Date(ts).getTime()
  if (Number.isNaN(diff)) return null
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const chev = (
  <svg className="menu-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 6l6 6-6 6" />
  </svg>
)

function icon(children) {
  return (
    <svg className="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

const ICONS = {
  refresh: icon(<><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></>),
  clock: icon(<><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 2" /></>),
  link: icon(<><path d="M14 3h7v7" /><path d="M10 14 21 3" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></>),
  appear: icon(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" /></>),
  spark: icon(<path d="M12 3l1.8 4.9L19 9l-4.9 1.8L12 16l-1.8-5.3L5 9l5.2-1.1z" />),
  key: icon(<><circle cx="8" cy="15" r="4" /><path d="M11 12l8-8 2 2M18 6l2 2" /></>),
  info: icon(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>),
  code: icon(<><path d="M8 9l-4 3 4 3M16 9l4 3-4 3" /></>),
}

function MenuItem({ glyph, label, sub, value, valueAccent, href, onClick, disabled, chevron = true }) {
  const body = (
    <>
      {glyph}
      <span className="menu-label">
        {label}
        {sub ? <span className="menu-sub">{sub}</span> : null}
      </span>
      {value ? <span className={`menu-value${valueAccent ? ' accent' : ''}`}>{value}</span> : null}
      {chevron && !disabled ? chev : null}
    </>
  )
  if (href) {
    return (
      <a className="menu-item" href={href} target="_blank" rel="noreferrer">
        {body}
      </a>
    )
  }
  return (
    <button type="button" className="menu-item" onClick={onClick} disabled={disabled}>
      {body}
    </button>
  )
}

export default function Menu({ open, onClose }) {
  const [lastSync, setLastSync] = useState(null)
  const [exoActivity, setExoActivity] = useState(null)
  const [version, setVersion] = useState(null)
  const [keySet, setKeySet] = useState(() => Boolean(getAppKey()))
  const [theme, setThemeState] = useState(() => getTheme())
  const [chatsCleared, setChatsCleared] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncNote, setSyncNote] = useState('')
  const [lockUntil, setLockUntil] = useState(() => {
    try {
      return Number(sessionStorage.getItem(SYNC_LOCK_KEY)) || 0
    } catch {
      return 0
    }
  })

  // Close on Escape.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Load freshness data + version each time the drawer opens.
  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    setChatsCleared(false)
    setKeySet(Boolean(getAppKey()))
    setThemeState(getTheme())

    ;(async () => {
      const [syncRes, actRes] = await Promise.all([
        supabase.from('sync_runs').select('ran_at').not('games_seen', 'is', null).order('id', { ascending: false }).limit(1),
        supabase.from('games').select('last_played').not('last_played', 'is', null).order('last_played', { ascending: false }).limit(1),
      ])
      if (cancelled) return
      if (syncRes.data && syncRes.data[0]) setLastSync(syncRes.data[0].ran_at)
      if (actRes.data && actRes.data[0]) setExoActivity(actRes.data[0].last_played)

      try {
        const r = await fetch(`https://api.github.com/repos/${REPO}/commits/main`, {
          headers: { Accept: 'application/vnd.github+json' },
        })
        if (r.ok) {
          const j = await r.json()
          if (!cancelled) setVersion({ sha: String(j.sha || '').slice(0, 7), date: j.commit?.committer?.date })
        }
      } catch {
        /* offline or rate-limited: leave version unknown */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open])

  async function triggerRefresh() {
    if (syncing || Date.now() < lockUntil) return
    setSyncing(true)
    setSyncNote('Starting a sync')
    let res
    try {
      res = await fetch('/api/sync', { method: 'POST' })
    } catch {
      setSyncing(false)
      setSyncNote('Could not reach the sync service.')
      return
    }
    setSyncing(false)
    if (res.status === 202 || res.status === 409) {
      const until = Date.now() + LOCK_MS
      setLockUntil(until)
      try {
        sessionStorage.setItem(SYNC_LOCK_KEY, String(until))
      } catch {
        /* ignore */
      }
      setSyncNote(res.status === 409 ? 'A sync is already running.' : 'Sync started, updates land in a few minutes.')
    } else if (res.status === 503) {
      setSyncNote('Refresh is not set up yet.')
    } else {
      setSyncNote('Could not start a sync. Please try again.')
    }
  }

  function clearChats() {
    if (!window.confirm('Clear all recommender chat history on this device?')) return
    try {
      localStorage.removeItem(CHATS_KEY)
      sessionStorage.removeItem(ACTIVE_CHAT_KEY)
    } catch {
      /* ignore */
    }
    setChatsCleared(true)
  }

  function changeTheme(pref) {
    setThemeState(setTheme(pref))
  }

  function toggleKey() {
    if (getAppKey()) {
      if (!window.confirm('Forget the Discover access key on this device? You will be asked for it next time you open Discover.')) return
      setAppKey(null)
      setKeySet(false)
    } else {
      const k = promptForKey()
      if (k) setKeySet(true)
    }
  }

  if (!open) return null

  const locked = Date.now() < lockUntil
  const versionValue = version ? `${version.sha} · ${relTime(version.date) || ''}`.trim().replace(/·\s*$/, '').trim() : '-'

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Menu">
        <div className="drawer-head">
          <div className="drawer-brand">
            <svg style={{ width: 34, height: 36, flex: 'none' }} viewBox="130 105 252 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <polygon points="138,306 256,365 256,399 138,340" fill="#792d08" />
              <polygon points="374,306 256,365 256,399 374,340" fill="#5c2206" />
              <polygon points="256,247 374,306 256,365 138,306" fill="#9a3b0c" />
              <polygon points="138,239 256,298 256,332 138,273" fill="#9a3b0c" />
              <polygon points="374,239 256,298 256,332 374,273" fill="#792d08" />
              <polygon points="256,180 374,239 256,298 138,239" fill="#c85c15" />
              <polygon points="138,172 256,231 256,265 138,206" fill="#d97716" />
              <polygon points="374,172 256,231 256,265 374,206" fill="#b4590f" />
              <polygon points="256,113 374,172 256,231 138,172" fill="#f5a623" />
            </svg>
            <span className="brand-word">Game<b>Deck</b></span>
          </div>
        </div>

        <div className="menu-sec">
          <div className="menu-sec-label">Data &amp; sync</div>
          <MenuItem
            glyph={ICONS.refresh}
            label="Refresh library"
            sub={syncNote || null}
            value={syncing ? 'Syncing' : 'Refresh'}
            valueAccent
            onClick={triggerRefresh}
            disabled={syncing || locked}
            chevron={false}
          />
          <MenuItem glyph={ICONS.clock} label="Last sync" value={relTime(lastSync) || '-'} disabled chevron={false} />
          <MenuItem
            glyph={ICONS.clock}
            label="Exophase activity"
            sub="Newest play Exophase has recorded"
            value={relTime(exoActivity) || '-'}
            disabled
            chevron={false}
          />
          <MenuItem glyph={ICONS.link} label="Exophase profile" href={EXOPHASE_PROFILE_URL} />
        </div>

        <div className="menu-divider" />

        <div className="menu-sec">
          <div className="menu-sec-label">Settings</div>
          <div className="menu-appearance">
            <div className="menu-appearance-head">
              {ICONS.appear}
              <span className="menu-label">Appearance</span>
            </div>
            <div className="seg" role="group" aria-label="Appearance">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  className={`seg-btn${theme === opt.key ? ' active' : ''}`}
                  onClick={() => changeTheme(opt.key)}
                  aria-pressed={theme === opt.key}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <MenuItem
            glyph={ICONS.spark}
            label="Recommender history"
            sub={chatsCleared ? 'Cleared on this device' : null}
            value={chatsCleared ? 'Cleared' : 'Clear'}
            valueAccent={!chatsCleared}
            onClick={clearChats}
            disabled={chatsCleared}
            chevron={false}
          />
          <MenuItem
            glyph={ICONS.key}
            label="Device access"
            sub={keySet ? 'Access key saved on this device' : 'No access key on this device'}
            value={keySet ? 'Forget' : 'Enter'}
            valueAccent
            onClick={toggleKey}
            chevron={false}
          />
        </div>

        <div className="menu-divider" />

        <div className="menu-sec">
          <div className="menu-sec-label">About</div>
          <MenuItem glyph={ICONS.info} label="Version" value={versionValue} disabled chevron={false} />
          <MenuItem glyph={ICONS.code} label="Source" value="GitHub" href={SOURCE_URL} />
        </div>

        <div className="menu-foot">GameDeck</div>
      </aside>
    </>
  )
}
