import { optImg, optImgSrcSet } from './format.js'

const WIDTHS = [96, 128, 160, 192, 224, 256, 320, 384, 448, 512, 640]
const loaded = new Map()
const warmed = new Map()

export function coverImageProps(src, size = 'sm', sizes, rawFallback = false) {
  const srcSet = rawFallback ? '' : optImgSrcSet(src, WIDTHS)
  return {
    src: rawFallback ? src : optImg(src, size === 'lg' ? 480 : 224),
    srcSet: srcSet || undefined,
    sizes: srcSet ? sizes || (size === 'lg' ? '(max-width: 600px) 60vw, 240px' : '96px') : undefined,
  }
}

export function getLoadedCover(src) {
  return loaded.get(src)
}

export function rememberCover(src, rawFallback = false) {
  loaded.delete(src)
  loaded.set(src, { rawFallback })
  if (loaded.size > 256) loaded.delete(loaded.keys().next().value)
}

// Match Cover's responsive candidates so warming and rendering request the same
// file, including on high-density iPhone screens.
export function warmCover(src, sizes = '64px') {
  if (!src || typeof Image === 'undefined') return Promise.resolve()
  const key = `${src}|${sizes}`
  if (warmed.has(key)) return warmed.get(key).promise
  const img = new Image()
  const entry = { img, promise: null }
  entry.promise = new Promise((resolve) => {
    let rawFallback = getLoadedCover(src)?.rawFallback || false
    const finish = (success) => {
      clearTimeout(timer)
      img.onload = img.onerror = null
      if (success) rememberCover(src, rawFallback)
      else warmed.delete(key)
      resolve()
    }
    const setSource = () => {
      const props = coverImageProps(src, 'sm', sizes, rawFallback)
      img.sizes = props.sizes || ''
      img.srcset = props.srcSet || ''
      img.src = props.src
    }
    const timer = setTimeout(() => finish(false), 15000)
    img.onload = () => finish(true)
    img.onerror = () => {
      if (!rawFallback && coverImageProps(src).src !== src) {
        rawFallback = true
        setSource()
      } else finish(false)
    }
    img.fetchPriority = 'low'
    img.decoding = 'async'
    setSource()
  })
  warmed.set(key, entry)
  // Keep only a small number of Image objects between page visits.
  if (warmed.size > 24) warmed.delete(warmed.keys().next().value)
  return entry.promise
}
