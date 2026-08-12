import { useEffect, useRef, useState } from 'react'
import { useMountTransition } from '../lib/useMountTransition.js'
import { lockScroll } from '../lib/scrollLock.js'
import { TAB_BY_KEY, MIN_VISIBLE, getNavConfig, setNavConfig, resetNavConfig } from '../lib/navConfig.js'
import { TAB_ICONS } from './TabBar.jsx'
import './customizeRows.css'

const GRIP = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="9" cy="6" r="1.6" />
    <circle cx="15" cy="6" r="1.6" />
    <circle cx="9" cy="12" r="1.6" />
    <circle cx="15" cy="12" r="1.6" />
    <circle cx="9" cy="18" r="1.6" />
    <circle cx="15" cy="18" r="1.6" />
  </svg>
)

// Full-screen editor for the bottom tab bar: reorder tabs by dragging, toggle a
// tab off to move it into the drawer's "More" list, and switch text labels on or
// off. Saved to localStorage; the tab bar reads the same config live. Reuses the
// Settings page shell (open/close animation + edge-back).
export default function CustomizeNav({ open, onClose }) {
  const { mounted, closing } = useMountTransition(open)
  const [order, setOrder] = useState(() => getNavConfig().order)
  const [enabled, setEnabled] = useState(() => getNavConfig().enabled)
  const [labels, setLabels] = useState(() => getNavConfig().labels)
  const [dragKey, setDragKey] = useState(null)
  const itemRefs = useRef({})
  // Latest state for listeners that outlive a render.
  const live = useRef({ order, enabled, labels })
  live.current = { order, enabled, labels }

  const visibleCount = order.filter((k) => enabled[k]).length
  const atFloor = visibleCount <= MIN_VISIBLE

  // Re-sync from storage each time the page opens.
  useEffect(() => {
    if (!open) return
    const c = getNavConfig()
    setOrder(c.order)
    setEnabled(c.enabled)
    setLabels(c.labels)
  }, [open])

  function commit(next) {
    if (next.order) setOrder(next.order)
    if (next.enabled) setEnabled(next.enabled)
    if ('labels' in next) setLabels(next.labels)
    const merged = {
      order: next.order || live.current.order,
      enabled: next.enabled || live.current.enabled,
      labels: 'labels' in next ? next.labels : live.current.labels,
    }
    setNavConfig(merged)
  }

  function toggle(key) {
    const turningOff = enabled[key]
    // Enforce the visible-tab floor: block the toggle that would drop below it.
    if (turningOff && atFloor) return
    commit({ enabled: { ...enabled, [key]: !enabled[key] } })
  }

  function toggleLabels() {
    commit({ labels: !labels })
  }

  function doReset() {
    const c = resetNavConfig()
    setOrder(c.order)
    setEnabled(c.enabled)
    setLabels(c.labels)
  }

  // Close on Escape.
  useEffect(() => {
    if (!mounted) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mounted, onClose])

  // Lock background scroll while open.
  useEffect(() => {
    if (!mounted) return undefined
    return lockScroll()
  }, [mounted])

  // iOS edge-back: swipe in from the left edge to go back (disabled mid-drag).
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
      if (!tracking || dragKey) return
      const t = e.touches && e.touches[0]
      if (!t) return
      const dx = t.clientX - startX
      const dy = t.clientY - startY
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
  }, [mounted, dragKey, onClose])

  // Drag-to-reorder: while a handle is held, reorder as the pointer crosses each
  // row's midpoint, using live rects so it stays correct across re-renders.
  useEffect(() => {
    if (!dragKey) return undefined
    const move = (clientY) => {
      const cur = live.current.order
      let target = cur.length
      for (let i = 0; i < cur.length; i++) {
        const el = itemRefs.current[cur[i]]
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (clientY < r.top + r.height / 2) {
          target = i
          break
        }
      }
      const from = cur.indexOf(dragKey)
      if (from === -1 || target === from) return
      const next = cur.filter((k) => k !== dragKey)
      next.splice(target > from ? target - 1 : target, 0, dragKey)
      setOrder(next)
    }
    const onPointerMove = (e) => {
      move(e.clientY)
      if (e.cancelable) e.preventDefault()
    }
    const onTouchMove = (e) => {
      if (e.touches && e.touches[0]) move(e.touches[0].clientY)
      if (e.cancelable) e.preventDefault()
    }
    const onUp = () => {
      setDragKey(null)
      setNavConfifÈÜ™\ˆ]™K˜İ\œ™[›Ü™\‹[˜X›Yˆ]™K˜İ\œ™[™[˜X›YX™[Îˆ]™K˜İ\œ™[›X™[ÈJBˆBˆÚ[™İË˜Y]™[\İ[™\Š	ÜÚ[\›[İ™IËÛ”Ú[\“[İ™KÈ\ÜÚ]™Nˆ˜[ÙHJBˆÚ[™İË˜Y]™[\İ[™\Š	ÜÚ[\\	ËÛ•\
BˆÚ[™İË˜Y]™[\İ[™\Š	İİXÚ[İ™IËÛ•İXÚ[İ™KÈ\ÜÚ]™Nˆ˜[ÙHJBˆÚ[™İË˜Y]™[\İ[™\Š	İİXÚ[™	ËÛ•\
Bˆ™]\›ˆ

HOˆÂˆÚ[™İËœ™[[İ™Q]™[\İ[™\Š	ÜÚ[\›[İ™IËÛ”Ú[\“[İ™JBˆÚ[™İËœ™[[İ™Q]™[\İ[™\Š	ÜÚ[\\	ËÛ•\
BˆÚ[™İËœ™[[İ™Q]™[\İ[™\Š	İİXÚ[İ™IËÛ•İXÚ[İ™JBˆÚ[™İËœ™[[İ™Q]™[\İ[™\Š	İİXÚ[™	ËÛ•\
BˆBˆKÙ˜YÒÙ^WJB‚ˆYˆ
[[İ[Y
H™]\›ˆ[‚ˆ™]\›ˆ
ˆ]ˆÛ\ÜÓ˜[YO^ØÙ][™ÜË\YÙIØÛÜÚ[™ÈÈ	ÈÛÜÚ[™ÉÈˆ	ÉßXH›ÛOH™X[ÙÈˆ\šXK[X™[H“˜]šYØ][Ûˆ‚ˆ]ˆÛ\ÜÓ˜[YOHœÙ][™ÜËZ‚ˆ]Ûˆ\OH˜]ÛˆˆÛ\ÜÓ˜[YOHœÙ][™ÜËX˜XÚÈˆÛÛXÚÏ^ÛÛÛÜÙ_H\šXK[X™[H˜XÚÈ‚ˆİ™ÈšY]Ğ›ŞHŒˆš[H››Û™Hˆİ›ÚÙOH˜İ\œ™[ÛÛÜˆˆİ›ÚÙUÚYHŒ‹Œˆˆİ›ÚÙS[™XØ\Hœ›İ[™ˆİ›ÚÙS[™Z›Ú[Hœ›İ[™‚ˆ]H“LMH›MˆˆˆˆˆÏ‚ˆÜİ™Ï‚ˆØ]Û‚ˆˆÛ\ÜÓ˜[YOHœÙ][™ÜËZ]]H“˜]šYØ][ÛÚ‚ˆÙ]‚‚ˆ]ˆÛ\ÜÓ˜[YOHœÙ][™ÜËX›ÙH‚ˆ]ˆÛ\ÜÓ˜[YOH˜Ş‹[›İH‘˜YÈÈ™[Ü™\ˆ[İ\ˆXˆ˜\‹ˆÙÙÛHHXˆÙ™ˆÈ[İ™H][ÈHY[Kˆ]X\İÓRS—Õ’TÒP“_HXœÈİ^H[ˆH˜\‹Ù]‚‚ˆ]ˆÛ\ÜÓ˜[YOH˜Ş‹YÜ›İ\‚ˆÛÜ™\‹›X\

Ù^JHOˆÂˆÛÛœİY]HHP—Ğ–WÒÑVVÚÙ^WBˆYˆ
[Y]JH™]\›ˆ[ˆÛÛœİÛˆH›ÛÛX[Š[˜X›YÚÙ^WJBˆËÈ›ØÚÈÛ›HHİÚ]Ú]Ûİ[œ™XXÚH›ÛÜÈİ\œÈİ^H]™K‚ˆÛÛœİØÚÓÙ™ˆHÛˆ	‰ˆ]›ÛÜ‚ˆ™]\›ˆ
ˆ]‚ˆÙ^O^ÚÙ^_Bˆ™Y^Ê[
HOˆÂˆ][T™YœË˜İ\œ™[ÚÙ^WHH[ˆ_BˆÛ\ÜÓ˜[YO^ØŞ‹\›İÉÛÛˆÈ	ÉÈˆ	ÈÙ™‰ßIÙ˜YÒÙ^HOOHÙ^HÈ	È˜YÙÚ[™ÉÈˆ	ÉßXBˆ‚ˆÜ[‚ˆÛ\ÜÓ˜[YOH˜Ş‹YÜš\‚ˆ›ÛOH˜]Ûˆ‚ˆ\šXK[X™[^Ø™[Ü™\ˆ	ÛY]K›X™[XBˆÛ”Ú[\‘İÛ^ÊJHOˆÂˆKœ™]™[Y˜][

BˆÙ]˜YÒÙ^JÙ^JBˆ_Bˆ‚ˆÑÔ’TBˆÜÜ[‚ˆÜ[ˆÛ\ÜÓ˜[YOH˜Ş‹]X‹ZXÛÛˆˆ\šXKZY[HYH‚ˆÕP—ÒPÓÓ”ÖÚÙ^W_BˆÜÜ[‚ˆÜ[ˆÛ\ÜÓ˜[YOH˜Ş‹\›‚ˆÛY]K›X™[OØ‚ˆÛÛˆÈ[ˆÛX[’[ˆY[OÜÛX[ŸBˆÜÜ[‚ˆ]Û‚ˆ\OH˜]Ûˆ‚ˆÛ\ÜÓ˜[YO^ØŞ‹]ÙÙÛIÛÛˆÈ	ÈÛ‰Èˆ	ÉßXBˆ›ÛOHœİÚ]Ú‚ˆ\šXKXÚXÚÙY^ÛÛŸBˆ\šXK[X™[^Ø	ÛÛˆÈ	Ó[İ™HÈY[IÈˆ	ÔÚİÈ[ˆ˜\‰ßNˆ	ÛY]K›X™[XBˆÛÛXÚÏ^Ê
HOˆÙÙÛJÙ^J_Bˆ\ØX›Y^ÛØÚÓÙ™ŸBˆ‚ˆHÏ‚ˆØ]Û‚ˆÙ]‚ˆ
BˆJ_BˆÙ]‚‚ˆ]ˆÛ\ÜÓ˜[YOH˜Ş‹[›İHˆİ[O^ŞÈY[™ÕÜˆN_O\X\˜[˜ÙOÙ]‚ˆ]ˆÛ\ÜÓ˜[YOH˜Ş‹YÜ›İ\‚ˆ]ˆÛ\ÜÓ˜[YOH˜Ş‹\›İÈ‚ˆÜ[ˆÛ\ÜÓ˜[YOH˜Ş‹\›‚ˆ”ÚİÈX™[ÏØ‚ˆÛX[•^[™\ˆXXÚXˆXÛÛÜÛX[‚ˆÜÜ[‚ˆ]Û‚ˆ\OH˜]Ûˆ‚ˆÛ\ÜÓ˜[YO^ØŞ‹]ÙÙÛIÛX™[ÈÈ	ÈÛ‰Èˆ	ÉßXBˆ›ÛOHœİÚ]Ú‚ˆ\šXKXÚXÚÙY^ÛX™[ßBˆ\šXK[X™[H”ÚİÈXˆX™[È‚ˆÛÛXÚÏ^İÙÙÛSX™[ßBˆ‚ˆHÏ‚ˆØ]Û‚ˆÙ]‚ˆÙ]‚‚ˆ]Ûˆ\OH˜]ÛˆˆÛ\ÜÓ˜[YOH˜Ş‹\™\Ù]ˆÛÛXÚÏ^ÙÔ™\Ù]O‚ˆ™\Ù]ÈY˜][ˆØ]Û‚ˆÙ]‚ˆÙ]‚ˆ
BŸB