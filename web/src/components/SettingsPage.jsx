import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { getAppKey, setAppKey, promptForKey } from '../lib/appAuth.js'
import {
  getTheme,
  setTheme,
  getAccent,
  setAccent,
  getShelfSize,
  setShelfSize,
  getListSize,
  setListSize,
  getArtAccent,
  setArtAccent,
} from '../lib/theme.js'
import {
  getGround,
  setGround,
  GROUND_OPTIONS,
  isArtGround,
  getPinnedGame,
  setPinnedGame,
  getGroundIntensity,
  setGroundIntensity,
  refreshArtAccent,
} from '../lib/ground.js'
import GamePinPicker from './GamePinPicker.jsx'
import { useMountTransition } from '../lib/useMountTransition.js'
import { lockScroll } from '../lib/scrollLock.js'
import { MenuItem, ICONS, relTime } from './menuUI.jsx'
import { useNavConfig, setNavConfig } from '../lib/navConfig.js'

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

const THEME_OPTIONS = [
  { key: 'dark', label: 'Dark' },
  { key: 'light', label: 'Light' },
  { key: 'system', label: 'System' },
]

// Color themes. `ring` is the swatch's outer disc (a theme neutral), `dot` the
// inner accent. Palettes live in index.css under :root[data-accent="..."].
//
// Each theme carries BOTH modes, because a swatch should preview the theme as it
// will actually look right now. The single dark-only set these replaced meant
// light mode showed a dark disc - the "dark ring" - around a pale dark-mode
// accent that was never the colour you would get. Which pair is used is decided
// in CSS off data-theme, not here, so "System" resolves for free.
const ACCENT_OPTIONS = [
  { key: 'walnut', label: 'Walnut', ring: '#232120', dot: '#c8a97e', ringLight: '#efe8dd', dotLight: '#9c7449' },
  { key: 'slate', label: 'Slate', ring: '#1d2026', dot: '#86a0c2', ringLight: '#e7eaef', dotLight: '#4d6d95' },
  { key: 'sage', label: 'Sage', ring: '#1e211a', dot: '#9aab83', ringLight: '#e9ebe0', dotLight: '#5e7046' },
  { key: 'plum', label: 'Plum', ring: '#201d23', dot: '#b191b0', ringLight: '#ece6ed', dotLight: '#7c567b' },
  { key: 'graphite', label: 'Graphite', ring: '#202124', dot: '#98a2ae', ringLight: '#e8e9ec', dotLight: '#59626f' },
]

// Poster width on horizontal rails (Continue Playing, Discover, wishlist, Game Pass).
const SHELF_SIZE_OPTIONS = [
  { key: 's', label: 'Small' },
  { key: 'm', label: 'Medium' },
  { key: 'l', label: 'Large' },
]

// Library / Discover list-row thumbnail + title size.
const LIST_SIZE_OPTIONS = [
  { key: 'compact', label: 'Compact' },
  { key: 'comfortable', label: 'Comfortable' },
  { key: 'large', label: 'Large' },
]

export default function SettingsPage({ open, onClose, onOpenBar, onOpenDrawer }) {
  const { mounted, closing } = useMountTransition(open)
  const nav = useNavConfig()
  const [fallbackSync, setFallbackSync] = useState(null)
  const [latestPlay, setLatestPlay] = useState(null)
  const [sourceSync, setSourceSync] = useState({})
  const [version, setVersion] = useState(null)
  const [keySet, setKeySet] = useState(() => Boolean(getAppKey()))
  const [theme, setThemeState] = useState(() => getTheme())
  const [accent, setAccentState] = useState(() => getAccent())
  const [shelfSize, setShelfSizeState] = useState(() => getShelfSize())
  const [listSize, setListSizeState] = useState(() => getListSize())
  const [ground, setGroundState] = useState(() => getGround())
  const [pin, setPinState] = useState(() => getPinnedGame())
  const [artAccent, setArtAccentState] = useState(() => getArtAccent())
  const [intensity, setIntensityState] = useState(() => getGroundIntensity())
  // The open sub-pages, outermost first. A single `sub` string was enough while
  // every second level was a leaf; Background now leads to a game picker, so the
  // page has a third level and the thing Escape and the back-swipe do is POP, not
  // clear. A stack says that once and every level after this one is free.
  const [stack, setStack] = useState([])
  const push = (name) => setStack((s) => (s.includes(name) ? s : [...s, name]))
  const pop = () => setStack((s) => s.slice(0, -1))
  const depthOf = (name) => stack.indexOf(name)
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
    window.addEventListener('touchmove', onMove, { passive: true })
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

  // Reopening Settings should land on the root list. Without this the page
  // remembers the sub-page you were on when you dismissed it, and the gear button
  // appears to open a random screen.
  useEffect(() => {
    if (!open) setStack([])
  }, [open])

  // Both of these move the neutrals the art accent is clamped against, so both
  // re-run the clamp. Without it, switching from Walnut to Slate leaves an accent
  // solved against Walnut's --surface sitting on Slate's, and the guarantee this
  // whole feature rests on is quietly no longer true.
  function changeTheme(pref) {
    setThemeState(setTheme(pref))
    refreshArtAccent()
  }

  function changeAccent(key) {
    setAccentState(setAccent(key))
    refreshArtAccent()
  }

  function changeArtAccent(on) {
    setArtAccentState(setArtAccent(on))
    refreshArtAccent()
  }

  function changeShelfSize(key) {
    setShelfSizeState(setShelfSize(key))
  }

  function changeListSize(key) {
    setListSizeState(setListSize(key))
  }

  function changeGround(key) {
    setGroundState(setGround(key))
  }

  function changeIntensity(t) {
    setIntensityState(setGroundIntensity(t))
  }

  function changePin(game) {
    setPinState(setPinnedGame(game))
    // Choosing a picture is choosing the source. Landing back on a Background page
    // still reading "Now playing" after picking a game is the version where the
    // picker appears to have done nothing.
    if (getGround() !== 'pinned') setGroundState(setGround('pinned'))
    pop()
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

  const labelOf = (opts, key) => (opts.find((o) => o.key === key) || {}).label || '-'
  // Each Appearance row carries the setting it leads to, so the root list answers
  // "what is my theme" without opening anything. That is the whole reason these
  // three moved behind rows instead of staying a wall of controls: a sub-page you
  // have to open to read is worse than the wall it replaced.
  const themeValue = `${labelOf(THEME_OPTIONS, theme)} · ${labelOf(ACCENT_OPTIONS, accent)}`
  const cardsValue = `${labelOf(SHELF_SIZE_OPTIONS, shelfSize)} · ${labelOf(LIST_SIZE_OPTIONS, listSize)}`
  const groundValue = labelOf(GROUND_OPTIONS, ground)
  // The oldest of the four sync stamps, because the question this section answers
  // is "is anything stale", and the answer to that is never the freshest one.
  const syncStamps = [...DIRECT_SOURCES.map((s2) => sourceSync[s2.key]), fallbackSync].filter(Boolean)
  const oldestSync = syncStamps.length === DIRECT_SOURCES.length + 1
    ? syncStamps.reduce((a, b) => (new Date(b) < new Date(a) ? b : a))
    : null
  const sourcesValue = oldestSync ? `Oldest ${relTime(oldestSync)}` : '-'

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
        <div className="settings-section">
          <div className="menu-sec-label">Appearance</div>
          <div className="settings-group">
            <MenuItem glyph={ICONS.appear} label="Theme" sub="Light or dark, and the color" value={themeValue} onClick={() => push('theme')} />
            <MenuItem glyph={ICONS.image} label="Background" sub="What sits behind every tab" value={groundValue} onClick={() => push('background')} />
            <MenuItem glyph={ICONS.layers} label="Card sizing" sub="Posters and list rows" value={cardsValue} onClick={() => push('cards')} />
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

      <SubPage open={stack.includes('theme')} depth={depthOf('theme')} title="Theme" onBack={pop}>
        <Field label="Appearance">
          <Seg options={THEME_OPTIONS} value={theme} onPick={changeTheme} name="Appearance" />
        </Field>
        <Field label="Color">
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
                <span
                  className="accent-dot"
                  style={{
                    '--sw-ring': opt.ring,
                    '--sw-dot': opt.dot,
                    '--sw-ring-l': opt.ringLight,
                    '--sw-dot-l': opt.dotLight,
                  }}
                >
                  <i />
                </span>
                <span className="accent-name">{opt.label}</span>
              </button>
            ))}
          </div>
        </Field>

        {/* A flag over the palette, not a sixth swatch. The five palettes carry
            tuned NEUTRALS as well as an accent and there is no artwork-derived
            --bg or --surface, so this replaces one token and leaves the rest of
            the theme alone. With no picture behind the app it simply has no
            effect and the palette's own accent shows. */}
        <div className="settings-group">
          <MenuItem
            glyph={ICONS.image}
            label="Accent from the background"
            sub={
              isArtGround(ground)
                ? 'Sampled from the picture, then darkened or lightened until it clears the contrast bar'
                : 'Turn on a picture background to see it'
            }
            toggle={artAccent}
            onClick={() => changeArtAccent(!artAccent)}
          />
        </div>
      </SubPage>

      {/* No preview swatch on these rows, because the page IS the preview: the
          settings overlay paints the ground itself (see index.css), so tapping a
          source changes the screen you are standing on. A 40px thumbnail of the
          same thing would be a worse copy of what is already behind it. */}
      <SubPage open={stack.includes('background')} depth={depthOf('background')} title="Background" onBack={pop}>
        <div className="settings-group">
          {GROUND_OPTIONS.map((opt) => (
            <MenuItem
              key={opt.key}
              glyph={ground === opt.key ? ICONS.check : ICONS.dot}
              label={opt.label}
              // The pinned row carries the game instead of its description once
              // there is one, because at that point the description is the row
              // above it and the game is the thing you came here to check.
              sub={opt.key === 'pinned' && pin ? pin.title || 'A game you chose' : opt.sub}
              onClick={() => changeGround(opt.key)}
              chevron={false}
            />
          ))}
        </div>

        {/* Only under `pinned`, because it is the only source whose picture is a
            choice. Offering it under the other three would imply they can be
            overridden, and then the override would silently do nothing. */}
        {ground === 'pinned' ? (
          <div className="settings-group">
            <MenuItem
              glyph={ICONS.star}
              label={pin ? 'Change game' : 'Choose a game'}
              sub={pin ? pin.title : 'Nothing pinned yet, so the background stays flat'}
              onClick={() => push('pin')}
            />
          </div>
        ) : null}

        {/* The slider is only meaningful over a photograph: the wash has no
            picture to show more or less of, and `off` has no layer at all.

            No `hint` on the Field. The scale below the track names both ends and
            the note under the page makes the measured-floor claim in full; a third
            grey paragraph between them said the same thing a third time. */}
        {isArtGround(ground) ? (
          <Field label="Intensity">
            <input
              className="settings-slider"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={intensity}
              onChange={(e) => changeIntensity(e.target.value)}
              aria-label="Background intensity"
            />
            <div className="settings-scale">
              <span>As much picture as is legible</span>
              <span>Quieter</span>
            </div>
          </Field>
        ) : null}

        <p className="settings-note">
          Over key art the background darkens itself until the smallest text on screen still
          clears the contrast bar, so how much of the picture shows depends on the picture. The
          slider starts at that measured point and only ever covers more, so no setting here can
          make the text unreadable.
        </p>
      </SubPage>

      {/* Third level, over Background. Mounted only while it is open, because it
          reads the whole library and Settings should not pay for that to show a
          list of five appearance rows. */}
      <SubPage open={stack.includes('pin')} depth={depthOf('pin')} title="Pin a game" onBack={pop}>
        <GamePinPicker pinnedId={pin ? pin.master_id : null} onPick={changePin} />
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

      <SubPage open={stack.includes('cards')} depth={depthOf('cards')} title="Card sizing" onBack={pop}>
        <Field label="Shelf posters" hint="Continue playing, Discover rails, wishlist">
          <Seg options={SHELF_SIZE_OPTIONS} value={shelfSize} onPick={changeShelfSize} name="Shelf size" />
        </Field>
        <Field label="List rows" hint="Library and Discover lists">
          <Seg options={LIST_SIZE_OPTIONS} value={listSize} onPick={changeListSize} name="List size" />
        </Field>
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
  if (!mounted) return null
  // z-index by position in the stack rather than a class per level, so a fourth
  // level is a number and not another CSS rule. Clamped at 0 so a page that is
  // mid-close (depth is already -1, because the stack popped before the exit
  // animation finished) does not fall under the root list on the way out.
  const z = 211 + Math.max(0, depth)
  return (
    <div
      className={`settings-page settings-sub${closing ? ' closing' : ''}`}
      style={{ zIndex: z }}
      role="dialog"
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
      <div className="menu-accent-label">{label}</div>
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
