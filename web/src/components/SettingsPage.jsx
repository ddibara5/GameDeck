import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { getAppKey, setAppKey, promptForKey } from '../lib/appAuth.js'
import { getTheme, setTheme, getAccent, setAccent } from '../lib/theme.js'
import { useMountTransition } from '../lib/useMountTransition.js'
import { MenuItem, ICONS, relTime } from './menuUI.jsx'

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

// Color themes. `ring` is the swatch's outer disc (a theme surface), `dot` the
// inner accent. Palettes live in index.css under :root[data-accent="..."].
const ACCENT_OPTIONS = [
  { key: 'walnut', label: 'Walnut', ring: '#232120', dot: '#c8a97e' },
  { key: 'slate', label: 'Slate', ring: '#1d2026', dot: '#86a0c2' },
  { key: 'sage', label: 'Sage', ring: '#1e211a', dot: '#9aab83' },
  { key: 'plum', label: 'Plum', ring: '#201d23', dot: '#b191b0' },
  { key: 'graphite', label: 'Graphite', ring: '#202124', dot: '#98a2ae' },
]

export default function SettingsPage({ open, onClose }) {
  const { mounted, closing } = useMountTransition(open)
  const [lastSync, setLastSync] = useState(null)
  const [exoActivity, setExoActivity] = useState(null)
  const [version, setVersion] = useState(null)
  const [keySet, setKeySet] = useState(() => Boolean(getAppKey()))
  const [theme, setThemeState] = useState(() => getTheme())
  const [accent, setAccentState] = useState(() => getAccent())
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
    if (!mounted) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mounted, onClose])

  // Lock background scroll while the page is open, so the page behind it can't
  // scroll and its scrollbar doesn't show through.
  useEffect(() => {
    if (!mounted) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mounted])

  // Swipe to go back: iOS-style edge-back. Start near the left edge and drag
  // right to dismiss the page.
  useEffect(() => {
    if (!mounted) return undefined
    const EDGE_PX = 24
    const BACK_DX = 60
    let startX = 0
    let startY = 0
    let tracking = false
    let fromEdge = false

    const onStart = (e) => {
      const t = e.touches && e.touches[0]
      if (!t) return
      startX = t.clientX
      startY = t.clientY
      fromEdge = startX <= EDGE_PX
      tracking = true
    }
    const onMove = (e) => {
      if (!tracking) return
      const t = e.touches && e.touches[0]
      if (!t) return
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      // Only act on a clearly horizontal gesture, so vertical scrolling is untouched.
      if (Math.abs(dx) <= Math.abs(dy)) return
      if (fromEdge && dx > BACK_DX) {
        onClose()
        tracking = false
      }
    }
    const onEnd = () => {
      tracking = false
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
  }, [mounted, onClose])

  // Load freshness data + version once when the page opens.
  useEffect(() => {
    if (!mounted) return undefined
    let cancelled = false

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
  }, [mounted])

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

  function changeAccent(key) {
    setAccentState(setAccent(key))
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

  if (!mounted) return null

  const locked = Date.now() < lockUntil
  const versionValue = version ? `${version.sha} · ${relTime(version.date) || ''}`.trim().replace(/·\s*$/, '').trim() : '-'

  return (
    <div className={`settings-page${closing ? ' closing' : ''}`} role="dialog" aria-label="Settings">
      <div className="settings-hd">
        <button type="button" className="settings-back" onClick={onClose} aria-label="Back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <h2 className="settings-hd-title">Settings</h2>
      </div>

      <div className="settings-body">
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
          <div className="menu-accent">
            <div className="menu-accent-label">Theme</div>
            <div className="accent-row" role="group" aria-label="Color theme">
              {ACCENT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  className={`accent-opt${accent === opt.key ? ' on' : ''}`}
                  onClick={() => changeAccent(opt.key)}
                  aria-pressed={accent === opt.key}
                  title={opt.label}
                >
                  <span className="accent-dot" style={{ background: opt.ring }}>
                    <i style={{ background: opt.dot }} />
                  </span>
                  <span className="accent-name">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="settings-section">
          <div className="menu-sec-label">Data &amp; sync</div>
          <div className="settings-group">
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
        </div>

        <div className="settings-section">
          <div className="menu-sec-label">Privacy &amp; device</div>
          <div className="settings-group">
            <MenuItem
              glyph={ICONS.key}
              label="Device access"
              sub={keySet ? 'Access key saved on this device' : 'No access key on this device'}
              value={keySet ? 'Forget' : 'Enter'}
              valueAccent
              onClick={toggleKey}
              chevron={false}
            />
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
          </div>
        </div>

        <div className="settings-section">
          <div className="menu-sec-label">About</div>
          <div className="settings-group">
            <MenuItem glyph={ICONS.info} label="Version" value={versionValue} disabled chevron={false} />
            <MenuItem glyph={ICONS.code} label="Source" value="GitHub" href={SOURCE_URL} />
          </div>
        </div>
      </div>
    </div>
  )
}
