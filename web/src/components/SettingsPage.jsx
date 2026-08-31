import { useEffect, useState } from 'react'
import { OWNER_EMAIL, supabase } from '../lib/supabase.js'
import { authFetch, signOut } from '../lib/appAuth.js'
import {
  getTheme,
  setTheme,
  THEME_FAMILIES,
  getThemeFamily,
  setThemeFamily,
  getLogoStyle,
  setLogoStyle,
  getArtworkSize,
  setArtworkSize,
  getMotion,
  setMotion,
  getContrast,
  setContrast,
  getTransparency,
  setTransparency,
} from '../lib/theme.js'
import { useMountTransition } from '../lib/useMountTransition.js'
import { lockScroll } from '../lib/scrollLock.js'
import { MenuItem, ICONS, relTime } from './menuUI.jsx'
import { useNavConfig, setNavConfig } from '../lib/navConfig.js'
import LogoMark from './LogoMark.jsx'
import { useDialogA11y } from '../lib/useDialogA11y.js'

const REPO = 'ddibara5/GameDeck'
const SOURCE_URL = 'https://github.com/ddibara5/GameDeck'
const EXOPHASE_PROFILE_URL = 'https://www.exophase.com/user/Davizzle93/'

// Each platform now syncs directly from its own API. They fail independently,
// so each one gets its own freshness row: a dead PSN token used to be invisible
// until you noticed the playtime had stopped moving.
const DIRECT_SOURCES = [
  { key: 'steam', label: 'Steam' },
  { key: 'psn', label: 'PlayStation' },
  { key: 'xbox', label: 'Xbox' },
]

const CHATS_KEY = 'gamedeck_chats_v1'
const ACTIVE_CHAT_KEY = 'gamedeck_active_chat_v1'
const SYNC_LOCK_KEY = 'gamedeck_sync_lock_v1'
const LOCK_MS = 6 * 60 * 1000

const MODE_OPTIONS = [
  { key: 'dark', label: 'Dark' },
  { key: 'light', label: 'Light' },
  { key: 'system', label: 'System' },
]

const LOGO_STYLE_OPTIONS = [
  { key: 'theme', label: 'Theme default', sub: 'Chosen by each theme' },
  { key: 'classic', label: 'Classic', sub: 'Clean, flat layers' },
  { key: 'glass', label: 'Glass', sub: 'Translucent depth and highlights' },
]

const ARTWORK_SIZE_OPTIONS = [
  { key: 's', label: 'Small' },
  { key: 'm', label: 'Medium' },
  { key: 'l', label: 'Large' },
]

const MOTION_OPTIONS = [
  { key: 'system', label: 'System' },
  { key: 'standard', label: 'Standard' },
  { key: 'reduced', label: 'Reduced' },
]

const CONTRAST_OPTIONS = [
  { key: 'system', label: 'System' },
  { key: 'standard', label: 'Standard' },
  { key: 'high', label: 'High' },
]

const TRANSPARENCY_OPTIONS = [
  { key: 'system', label: 'System' },
  { key: 'standard', label: 'Standard' },
  { key: 'reduced', label: 'Reduced' },
]

export default function SettingsPage({ open, onClose, onOpenBar, onOpenDrawer }) {
  const { mounted, closing } = useMountTransition(open)
  const nav = useNavConfig()
  const [fallbackSync, setFallbackSync] = useState(null)
  const [latestPlay, setLatestPlay] = useState(null)
  const [sourceSync, setSourceSync] = useState({})
  const [version, setVersion] = useState(null)
  const [theme, setThemeState] = useState(() => getTheme())
  const [family, setFamily] = useState(() => getThemeFamily())
  const [logoStyle, setLogoStyleState] = useState(() => getLogoStyle())
  const [artworkSize, setArtworkSizeState] = useState(() => getArtworkSize())
  const [motion, setMotionState] = useState(() => getMotion())
  const [contrast, setContrastState] = useState(() => getContrast())
  const [transparency, setTransparencyState] = useState(() => getTransparency())
  // The open sub-pages, outermost first. Escape and the back-swipe pop one level
  // rather than dismissing Settings, and the stack keeps that behavior uniform.
  const [stack, setStack] = useState([])
  const push = (name) => setStack((s) => (s.includes(name) ? s : [...s, name]))
  const pop = () => setStack((s) => s.slice(0, -1))
  const depthOf = (name) => stack.indexOf(name)
  const [chatsCleared, setChatsCleared] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncNote, setSyncNote] = useState('')
  const dialogRef = useDialogA11y({ active: mounted, closeOnEscape: false })
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
      if (e.key !== 'Escape') return
      // Back one level, not out. Escape on a sub-page returning you all the way
      // to the app is the thing that makes a nested settings screen feel like a
      // trap door.
      if (stack.length) pop()
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mounted, onClose, stack.length])

  // Lock background scroll while the page is open, so the page behind it can't
  // scroll and its scrollbar doesn't show through.
  useEffect(() => {
    if (!mounted) return undefined
    return lockScroll()
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
      if (fromEdge && dx > 0 && e.cancelable) e.preventDefault()
      if (fromEdge && dx > BACK_DX) {
        if (stack.length) pop()
        else onClose()
        tracking = false
      }
    }
    const onEnd = () => {
      tracking = false
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
  }, [mounted, onClose, stack.length])

  // Load freshness data + version once when the page opens.
  useEffect(() => {
    if (!mounted) return undefined
    let cancelled = false

    ;(async () => {
      // sync_runs is written only by the Exophase fallback workflow, so it is
      // labelled as such. The direct syncs stamp direct_synced_at on the rows
      // they own instead, which is what the per-source rows below read.
      const [syncRes, actRes, ...srcRes] = await Promise.all([
        supabase.from('sync_runs').select('ran_at').not('games_seen', 'is', null).order('id', { ascending: false }).limit(1),
        supabase.from('games').select('last_played').not('last_played', 'is', null).order('last_played', { ascending: false }).limit(1),
        ...DIRECT_SOURCES.map((s) =>
          supabase
            .from('games')
            .select('direct_synced_at')
            .eq('environment', s.key)
            .not('direct_synced_at', 'is', null)
            .order('direct_synced_at', { ascending: false })
            .limit(1),
        ),
      ])
      if (cancelled) return
      if (syncRes.data && syncRes.data[0]) setFallbackSync(syncRes.data[0].ran_at)
      if (actRes.data && actRes.data[0]) setLatestPlay(actRes.data[0].last_played)

      const next = {}
      DIRECT_SOURCES.forEach((s, i) => {
        const row = srcRes[i] && srcRes[i].data && srcRes[i].data[0]
        if (row) next[s.key] = row.direct_synced_at
      })
      setSourceSync(next)

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
      res = await authFetch('/api/sync', { method: 'POST' })
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

  // Reopening Settings should land on the root list. Without this the page
  // remembers the sub-page you were on when you dismissed it, and the gear button
  // appears to open a random screen.
  useEffect(() => {
    if (!open) setStack([])
  }, [open])

  function changeTheme(pref) {
    setThemeState(setTheme(pref))
  }

  function changeFamily(key) {
    setFamily(setThemeFamily(key))
  }

  function changeLogoStyle(key) {
    setLogoStyleState(setLogoStyle(key))
  }

  function changeArtworkSize(key) {
    setArtworkSizeState(setArtworkSize(key))
  }

  if (!mounted) return null

  const locked = Date.now() < lockUntil
  const versionValue = version ? `${version.sha} · ${relTime(version.date) || ''}`.trim().replace(/·\s*$/, '').trim() : '-'

  const labelOf = (opts, key) => (opts.find((o) => o.key === key) || {}).label || '-'
  // Each Appearance row carries the setting it leads to, so the root list answers
  // "what is my theme" without opening anything. That is the whole reason these
  // three moved behind rows instead of staying a wall of controls: a sub-page you
  // have to open to read is worse than the wall it replaced.
  const familyValue = labelOf(THEME_FAMILIES, family)
  const themeValue = `${familyValue} · ${labelOf(MODE_OPTIONS, theme)}`
  const logoStyleValue = labelOf(LOGO_STYLE_OPTIONS, logoStyle)
  const artworkValue = labelOf(ARTWORK_SIZE_OPTIONS, artworkSize)
  const displayValue = [motion, contrast, transparency].every((value) => value === 'system')
    ? 'Follow System'
    : 'Customized'
  // The oldest of the four sync stamps, because the question this section answers
  // is "is anything stale", and the answer to that is never the freshest one.
  const syncStamps = [...DIRECT_SOURCES.map((s2) => sourceSync[s2.key]), fallbackSync].filter(Boolean)
  const oldestSync = syncStamps.length === DIRECT_SOURCES.length + 1
    ? syncStamps.reduce((a, b) => (new Date(b) < new Date(a) ? b : a))
    : null
  const sourcesValue = oldestSync ? `Oldest ${relTime(oldestSync)}` : '-'

  return (
    <div ref={dialogRef} className={`settings-page${closing ? ' closing' : ''}`} role="dialog" aria-modal="true" aria-label="Settings">
      <div className="settings-hd">
        <button type="button" className="settings-back" onClick={onClose} aria-label="Back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <h2 className="settings-hd-title">Settings</h2>
      </div>

      <div className="settings-body">
        <div className="settings-section">
          <div className="menu-sec-label">Appearance</div>
          <div className="settings-group">
            <MenuItem
              glyph={ICONS.appear}
              label="Appearance"
              sub="Theme, display and motion"
              value={themeValue}
              onClick={() => push('appearance')}
            />
          </div>
        </div>

        <div className="settings-section">
          <div className="menu-sec-label">Navigation</div>
          <div className="settings-group">
            {/* Two rows, not one. They edit two independent orders, and a single
                row leading to a page that edited both is what made the bar and
                the drawer feel like one thing. */}
            {/* The switch sits above the editor it governs, and says where the
                tabs go rather than what the switch does, because the strip
                vanishing already says that. */}
            <MenuItem
              glyph={ICONS.eye}
              label="Show bottom bar"
              sub="Everything stays in the drawer"
              toggle={nav.barShown}
              onClick={() => setNavConfig({ barShown: !nav.barShown })}
            />
            <MenuItem glyph={ICONS.nav} label="Bottom bar" sub="Which tabs, and in what order" onClick={onOpenBar} />
            <MenuItem glyph={ICONS.layers} label="Drawer" sub="Group order, and what each group holds" onClick={onOpenDrawer} />
          </div>
        </div>

        {/* One header, two cards. "Direct sources" and "Fallback" were architecture
            vocabulary, and worse, they put Exophase's timestamp in a different card
            from the three it is meant to be compared against. The job of this screen
            is spotting a stale source, which is a scan down one list.

            Latest play stays out of that list on purpose: it is when you last PLAYED,
            not when we last synced, so sitting among sync times it reads as staleness
            when nothing is wrong. */}
        <div className="settings-section">
          <div className="menu-sec-label">Data &amp; sync</div>
          <div className="settings-group">
            <MenuItem
              glyph={ICONS.refresh}
              label="Sync now"
              sub={syncNote || 'Pulls all four sources. Takes a few minutes.'}
              value={syncing ? 'Syncing' : 'Refresh'}
              valueAccent
              onClick={triggerRefresh}
              disabled={syncing || locked}
              chevron={false}
            />
            <MenuItem
              glyph={ICONS.clock}
              label="Latest play"
              sub="Newest session across all platforms"
              value={relTime(latestPlay) || '-'}
              disabled
              chevron={false}
            />
            {/* Four read-only timestamps and a profile link were five of the
                seventeen rows on the root list, and none of them is a control.
                They are what you open when something looks stale, so they move
                behind the one row that says whether anything IS - the OLDEST of
                the four, because the freshest can never answer that. */}
            <MenuItem
              glyph={ICONS.layers}
              label="Sources"
              sub="When each platform last reported"
              value={sourcesValue}
              onClick={() => push('sources')}
            />
          </div>
        </div>

        <div className="settings-section">
          <div className="menu-sec-label">Privacy &amp; device</div>
          <div className="settings-group">
            <MenuItem
              glyph={ICONS.key}
              label="Signed in"
              sub={OWNER_EMAIL}
              value="Sign out"
              valueAccent
              onClick={() => signOut()}
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

      <SubPage open={stack.includes('appearance')} depth={depthOf('appearance')} title="Appearance" onBack={pop}>
        <div className="settings-group">
          <MenuItem glyph={ICONS.appear} label="Theme" sub="The complete visual language" value={familyValue} onClick={() => push('themes')} />
          <MenuItem glyph={ICONS.spark} label="Light & dark" sub="Choose a mode or follow your device" value={labelOf(MODE_OPTIONS, theme)} onClick={() => push('mode')} />
          <MenuItem glyph={ICONS.eye} label="Display & motion" sub="Motion, contrast and transparency" value={displayValue} onClick={() => push('display')} />
          <MenuItem glyph={ICONS.layers} label="Logo style" sub="The mark used inside GameDeck" value={logoStyleValue} onClick={() => push('logo')} />
          <MenuItem glyph={ICONS.image} label="Game artwork" sub="One cover size across every tab" value={artworkValue} onClick={() => push('cards')} />
        </div>
        <p className="settings-note">
          A theme controls its own atmosphere, material, typography, shapes and motion. Background is no longer a separate setting.
        </p>
      </SubPage>

      <SubPage open={stack.includes('themes')} depth={depthOf('themes')} title="Theme" onBack={pop}>
        <div className="theme-gallery" role="radiogroup" aria-label="Visual theme">
          {THEME_FAMILIES.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`theme-card theme-card-${opt.key}${family === opt.key ? ' on' : ''}`}
              onClick={() => changeFamily(opt.key)}
              role="radio"
              aria-checked={family === opt.key}
            >
              <span className="theme-card-preview" aria-hidden="true">
                <span className="theme-card-grid" />
                <span className="theme-card-panel" />
                <span className="theme-card-chip" />
              </span>
              <span className="theme-card-copy">
                <span className="theme-card-eyebrow">{opt.eyebrow}</span>
                <b>{opt.label}</b>
                <span>{opt.description}</span>
              </span>
              <span className="theme-palette" aria-hidden="true">
                {(theme === 'light' ? opt.light : opt.dark).map((color) => (
                  <i key={color} style={{ background: color }} />
                ))}
              </span>
              <span className="theme-card-check" aria-hidden="true">✓</span>
            </button>
          ))}
        </div>
      </SubPage>

      <SubPage open={stack.includes('mode')} depth={depthOf('mode')} title="Light & dark" onBack={pop}>
        <Field label="Appearance mode" hint="System follows your device and updates automatically.">
          <Seg options={MODE_OPTIONS} value={theme} onPick={changeTheme} name="Light and dark mode" />
        </Field>
      </SubPage>

      <SubPage open={stack.includes('display')} depth={depthOf('display')} title="Display & motion" onBack={pop}>
        <Field label="Motion" hint="Reduced removes decorative movement and shortens transitions.">
          <Seg options={MOTION_OPTIONS} value={motion} onPick={(key) => setMotionState(setMotion(key))} name="Motion" />
        </Field>
        <Field label="Contrast" hint="High strengthens text, dividers and control boundaries.">
          <Seg options={CONTRAST_OPTIONS} value={contrast} onPick={(key) => setContrastState(setContrast(key))} name="Contrast" />
        </Field>
        <Field label="Transparency" hint="Reduced replaces glass with opaque surfaces.">
          <Seg options={TRANSPARENCY_OPTIONS} value={transparency} onPick={(key) => setTransparencyState(setTransparency(key))} name="Transparency" />
        </Field>
      </SubPage>

      <SubPage open={stack.includes('logo')} depth={depthOf('logo')} title="Logo style" onBack={pop}>
        <div className="logo-style-options" role="radiogroup" aria-label="In-app logo style">
          {LOGO_STYLE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`logo-style-option${logoStyle === opt.key ? ' on' : ''}`}
              onClick={() => changeLogoStyle(opt.key)}
              role="radio"
              aria-checked={logoStyle === opt.key}
            >
              <span className="logo-style-preview">
                <LogoMark variant={opt.key === 'theme' ? undefined : opt.key} className="logo-style-mark" />
              </span>
              <span className="logo-style-copy">
                <b>{opt.label}</b>
                <span>{opt.sub}</span>
              </span>
              <span className="logo-style-check" aria-hidden="true">✓</span>
            </button>
          ))}
        </div>
        <p className="settings-note">
          Theme default uses glass in Obsidian and the classic mark elsewhere. This changes the logo
          inside GameDeck; the installed Home Screen icon stays unchanged.
        </p>
      </SubPage>

      <SubPage open={stack.includes('sources')} depth={depthOf('sources')} title="Sources" onBack={pop}>
        <div className="settings-group">
          {DIRECT_SOURCES.map((src) => (
            <MenuItem
              key={src.key}
              glyph={ICONS.clock}
              label={src.label}
              value={relTime(sourceSync[src.key]) || '-'}
              disabled
              chevron={false}
            />
          ))}
          {/* Reads in parallel with the three above it; the subtitle carries the
              backup-source distinction the Fallback header used to. */}
          <MenuItem
            glyph={ICONS.clock}
            label="Exophase"
            sub="Backup source, fills what the direct APIs cannot"
            value={relTime(fallbackSync) || '-'}
            disabled
            chevron={false}
          />
          <MenuItem glyph={ICONS.link} label="Exophase profile" href={EXOPHASE_PROFILE_URL} />
        </div>
        <p className="settings-note">
          Each platform syncs from its own API and they fail independently, so a dead token shows
          up here as one row that stopped moving rather than as playtime that quietly stopped.
        </p>
      </SubPage>

      <SubPage open={stack.includes('cards')} depth={depthOf('cards')} title="Game artwork" onBack={pop}>
        <Field label="Cover size" hint="Medium is about 15% larger than the previous default">
          <Seg options={ARTWORK_SIZE_OPTIONS} value={artworkSize} onPick={changeArtworkSize} name="Game artwork size" />
        </Field>
        <div className="settings-artwork-scope" aria-label="Applies everywhere">
          <strong>Applies everywhere</strong>
          <ul>
            <li>Home cards</li>
            <li>Library rows</li>
            <li>Browse, For You, and search</li>
            <li>Release Watch and Wishlist</li>
            <li>Rankings, Activity, and Insights</li>
          </ul>
        </div>
      </SubPage>
    </div>
  )
}

/* ---------- the second level ----------

   A sub-page is the same shell as the page it sits on, one z-index up, so the
   slide-in, the header and the scroll behaviour are the settings page's and not a
   second implementation of them. It is mounted inside <SettingsPage> but position:
   fixed, so nesting costs nothing in layout and buys the shared state. */

function SubPage({ open, depth = 0, title, onBack, children }) {
  const { mounted, closing } = useMountTransition(open)
  const dialogRef = useDialogA11y({ active: mounted, onClose: onBack })
  if (!mounted) return null
  // z-index by position in the stack rather than a class per level, so a fourth
  // level is a number and not another CSS rule. Clamped at 0 so a page that is
  // mid-close (depth is already -1, because the stack popped before the exit
  // animation finished) does not fall under the root list on the way out.
  const z = 211 + Math.max(0, depth)
  return (
    <div
      ref={dialogRef}
      className={`settings-page settings-sub${closing ? ' closing' : ''}`}
      style={{ zIndex: z }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="settings-hd">
        <button type="button" className="settings-back" onClick={onBack} aria-label="Back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <h2 className="settings-hd-title">{title}</h2>
      </div>
      <div className="settings-body">{children}</div>
    </div>
  )
}

// A labelled control, in the same margin as a settings card so a sub-page of
// segmented controls lines up with a sub-page of rows.
function Field({ label, hint, children }) {
  return (
    <div className="settings-field">
      <div className="settings-field-hd">
        <div className="menu-accent-label">{label}</div>
      </div>
      {children}
      {hint ? <div className="settings-field-hint">{hint}</div> : null}
    </div>
  )
}

function Seg({ options, value, onPick, name }) {
  return (
    <div className="seg" role="group" aria-label={name}>
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          className={`seg-btn${value === opt.key ? ' active' : ''}`}
          onClick={() => onPick(opt.key)}
          aria-pressed={value === opt.key}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
